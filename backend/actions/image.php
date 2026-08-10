<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../image/jobs.php';
require_once __DIR__ . '/../json.php';

function adachat_handle_image_actions(string $action): bool
{
    if ($action === 'image_job_status') {
        $id = (string) ($_GET['id'] ?? $_GET['job_id'] ?? '');
        $job = adachat_image_load_job($id);
        if (!$job) {
            adachat_json(['success' => false, 'error' => '任务不存在'], 404);
        }
        $stale = adachat_image_job_is_stale($job);
        if ($stale && in_array((string) ($job['status'] ?? ''), ['queued', 'processing'], true)) {
            $job['status'] = 'failed';
            $job['error'] = '任务超时无响应，请检查 PHP exec / Python 依赖（requirements-local-image.txt）';
            adachat_image_save_job($job);
        }
        $publicUrl = adachat_image_public_url_for_job($job);
        adachat_json([
            'success' => true,
            'job_id' => $job['id'],
            'status' => $job['status'],
            'progress' => (int) ($job['progress'] ?? 0),
            'mode' => $job['mode'] ?? 'local',
            'image_url' => $publicUrl,
            'error' => $job['error'] ?? '',
            'stale' => $stale,
            'message' => adachat_image_status_message($job),
        ]);
    }

    if ($action === 'image_file') {
        $id = (string) ($_GET['id'] ?? '');
        $job = adachat_image_load_job($id);
        if (!$job || empty($job['local_file']) || !is_file($job['local_file'])) {
            http_response_code(404);
            echo 'Not found';
            exit;
        }
        $path = (string) $job['local_file'];
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $ctype = $ext === 'jpg' || $ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        header('Content-Type: ' . $ctype);
        header('Content-Length: ' . (string) filesize($path));
        readfile($path);
        exit;
    }

    return false;
}

function adachat_image_status_message(array $job): string
{
    $status = (string) ($job['status'] ?? '');
    switch ($status) {
        case 'queued':
            return '图片排队中…';
        case 'processing':
            return '图片生成中…';
        case 'completed':
            return '图片生成完成';
        case 'failed':
            return '生成失败：' . (string) ($job['error'] ?? '');
        default:
            return $status;
    }
}
