<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../server_control.php';
require_once __DIR__ . '/paths.php';

/**
 * 后台启动文生图 worker（必须真正脱离，且工作目录为仓库根）
 * Spawn image worker detached with workspace as cwd
 */
function adachat_image_spawn_worker(string $jobId): bool
{
    if (!adachat_is_exec_available()) {
        return false;
    }
    $worker = adachat_image_worker_script_path();
    if (!is_file($worker)) {
        return false;
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
        // 注意：不要用 exec('cmd /c start ...')——部分环境下会一直等到子进程结束，网页就会“卡住且显存为0”
        // Avoid exec(start): it may wait for the child; UI then stays queued with no VRAM use.
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
        if (is_resource($handle)) {
            @pclose($handle);
        }
        @file_put_contents(
            $spawnLog,
            date('c') . " popen_start ok job={$jobId} cmd={$cmd}\n",
            FILE_APPEND
        );
        return is_resource($handle) || true;
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
