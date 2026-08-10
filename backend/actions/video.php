<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../video/jobs.php';
require_once __DIR__ . '/../json.php';

function adachat_handle_video_actions(string $action): bool
{
    if ($action === 'video_job_status') {
        $id = (string) ($_GET['id'] ?? $_GET['job_id'] ?? '');
        $job = adachat_video_load_job($id);
        if (!$job) {
            adachat_json(['success' => false, 'error' => '任务不存在'], 404);
        }
        $stale = adachat_video_job_is_stale($job);
        if ($stale && in_array((string) ($job['status'] ?? ''), ['queued', 'processing'], true)) {
            $job['status'] = 'failed';
            $job['error'] = '任务超时无响应，请检查 PHP exec 是否可用或查看后台 worker 日志';
            adachat_video_save_job($job);
        }
        $publicUrl = adachat_video_public_url_for_job($job);
        adachat_json([
            'success' => true,
            'job_id' => $job['id'],
            'status' => $job['status'],
            'progress' => (int) ($job['progress'] ?? 0),
            'mode' => $job['mode'] ?? 'cloud',
            'video_url' => $publicUrl,
            'error' => $job['error'] ?? '',
            'stale' => $stale,
            'message' => adachat_video_status_message($job),
        ]);
    }

    if ($action === 'video_file') {
        $id = (string) ($_GET['id'] ?? '');
        $job = adachat_video_load_job($id);
        if (!$job || empty($job['local_file']) || !is_file($job['local_file'])) {
            http_response_code(404);
            echo 'Not found';
            exit;
        }
        header('Content-Type: video/mp4');
        header('Content-Length: ' . (string) filesize($job['local_file']));
        readfile($job['local_file']);
        exit;
    }

    return false;
}

function adachat_video_status_message(array $job): string
{
    $status = (string) ($job['status'] ?? '');
    switch ($status) {
        case 'queued':
            return '排队中…';
        case 'processing':
            return '生成中…';
        case 'completed':
            return '视频生成完成';
        case 'failed':
            return '生成失败：' . (string) ($job['error'] ?? '');
        default:
            return $status;
    }
}
