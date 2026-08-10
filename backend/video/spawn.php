<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../server_control.php';
require_once __DIR__ . '/paths.php';

function adachat_video_spawn_worker(string $jobId): bool
{
    if (!adachat_is_exec_available()) {
        return false;
    }
    $worker = adachat_video_worker_script_path();
    if (!is_file($worker)) {
        return false;
    }
    $php = PHP_BINARY;
    if (!is_file($php)) {
        $php = 'php';
    }
    $jobArg = escapeshellarg($jobId);
    $workerArg = escapeshellarg($worker);

    if (stripos(PHP_OS, 'WIN') === 0) {
        $cmd = 'start "" /B ' . escapeshellarg($php) . ' ' . $workerArg . ' ' . $jobArg;
        @pclose(@popen($cmd, 'r'));
        return true;
    }
    $cmd = escapeshellarg($php) . ' ' . $workerArg . ' ' . $jobArg . ' > /dev/null 2>&1 &';
    @exec($cmd);
    return true;
}
