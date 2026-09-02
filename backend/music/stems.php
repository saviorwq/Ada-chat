<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/stems_jobs.php';
require_once __DIR__ . '/stems_paths.php';
require_once __DIR__ . '/../server_control.php';

/**
 * Ada 精简 PATH 下补回 System32，避免 Demucs/torch 报 WinError 10106（_overlapped）
 * Restore System32 on PATH so Winsock loads under Ada's trimmed environment
 */
function adachat_music_stems_fix_path(): void
{
    if (stripos(PHP_OS, 'WIN') !== 0) {
        return;
    }
    $sys = (string) (getenv('SystemRoot') ?: 'C:\\Windows');
    $py = adachat_music_stems_python();
    $scripts = $py !== '' ? dirname($py) : '';
    $front = [
        $sys . '\\System32',
        $sys,
        $sys . '\\System32\\Wbem',
        $sys . '\\System32\\WindowsPowerShell\\v1.0',
    ];
    if ($scripts !== '' && is_dir($scripts)) {
        $front[] = $scripts;
    }
    $old = (string) (getenv('PATH') ?: '');
    $parts = [];
    $seen = [];
    foreach (array_merge($front, explode(';', $old)) as $p) {
        $p = trim((string) $p);
        if ($p === '') {
            continue;
        }
        $k = strtolower($p);
        if (isset($seen[$k])) {
            continue;
        }
        $seen[$k] = true;
        $parts[] = $p;
    }
    $newPath = implode(';', $parts);
    @putenv('PATH=' . $newPath);
    $_ENV['PATH'] = $newPath;
    $_SERVER['PATH'] = $newPath;
}

/**
 * 通过独立 PowerShell 跑 Demucs（干净环境，脱离 Ada Job/精简 PATH）
 * @return array{code:int,out:string}
 */
function adachat_music_stems_run_demucs_ps1(
    string $py,
    string $script,
    string $source,
    string $zipFile,
    string $workDir,
    string $statusFile,
    string $model,
    string $device
): array {
    adachat_music_stems_fix_path();
    $logDir = adachat_music_stems_jobs_dir();
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $ps1 = $workDir . DIRECTORY_SEPARATOR . '_run_demucs.ps1';

    $sys = (string) (getenv('SystemRoot') ?: 'C:\\Windows');
    $scripts = dirname($py);
    $lit = static function (string $s): string {
        return str_replace("'", "''", $s);
    };

    // 直接 & python，避免 Start-Process ArgumentList 吞引号
    // Call python directly — ArgumentList string quoting is unreliable
    $body =
        "\$sys = '" . $lit($sys) . "'\r\n" .
        "\$env:Path = \"\$sys\\System32;\$sys;\$sys\\System32\\Wbem;\$sys\\System32\\WindowsPowerShell\\v1.0;"
        . $lit($scripts) . ";\" + \$env:Path\r\n" .
        "\$env:NO_PROXY = '127.0.0.1,localhost'\r\n" .
        "\$env:PYTHONUTF8 = '1'\r\n" .
        "Set-Location -LiteralPath '" . $lit(dirname($script)) . "'\r\n" .
        "& '" . $lit($py) . "' "
        . "'" . $lit($script) . "' "
        . "--input '" . $lit($source) . "' "
        . "--zip '" . $lit($zipFile) . "' "
        . "--work-dir '" . $lit($workDir) . "' "
        . "--status-file '" . $lit($statusFile) . "' "
        . "--model '" . $lit($model) . "' "
        . "--device '" . $lit($device) . "' "
        . "--jobs 2\r\n"
        . "exit \$LASTEXITCODE\r\n";
    @file_put_contents($ps1, $body);

    $ps = function_exists('adachat_win_powershell_exe')
        ? adachat_win_powershell_exe()
        : $sys . '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

    $cmd = escapeshellarg($ps)
        . ' -NoProfile -ExecutionPolicy Bypass -File '
        . escapeshellarg($ps1);

    $out = [];
    $code = 1;
    @exec($cmd . ' 2>&1', $out, $code);

    $joined = implode("\n", $out);
    return ['code' => (int) $code, 'out' => $joined];
}

/**
 * 运行 Demucs 分轨并打包 ZIP
 * @return array{ok:bool,zip_file?:string,error?:string,hint?:string}
 */
