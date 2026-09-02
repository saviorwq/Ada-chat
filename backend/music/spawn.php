<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../server_control.php';
require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/acestep.php';
require_once __DIR__ . '/jobs.php';

/**
 * 等 worker 真正跑起来（看 alive 标记或 job 变为 processing）
 * Wait until worker is really alive (marker file or job status=processing)
 */
function adachat_music_spawn_worker_wait_alive(string $jobId, string $aliveFile, float $waitSec = 8.0): bool
{
    $deadline = microtime(true) + max(1.0, $waitSec);
    while (microtime(true) < $deadline) {
        usleep(300000);
        if (is_file($aliveFile)) {
            return true;
        }
        $job = adachat_music_load_job($jobId);
        if (is_array($job) && (string) ($job['status'] ?? '') === 'processing') {
            return true;
        }
    }
    return is_file($aliveFile);
}

/**
 * schtasks /TR 的 .cmd 必须放在无空格路径
 * （G:\AdaChat Backup\... 会被截断成 Backup\... 导致 create 失败）
 * Place schtasks /TR .cmd on a path without spaces
 */
function adachat_music_spawn_worker_cmd_dir(): string
{
    // ACE 安装路径通常无空格（如 D:\ACE-Step\...）
    if (function_exists('adachat_music_acestep_root')) {
        $root = adachat_music_acestep_root();
        if (is_string($root) && $root !== '' && strpos($root, ' ') === false) {
            $dir = $root . DIRECTORY_SEPARATOR . 'logs';
            if (!is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }
            if (is_dir($dir)) {
                return $dir;
            }
        }
    }
    $sysTemp = (string) (getenv('SystemRoot') ?: 'C:\\Windows') . '\\Temp';
    if (is_dir($sysTemp) && strpos($sysTemp, ' ') === false) {
        return $sysTemp;
    }
    $tmp = (string) sys_get_temp_dir();
    return $tmp !== '' ? $tmp : '.';
}

/**
 * 后台启动 music worker
 *
 * 必须脱离 Ada PHP Job Object，否则 worker 内连不上 127.0.0.1:8001（release_task HTTP 0）。
 * 优先 schtasks（与 ACE 自动启动同款）；popen 会把子进程留在 Job Object 内。
 */
