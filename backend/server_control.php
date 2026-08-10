<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 本机服务控制（模块化）
 * Local server control helpers (module)
 */

function adachat_is_exec_available(): bool
{
    if (!function_exists('exec')) {
        return false;
    }
    $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
    return !in_array('exec', $disabled, true);
}

function adachat_llama_vulkan_dir(): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'llama-vulkan';
}

function adachat_llama_quit_sentinel_path(): string
{
    return adachat_llama_vulkan_dir() . DIRECTORY_SEPARATOR . '.adachat-user-quit';
}

/**
 * Windows: start a process detached (does not wait).
 * 用临时 ps1 + Start-Process，避免 exec("start /B …") 阻塞到 ensure-llama 结束，拖死 PHP 单线程。
 *
 * @return array{ok: bool, error?: string, cmd?: string}
 */
function adachat_win_start_detached(string $exe, string $args): array
{
    if (!adachat_is_exec_available()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }
    if (stripos(PHP_OS, 'WIN') !== 0) {
        return ['ok' => false, 'error' => 'windows_only'];
    }
    if (!is_file($exe)) {
        return ['ok' => false, 'error' => 'exe_missing'];
    }

    $ps = adachat_win_powershell_exe();
    if (!is_file($ps)) {
        $exeQ = '"' . str_replace('"', '', $exe) . '"';
        $cmd = 'start "" /B ' . $exeQ . ' ' . $args;
        @exec($cmd, $out, $code);
        return ['ok' => true, 'cmd' => $cmd, 'fallback' => 'start_b'];
    }

    $tmp = tempnam(sys_get_temp_dir(), 'adachat_det_');
    if ($tmp === false) {
        return ['ok' => false, 'error' => 'tmp_failed'];
    }
    $tmpPs1 = $tmp . '.ps1';
    @rename($tmp, $tmpPs1);

    $exeLit = str_replace("'", "''", $exe);
    $argLit = str_replace("'", "''", $args);
    $script =
        "Start-Process -FilePath '" .
        $exeLit .
        "' -ArgumentList '" .
        $argLit .
        "' -WindowStyle Hidden\r\n" .
        "Start-Sleep -Milliseconds 200\r\n" .
        "Remove-Item -LiteralPath '" .
        str_replace("'", "''", $tmpPs1) .
        "' -Force -ErrorAction SilentlyContinue\r\n";
    if (@file_put_contents($tmpPs1, $script) === false) {
        return ['ok' => false, 'error' => 'tmp_write_failed'];
    }

    $fileArg = '"' . str_replace('"', '', $tmpPs1) . '"';
    $cmd =
        '"' .
        str_replace('"', '', $ps) .
        '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ' .
        $fileArg;
    @exec($cmd, $out, $code);
    return [
        'ok' => true,
        'cmd' => $cmd,
        'code' => $code,
        'tmp_script' => $tmpPs1,
    ];
}

function adachat_win_powershell_exe(): string
{
    $sysRoot = (string) (getenv('SystemRoot') ?: 'C:\\Windows');
    return $sysRoot . '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
}

/**
 * 立即停止 llama-server，释放 GPU 显存（同步）
 * Stop llama-server immediately to free GPU VRAM (synchronous)
 *
 * @return array{ok: bool, error?: string, killed?: bool, code?: int, out?: array<int, string>}
 */
function adachat_stop_llama_server_now(): array
{
    if (!adachat_is_exec_available()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }

    // 退出哨兵：短时间内阻止 ensure 抢先把服务再拉起来
    // Quit sentinel: briefly block ensure from restarting the server
    $dir = adachat_llama_vulkan_dir();
    if (is_dir($dir)) {
        @file_put_contents(adachat_llama_quit_sentinel_path(), (string) time());
    }

    if (stripos(PHP_OS, 'WIN') !== 0) {
        @exec('pkill -f llama-server 2>/dev/null', $out, $code);
        return ['ok' => true, 'code' => $code ?? -1, 'out' => $out ?? []];
    }

    $out = [];
    $code = -1;
    // /T = 结束子进程树，避免显存残留 / kill process tree so VRAM can release
    @exec('taskkill /F /T /IM llama-server.exe 2>&1', $out, $code);

    $ps = adachat_win_powershell_exe();
    $stopPs1 = adachat_llama_vulkan_dir() . DIRECTORY_SEPARATOR . 'stop-llama-vulkan.ps1';
    if (is_file($ps) && is_file($stopPs1)) {
        $psOut = [];
        $psCode = -1;
        // 同步执行停止脚本并等待进程消失 / run stop script sync and wait until gone
        $psCmd =
            '"' .
            str_replace('"', '', $ps) .
            '" -NoProfile -ExecutionPolicy Bypass -File "' .
            str_replace('"', '', $stopPs1) .
            '"';
        @exec($psCmd . ' 2>&1', $psOut, $psCode);
        return [
            'ok' => ($psCode === 0 || $psCode === 128 || $code === 0 || $code === 128),
            'killed' => $psCode === 0 || $code === 0,
            'code' => $psCode,
            'out' => array_merge($out, $psOut),
            'taskkill_code' => $code,
        ];
    }

    if (is_file($ps)) {
        $psOut = [];
        $psCode = -1;
        $psCmd =
            '"' .
            str_replace('"', '', $ps) .
            '" -NoProfile -ExecutionPolicy Bypass -Command ' .
            '"Get-Process -Name \'llama-server\' -ErrorAction SilentlyContinue | Stop-Process -Force; ' .
            'Start-Sleep -Milliseconds 800; ' .
            'if (Get-Process -Name \'llama-server\' -ErrorAction SilentlyContinue) { exit 2 } else { exit 0 }"';
        @exec($psCmd . ' 2>&1', $psOut, $psCode);
        if ($psCode === 0 || $psCode === 2) {
            return [
                'ok' => $psCode === 0,
                'killed' => $code === 0 || $psCode === 0,
                'code' => $psCode,
                'out' => array_merge($out, $psOut),
                'taskkill_code' => $code,
            ];
        }
    }

    // 0 = killed, 128 = process not found（也算成功释放）
    $ok = ($code === 0 || $code === 128);
    return [
        'ok' => $ok,
        'killed' => $code === 0,
        'code' => $code,
        'out' => $out,
    ];
}