function adachat_music_stems_process_job(array $job): array
{
    adachat_music_stems_ensure_dirs();
    adachat_music_stems_fix_path();

    $source = (string) ($job['source_file'] ?? '');
    if ($source === '' || !is_file($source)) {
        return ['ok' => false, 'error' => 'source_missing', 'hint' => '找不到源音乐文件，请先完成整曲生成'];
    }

    $py = adachat_music_stems_python();
    $script = adachat_music_stems_script_path();
    if ($py === '' || !is_file($py)) {
        return [
            'ok' => false,
            'error' => 'demucs_python_missing',
            'hint' => '请运行 tools/demucs/setup.ps1 安装 Demucs（tools/demucs/.venv）',
        ];
    }
    if (!is_file($script)) {
        return ['ok' => false, 'error' => 'stems_script_missing', 'hint' => $script];
    }

    $jobId = (string) ($job['id'] ?? 'stem');
    $safeId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $jobId) ?: 'stem';
    $workDir = adachat_music_stems_jobs_dir() . DIRECTORY_SEPARATOR . '_work_' . $safeId;
    $zipFile = adachat_music_stems_output_dir() . DIRECTORY_SEPARATOR . $safeId . '.zip';
    $statusFile = $workDir . DIRECTORY_SEPARATOR . 'status.json';
    if (!is_dir($workDir)) {
        @mkdir($workDir, 0755, true);
    }

    $model = trim((string) ($job['model'] ?? 'htdemucs')) ?: 'htdemucs';
    $device = trim((string) ($job['device'] ?? 'cpu')) ?: 'cpu';
    $envDevice = trim((string) (getenv('ADACHAT_DEMUCS_DEVICE') ?: ''));
    if ($envDevice !== '') {
        $device = $envDevice;
    }

    $job['hint'] = 'Demucs 分轨中（CPU，可能需数分钟）…';
    $job['progress'] = 15;
    adachat_music_stems_save_job($job);

    $code = 1;
    $joined = '';
    if (stripos(PHP_OS, 'WIN') === 0) {
        $run = adachat_music_stems_run_demucs_ps1(
            $py,
            $script,
            $source,
            $zipFile,
            $workDir,
            $statusFile,
            $model,
            $device
        );
        $code = (int) ($run['code'] ?? 1);
        $joined = (string) ($run['out'] ?? '');
    } else {
        $cmd = escapeshellarg($py)
            . ' ' . escapeshellarg($script)
            . ' --input ' . escapeshellarg($source)
            . ' --zip ' . escapeshellarg($zipFile)
            . ' --work-dir ' . escapeshellarg($workDir)
            . ' --status-file ' . escapeshellarg($statusFile)
            . ' --model ' . escapeshellarg($model)
            . ' --device ' . escapeshellarg($device)
            . ' --jobs 2';
        $out = [];
        @exec($cmd . ' 2>&1', $out, $code);
        $joined = implode("\n", $out);
    }

    $parsed = null;
    foreach (array_reverse(preg_split("/\r\n|\n|\r/", $joined) ?: []) as $line) {
        $line = trim((string) $line);
        if ($line !== '' && ($line[0] === '{' || $line[0] === '[')) {
            $tmp = json_decode($line, true);
            if (is_array($tmp)) {
                $parsed = $tmp;
                break;
            }
        }
    }
    if (!$parsed && is_file($statusFile)) {
        $tmp = json_decode((string) file_get_contents($statusFile), true);
        if (is_array($tmp)) {
            $parsed = $tmp;
        }
    }

    if ($code === 0 && is_file($zipFile)) {
        return [
            'ok' => true,
            'zip_file' => $zipFile,
            'model' => $model,
            'device' => $device,
        ];
    }

    $err = is_array($parsed) ? (string) ($parsed['error'] ?? '') : '';
    if ($err === '') {
        $err = $joined !== '' ? substr($joined, -1500) : 'demucs_exit_' . $code;
    }
    $hint = '确认已安装 Demucs（tools/demucs/setup.ps1）且本机有 ffmpeg';
    if (stripos($err, '10106') !== false || stripos($err, '_overlapped') !== false) {
        $hint = 'Windows 网络组件加载失败（Ada PATH）。已改为独立 PowerShell 启动；请重试一次导出多轨';
    } elseif (stripos($err, 'demucs_python') !== false || stripos($err, 'No module named') !== false) {
        $hint = '请重新运行 tools/demucs/setup.ps1';
    } elseif (stripos($err, 'ffmpeg') !== false) {
        $hint = '请安装 ffmpeg 并加入 PATH';
    }

    return ['ok' => false, 'error' => $err, 'hint' => $hint];
}

function adachat_music_stems_spawn_worker(string $jobId): bool
{
    if (!adachat_is_exec_available()) {
        return false;
    }
    $worker = adachat_music_stems_worker_script_path();
    if (!is_file($worker)) {
        return false;
    }
    $workspace = dirname(__DIR__, 2);
    $php = $workspace . DIRECTORY_SEPARATOR . 'php' . DIRECTORY_SEPARATOR . 'php.exe';
    if (!is_file($php)) {
        $php = is_file((string) PHP_BINARY) ? (string) PHP_BINARY : 'php';
    }

    $logDir = adachat_music_stems_jobs_dir();
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $spawnLog = $logDir . DIRECTORY_SEPARATOR . '_worker_spawn.log';

    if (stripos(PHP_OS, 'WIN') === 0) {
        $title = 'adachat_stems';
        $cmd =
            'start "' .
            $title .
            '" /D "' .
            str_replace('"', '', $workspace) .
            '" /B "' .
            str_replace('"', '', $php) .
            '" -d max_execution_time=0 "' .
            str_replace('"', '', $worker) .
            '" "' .
            str_replace('"', '', $jobId) .
            '"';
        $handle = @popen($cmd, 'r');
        $ok = is_resource($handle);
        if ($ok) {
            @pclose($handle);
        }
        @file_put_contents(
            $spawnLog,
            date('c') . " job={$jobId} via=popen_start ok=" . ($ok ? '1' : '0') . " cmd={$cmd}\n",
            FILE_APPEND
        );
        return true;
    }

    $cmd =
        'cd ' .
        escapeshellarg($workspace) .
        ' && ' .
        escapeshellarg($php) .
        ' -d max_execution_time=0 ' .
        escapeshellarg($worker) .
        ' ' .
        escapeshellarg($jobId) .
        ' > /dev/null 2>&1 &';
    @exec($cmd);
    return true;
}
