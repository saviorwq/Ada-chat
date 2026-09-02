<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 后台 Demucs 分轨任务（CLI: php run_stems_worker.php <stem_job_id>）
 */
$workspaceRoot = dirname(__DIR__, 2);
require_once $workspaceRoot . DIRECTORY_SEPARATOR . 'ai_config.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'http.php';

require_once __DIR__ . '/stems_jobs.php';
require_once __DIR__ . '/stems.php';

@ini_set('max_execution_time', '0');
@set_time_limit(0);

$jobId = $argv[1] ?? '';
if ($jobId === '') {
    fwrite(STDERR, "missing job id\n");
    exit(1);
}

$job = adachat_music_stems_load_job($jobId);
if (!$job) {
    fwrite(STDERR, "job not found\n");
    exit(1);
}

$job['status'] = 'processing';
$job['progress'] = 5;
$job['hint'] = '准备 Demucs…';
adachat_music_stems_save_job($job);

$result = adachat_music_stems_process_job($job);
$job = adachat_music_stems_load_job($jobId) ?: $job;

if (!empty($result['ok'])) {
    $job['status'] = 'completed';
    $job['progress'] = 100;
    $job['zip_file'] = (string) ($result['zip_file'] ?? '');
    $job['error'] = '';
    $job['hint'] = '多轨 ZIP 已就绪（WAV，可导入 DAW）';
} else {
    $job['status'] = 'failed';
    $job['progress'] = 100;
    $err = (string) ($result['error'] ?? 'unknown_error');
    if (!empty($result['hint'])) {
        $err .= ' | ' . $result['hint'];
    }
    $job['error'] = $err;
    $job['hint'] = (string) ($result['hint'] ?? '');
}

adachat_music_stems_save_job($job);
exit($job['status'] === 'completed' ? 0 : 1);
