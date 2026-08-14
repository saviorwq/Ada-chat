<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/paths.php';

function adachat_image_ensure_dirs(): void
{
    foreach ([adachat_image_jobs_dir(), adachat_image_output_dir()] as $dir) {
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
    }
    $feat = AI_DATA_DIR . DIRECTORY_SEPARATOR . 'features';
    if (!is_dir($feat)) {
        @mkdir($feat, 0755, true);
    }
}

function adachat_image_init_path(string $jobId): string
{
    $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '', $jobId);
    return adachat_image_jobs_dir() . DIRECTORY_SEPARATOR . $safe . '_init.png';
}

/**
 * 将 data URL / 裸 base64 解码为参考图文件
 * Decode data URL / raw base64 into init image file
 *
 * @return string|null Absolute path on success
 */
function adachat_image_save_init_image(string $jobId, string $imageData): ?string
{
    $raw = trim($imageData);
    if ($raw === '') {
        return null;
    }
    if (preg_match('#^data:image/[^;]+;base64,#i', $raw)) {
        $raw = (string) preg_replace('#^data:image/[^;]+;base64,#i', '', $raw);
    }
    $bin = base64_decode($raw, true);
    if ($bin === false || strlen($bin) < 32) {
        return null;
    }
    // 约 1.5MB 上限，防 job 撑爆
    if (strlen($bin) > 1572864) {
        return null;
    }
    adachat_image_ensure_dirs();
    $path = adachat_image_init_path($jobId);
    if (@file_put_contents($path, $bin) === false) {
        return null;
    }
    return $path;
}

function adachat_image_job_file(string $jobId): string
{
    $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '', $jobId);
    return adachat_image_jobs_dir() . DIRECTORY_SEPARATOR . $safe . '.json';
}

function adachat_image_create_job(array $payload): array
{
    adachat_image_ensure_dirs();
    $id = 'img_' . bin2hex(random_bytes(8));
    $job = array_merge([
        'id' => $id,
        'status' => 'queued',
        'progress' => 0,
        'created_at' => date('c'),
        'updated_at' => date('c'),
        'image_url' => '',
        'local_file' => '',
        'error' => '',
    ], $payload);
    adachat_image_save_job($job);
    return $job;
}

function adachat_image_save_job(array $job): bool
{
    $id = (string) ($job['id'] ?? '');
    if ($id === '') {
        return false;
    }
    $job['updated_at'] = date('c');
    $file = adachat_image_job_file($id);
    return file_put_contents($file, json_encode($job, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false;
}

function adachat_image_load_job(string $jobId): ?array
{
    $file = adachat_image_job_file($jobId);
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode((string) file_get_contents($file), true);
    return is_array($data) ? $data : null;
}

function adachat_image_public_url_for_job(array $job): string
{
    if (!empty($job['image_url'])) {
        return (string) $job['image_url'];
    }
    if (!empty($job['local_file'])) {
        return 'ai_proxy.php?action=image_file&id=' . urlencode((string) $job['id']);
    }
    return '';
}

function adachat_image_job_is_stale(array $job, int $maxMinutes = 20): bool
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
