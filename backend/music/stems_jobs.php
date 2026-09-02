<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/stems_paths.php';

function adachat_music_stems_ensure_dirs(): void
{
    foreach ([adachat_music_stems_jobs_dir(), adachat_music_stems_output_dir()] as $dir) {
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
    }
}

function adachat_music_stems_job_file(string $jobId): string
{
    $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '', $jobId);
    return adachat_music_stems_jobs_dir() . DIRECTORY_SEPARATOR . $safe . '.json';
}

function adachat_music_stems_create_job(array $payload): array
{
    adachat_music_stems_ensure_dirs();
    $id = 'stem_' . bin2hex(random_bytes(8));
    $job = array_merge([
        'id' => $id,
        'kind' => 'stems',
        'status' => 'queued',
        'progress' => 0,
        'created_at' => date('c'),
        'updated_at' => date('c'),
        'music_job_id' => '',
        'source_file' => '',
        'zip_file' => '',
        'error' => '',
        'hint' => '',
        'model' => 'htdemucs',
        'device' => 'cpu',
    ], $payload);
    adachat_music_stems_save_job($job);
    return $job;
}

function adachat_music_stems_save_job(array $job): bool
{
    $id = (string) ($job['id'] ?? '');
    if ($id === '') {
        return false;
    }
    $job['updated_at'] = date('c');
    return file_put_contents(
        adachat_music_stems_job_file($id),
        json_encode($job, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
    ) !== false;
}

function adachat_music_stems_load_job(string $jobId): ?array
{
    $file = adachat_music_stems_job_file($jobId);
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode((string) file_get_contents($file), true);
    return is_array($data) ? $data : null;
}

function adachat_music_stems_public_url(array $job): string
{
    if (!empty($job['zip_file']) && is_file((string) $job['zip_file'])) {
        return 'ai_proxy.php?action=music_stems_file&id=' . urlencode((string) $job['id']);
    }
    return '';
}

function adachat_music_stems_job_is_stale(array $job, int $maxMinutes = 90): bool
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