/**
 * Schedule full stop after response is sent (llama again + php).
 * 先同步杀 llama 释显存，再延迟执行 stop.bat / Kill llama sync for VRAM, then delayed stop.bat
 *
 * @return array{ok: bool, error?: string, cmd?: string, llama?: array<string, mixed>}
 */
function adachat_schedule_stop_server(): array
{
    if (!adachat_is_exec_available()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }

    // 关键：立刻停 GPU 服务，不等延迟脚本 / Critical: free VRAM now, don't wait for delayed bat
    $llama = adachat_stop_llama_server_now();

    $stopBat = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'stop.bat';
    $stopBatReal = is_file($stopBat) ? (string) realpath($stopBat) : $stopBat;
    if (!is_file($stopBatReal)) {
        return ['ok' => (bool) ($llama['ok'] ?? false), 'error' => 'stop_bat_missing', 'llama' => $llama];
    }

    if (stripos(PHP_OS, 'WIN') === 0) {
        $ps = adachat_win_powershell_exe();
        if (!is_file($ps)) {
            // 回退：旧 cmd 调度（路径含空格时可能失败）
            $bat = str_replace('"', '""', $stopBatReal);
            $cmd = 'start "" /B cmd /c "ping 127.0.0.1 -n 4 >nul & ""' . $bat . '"""';
            @exec($cmd, $out, $code);
            return ['ok' => true, 'cmd' => $cmd, 'llama' => $llama];
        }

        // 写入临时脚本再异步执行，避免路径空格/引号嵌套失败
        // Write a temp script then run detached (spaces-safe)
        $batLit = str_replace("'", "''", $stopBatReal);
        $tmp = tempnam(sys_get_temp_dir(), 'adachat_stop_');
        if ($tmp === false) {
            return ['ok' => (bool) ($llama['ok'] ?? false), 'error' => 'tmp_failed', 'llama' => $llama];
        }
        $tmpPs1 = $tmp . '.ps1';
        @rename($tmp, $tmpPs1);
        $script =
            "Start-Sleep -Seconds 3\r\n" .
            "Start-Process -FilePath 'taskkill.exe' -ArgumentList '/F','/T','/IM','llama-server.exe' -WindowStyle Hidden -Wait\r\n" .
            "Start-Process -FilePath '" .
            $batLit .
            "' -WindowStyle Hidden\r\n";
        @file_put_contents($tmpPs1, $script);
        $fileArg = '"' . str_replace('"', '', $tmpPs1) . '"';
        $args = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ' . $fileArg;
        $detached = adachat_win_start_detached($ps, $args);
        return [
            'ok' => (bool) ($llama['ok'] ?? false) || (bool) ($detached['ok'] ?? false),
            'cmd' => $detached['cmd'] ?? '',
            'llama' => $llama,
            'delayed' => $detached,
            'tmp_script' => $tmpPs1,
        ];
    }

    $cmd = 'sh -c ' . escapeshellarg('sleep 1; ' . escapeshellarg($stopBatReal) . ' >/dev/null 2>&1 &');
    @exec($cmd, $out, $code);
    return ['ok' => true, 'cmd' => $cmd, 'llama' => $llama];
}

/**
 * 启动时 ensure 本机后台服务（llama-server Vulkan，若已健康则跳过）
 * On app start: ensure local background llama-server (no-op if healthy)
 *
 * @return array{ok: bool, error?: string, cmd?: string, skipped?: bool}
 */
function adachat_schedule_ensure_local_services(): array
{
    if (!adachat_is_exec_available()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }
    if (stripos(PHP_OS, 'WIN') !== 0) {
        return ['ok' => false, 'error' => 'windows_only', 'skipped' => true];
    }
    $dir = adachat_llama_vulkan_dir();
    $ensure = $dir . DIRECTORY_SEPARATOR . 'ensure-llama-vulkan.ps1';
    $server = $dir . DIRECTORY_SEPARATOR . 'llama-server.exe';
    if (!is_file($ensure) || !is_file($server)) {
        return ['ok' => false, 'error' => 'llama_vulkan_missing', 'skipped' => true];
    }

    // 用户再次进入应用：清除退出哨兵，允许拉起后台
    // User re-entered the app: clear quit sentinel so background may start
    $sentinel = adachat_llama_quit_sentinel_path();
    if (is_file($sentinel)) {
        @unlink($sentinel);
    }

    $ps = adachat_win_powershell_exe();
    $fileArg = '"' . str_replace('"', '', $ensure) . '"';
    $args = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ' . $fileArg;
    return adachat_win_start_detached($ps, $args);
}
