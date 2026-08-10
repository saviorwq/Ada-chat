<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 后台处理单个视频任务（CLI: php run_worker.php <job_id>）
 */
$workspaceRoot = dirname(__DIR__, 2);
require_once $workspaceRoot . DIRECTORY_SEPARATOR . 'ai_config.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'http.php';

require_once __DIR__ . '/jobs.php';
require_once __DIR__ . '/cloud.php';
require_once __DIR__ . '/local.php';
require_once __DIR__ . '/../providers.php';

$jobId = $argv[1] ?? '';
if ($jobId === '') {
    fwrite(STDERR, "missing job id\n");
    exit(1);
}

$job = adachat_video_load_job($jobId);
if (!$job) {
    fwrite(STDERR, "job not found\n");
    exit(1);
}

$job['status'] = 'processing';
$job['progress'] = 10;
adachat_video_save_job($job);

$provider = adachat_find_provider((string) ($job['provider_id'] ?? ''));
if (!$provider) {
    $job['status'] = 'failed';
    $job['error'] = '供应商不存在';
    adachat_video_save_job($job);
    exit(1);
}

$mode = (string) ($job['mode'] ?? 'cloud');
$result = $mode === 'local'
    ? adachat_video_process_local_job($job, $provider)
    : adachat_video_process_cloud_job($job, $provider);

if (!empty($result['ok'])) {
    $job['status'] = 'completed';
    $job['progress'] = 100;
    $job['video_url'] = (string) ($result['video_url'] ?? '');
    $job['local_file'] = (string) ($result['local_file'] ?? '');
    $job['error'] = '';
} else {
    $job['status'] = 'failed';
    $job['progress'] = 100;
    $job['error'] = (string) ($result['error'] ?? 'unknown_error');
}

adachat_video_save_job($job);
exit($job['status'] === 'completed' ? 0 : 1);
