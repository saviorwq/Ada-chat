<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/paths.php';

function adachat_video_ensure_dirs(): void
{
    foreach ([adachat_video_jobs_dir(), adachat_video_output_dir()] as $dir) {
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
    }
}

function adachat_video_job_file(string $jobId): string
{
    $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '', $jobId);
    return adachat_video_jobs_dir() . DIRECTORY_SEPARATOR . $safe . '.json';
}

function adachat_video_create_job(array $payload): array
{
    adachat_video_ensure_dirs();
    $id = 'vid_' . bin2hex(random_bytes(8));
    $job = array_merge([
        'id' => $id,
        'status' => 'queued',
        'progress' => 0,
        'created_at' => date('c'),
        'updated_at' => date('c'),
        'video_url' => '',
        'local_file' => '',
        'error' => '',
    ], $payload);
    adachat_video_save_job($job);
    return $job;
}

function adachat_video_save_job(array $job): bool
{
    $id = (string) ($job['id'] ?? '');
    if ($id === '') {
        return false;
    }
    $job['updated_at'] = date('c');
    $file = adachat_video_job_file($id);
    return file_put_contents($file, json_encode($job, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false;
}

function adachat_video_load_job(string $jobId): ?array
{
    $file = adachat_video_job_file($jobId);
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode((string) file_get_contents($file), true);
    return is_array($data) ? $data : null;
}

function adachat_video_public_url_for_job(array $job): string
{
    if (!empty($job['video_url'])) {
        return (string) $job['video_url'];
    }
    if (!empty($job['local_file'])) {
        return 'ai_proxy.php?action=video_file&id=' . urlencode((string) $job['id']);
    }
    return '';
}

/** 任务长时间无更新视为 stale（worker 未启动或进程卡死） */
function adachat_video_job_is_stale(array $job, int $maxMinutes = 20): bool
{
    $status = (string) ($job['status'] ?? '');
    if ($status === 'completed' || $status === 'failed') {
        return false;
    }
    $ts = strtotime((string) ($job['updated_at'] ?? $job['created_at'] ?? ''));
    if ($ts === false) {
        return false;
    }
    return (time() - $ts) > ($maxMinutes * 60);
}
