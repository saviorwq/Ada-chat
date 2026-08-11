<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Local Runtime Manager — 聚合近期任务
 * List recent image / video jobs
 */

require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/../image/jobs.php';
require_once __DIR__ . '/../video/jobs.php';

/**
 * @return array<int, array<string, mixed>>
 */
function adachat_runtime_list_jobs_from_dir(string $dir, string $modality, int $limit = 20): array
{
    if (!is_dir($dir)) {
        return [];
    }
    $files = glob($dir . DIRECTORY_SEPARATOR . '*.json') ?: [];
    $jobs = [];
    foreach ($files as $file) {
        $base = basename($file);
        if ($base === '' || $base[0] === '_') {
            continue;
        }
        $data = json_decode((string) @file_get_contents($file), true);
        if (!is_array($data) || empty($data['id'])) {
            continue;
        }
        $jobs[] = [
            'id' => (string) $data['id'],
            'modality' => $modality,
            'status' => (string) ($data['status'] ?? ''),
            'progress' => (int) ($data['progress'] ?? 0),
            'model' => (string) ($data['model'] ?? ''),
            'mode' => (string) ($data['mode'] ?? ''),
            'error' => (string) ($data['error'] ?? ''),
            'created_at' => (string) ($data['created_at'] ?? ''),
            'updated_at' => (string) ($data['updated_at'] ?? ''),
        ];
    }

    usort($jobs, static function (array $a, array $b): int {
        return strcmp((string) ($b['updated_at'] ?? ''), (string) ($a['updated_at'] ?? ''));
    });

    return array_slice($jobs, 0, max(1, $limit));
}

/**
 * @return array{success: bool, jobs: array<int, array<string, mixed>>, count: int}
 */
function adachat_runtime_list_recent_jobs(int $limit = 30): array
{
    $per = max(5, (int) ceil($limit / 2));
    $img = adachat_runtime_list_jobs_from_dir(adachat_image_jobs_dir(), 'image', $per);
    $vid = adachat_runtime_list_jobs_from_dir(adachat_video_jobs_dir(), 'video', $per);
    $all = array_merge($img, $vid);
    usort($all, static function (array $a, array $b): int {
        return strcmp((string) ($b['updated_at'] ?? ''), (string) ($a['updated_at'] ?? ''));
    });
    $all = array_slice($all, 0, max(1, $limit));
    return [
        'success' => true,
        'jobs' => $all,
        'count' => count($all),
    ];
}