function adachat_music_spawn_worker(string $jobId): bool
{
    if (!adachat_is_exec_available()) {
        return false;
    }
    $worker = adachat_music_worker_script_path();
    if (!is_file($worker)) {
        return false;
    }
    $workspace = dirname(__DIR__, 2);
    $php = $workspace . DIRECTORY_SEPARATOR . 'php' . DIRECTORY_SEPARATOR . 'php.exe';
    if (!is_file($php)) {
        $php = is_file((string) PHP_BINARY) ? (string) PHP_BINARY : 'php';
    }

    $logDir = adachat_music_jobs_dir();
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $spawnLog = $logDir . DIRECTORY_SEPARATOR . '_worker_spawn.log';
    $safeId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $jobId) ?: 'job';
    $outLog = $logDir . DIRECTORY_SEPARATOR . '_worker_' . $safeId . '.log';
    $errLog = $outLog . '.err';
    $aliveFile = $logDir . DIRECTORY_SEPARATOR . '_worker_' . $safeId . '.alive';
    @unlink($aliveFile);
    @file_put_contents($outLog, '');
    @file_put_contents($errLog, '');

    if (stripos(PHP_OS, 'WIN') !== 0) {
        $cmd =
            'cd ' . escapeshellarg($workspace) . ' && ' . escapeshellarg($php)
            . ' -d max_execution_time=0 ' . escapeshellarg($worker) . ' ' . escapeshellarg($jobId)
            . ' > /dev/null 2>&1 &';
        @exec($cmd);
        @file_put_contents($spawnLog, date('c') . " job={$jobId} via=unix_bg\n", FILE_APPEND);
        return true;
    }

    if (function_exists('adachat_music_win_path_bootstrap')) {
        adachat_music_win_path_bootstrap();
    }

    $q = static fn(string $s): string => str_replace('"', '', $s);

    // .cmd：放无空格目录，避免 schtasks /TR 被空格截断
    $cmdDir = adachat_music_spawn_worker_cmd_dir();
    $cmdFile = $cmdDir . DIRECTORY_SEPARATOR . '_ada_music_worker_' . $safeId . '.cmd';
    $cmdBody =
        "@echo off\r\n" .
        "set PATH=%SystemRoot%\\System32;%SystemRoot%;%PATH%\r\n" .
        "cd /d \"" . $q($workspace) . "\"\r\n" .
        "\"" . $q($php) . "\" -d max_execution_time=0 "
        . "\"" . $q($worker) . "\" "
        . "\"" . $q($jobId) . "\" "
        . ">> \"" . $q($outLog) . "\" 2>> \"" . $q($errLog) . "\"\r\n";
    if (@file_put_contents($cmdFile, $cmdBody) === false) {
        @file_put_contents($spawnLog, date('c') . " job={$jobId} cmd_write_failed path={$cmdFile}\n", FILE_APPEND);
        return false;
    }

    // 1) schtasks：脱离 Job Object（与 ACE spawn 相同引号写法）
    $schtasks = function_exists('adachat_music_win_schtasks_exe')
        ? adachat_music_win_schtasks_exe()
        : ((string) (getenv('SystemRoot') ?: 'C:\\Windows')) . '\\System32\\schtasks.exe';
    $taskName = 'AdaChatMusicWorker';
    @exec('"' . $q($schtasks) . '" /Delete /TN "' . $taskName . '" /F 2>NUL');
    // /TR 要带一层引号；再用 escapeshellarg，与 acestep_spawn_via_win_detached 一致
    $tr = '"' . $q($cmdFile) . '"';
    $create =
        '"' . $q($schtasks) . '" /Create /TN "' . $taskName . '" /TR ' . escapeshellarg($tr)
        . ' /SC ONCE /ST 00:00 /SD 2099/01/01 /F /RL LIMITED';
    $out = [];
    $code = -1;
    @exec($create . ' 2>&1', $out, $code);
    if ($code === 0) {
        $out = [];
        $code = -1;
        @exec('"' . $q($schtasks) . '" /Run /TN "' . $taskName . '" 2>&1', $out, $code);
        $alive = ($code === 0) && adachat_music_spawn_worker_wait_alive($jobId, $aliveFile, 12.0);
        @file_put_contents(
            $spawnLog,
            date('c') . " job={$jobId} via=schtasks ok=" . ($alive ? '1' : '0')
                . ' code=' . $code . ' cmd=' . $cmdFile . "\n",
            FILE_APPEND
        );
        if ($alive) {
            return true;
        }
    } else {
        @file_put_contents(
            $spawnLog,
            date('c') . " job={$jobId} via=schtasks create_failed code={$code} cmd={$cmdFile} "
                . (function_exists('adachat_usub') ? adachat_usub(implode(' ', $out), 0, 160) : '') . "\n",
            FILE_APPEND
        );
    }

    // 2) Start-Process（UseShellExecute 常可脱离 Job Object）
    $ps = function_exists('adachat_win_powershell_exe')
        ? adachat_win_powershell_exe()
        : ((string) (getenv('SystemRoot') ?: 'C:\\Windows')) . '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    if (is_file($ps)) {
        $launchPs1 = $cmdDir . DIRECTORY_SEPARATOR . '_ada_music_start_' . $safeId . '.ps1';
        $lit = static fn(string $s): string => str_replace("'", "''", $s);
        @file_put_contents(
            $launchPs1,
            "Start-Process -FilePath '" . $lit($cmdFile) . "' -WindowStyle Hidden\r\n"
        );
        $out = [];
        $code = -1;
        @exec(
            '"' . $q($ps) . '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'
            . $q($launchPs1) . '" 2>&1',
            $out,
            $code
        );
        $alive = ($code === 0) && adachat_music_spawn_worker_wait_alive($jobId, $aliveFile, 10.0);
        @file_put_contents(
            $spawnLog,
            date('c') . " job={$jobId} via=startprocess ok=" . ($alive ? '1' : '0')
                . ' code=' . $code . "\n",
            FILE_APPEND
        );
        if ($alive) {
            return true;
        }
    }

    // 3) 最后兜底 popen（可能仍在 Job Object → release_task 易失败）
    $title = 'adachat_music';
    $cmd =
        'start "' . $title . '" /D "' . $q($workspace) . '" /B '
        . '"' . $q($php) . '" -d max_execution_time=0 '
        . '"' . $q($worker) . '" '
        . '"' . $q($jobId) . '"';
    $handle = @popen($cmd, 'r');
    $ok = is_resource($handle);
    if ($ok) {
        @pclose($handle);
    }
    $alive = $ok && adachat_music_spawn_worker_wait_alive($jobId, $aliveFile, 8.0);
    @file_put_contents(
        $spawnLog,
        date('c') . " job={$jobId} via=popen_start ok=" . ($ok ? '1' : '0')
            . ' alive=' . ($alive ? '1' : '0') . "\n",
        FILE_APPEND
    );
    return $alive;
}
