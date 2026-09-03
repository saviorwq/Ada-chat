<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../server_control.php';
require_once __DIR__ . '/paths.php';

/**
 * 后台启动文生图 worker（必须真正脱离，且工作目录为仓库根）
 * Spawn image worker detached with workspace as cwd
 *
 * @return array{ok: bool, error?: string}
 */
function adachat_image_spawn_worker_result(string $jobId): array
{
    if (!adachat_is_exec_available()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }
    $worker = adachat_image_worker_script_path();
    if (!is_file($worker)) {
        return ['ok' => false, 'error' => 'worker_script_missing'];
    }
    $workspace = dirname(__DIR__, 2);
    $php = $workspace . DIRECTORY_SEPARATOR . 'php' . DIRECTORY_SEPARATOR . 'php.exe';
    if (!is_file($php)) {
        $php = is_file((string) PHP_BINARY) ? (string) PHP_BINARY : 'php';
    }

    $logDir = adachat_image_jobs_dir();
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $spawnLog = $logDir . DIRECTORY_SEPARATOR . '_spawn.log';

    if (stripos(PHP_OS, 'WIN') === 0) {
        // 注意：不要用 exec('cmd /c start ...')——部分环境下会一直等到子进程结束
        $title = 'adachat_img';
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
            date('c') . ' popen_start ok=' . ($ok ? '1' : '0') . " job={$jobId}\n",
            FILE_APPEND
        );
        return $ok
            ? ['ok' => true]
            : ['ok' => false, 'error' => 'spawn_failed'];
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
    return ['ok' => true];
}

/** @deprecated 使用 adachat_image_spawn_worker_result */
function adachat_image_spawn_worker(string $jobId): bool
{
    $r = adachat_image_spawn_worker_result($jobId);
    return !empty($r['ok']);
}
