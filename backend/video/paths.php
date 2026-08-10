<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../local_inference/paths.php';

function adachat_video_jobs_dir(): string
{
    return AI_DATA_DIR . DIRECTORY_SEPARATOR . 'video_jobs';
}

function adachat_video_output_dir(): string
{
    return AI_DATA_DIR . DIRECTORY_SEPARATOR . 'generated_videos';
}

function adachat_video_inference_script_path(): string
{
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'video_inference_bridge.py';
}

function adachat_video_worker_script_path(): string
{
    return __DIR__ . DIRECTORY_SEPARATOR . 'run_worker.php';
}

function adachat_video_local_models_dir(array $provider): string
{
    $raw = trim((string) ($provider['models_dir'] ?? ''));
    if ($raw !== '') {
        return $raw;
    }
    if (is_dir('D:\\models')) {
        return 'D:\\models';
    }
    return AI_DATA_DIR . DIRECTORY_SEPARATOR . 'local_models';
}

function adachat_video_provider_mode(array $provider): string
{
    if (adachat_local_provider_is_direct($provider)) {
        return 'local';
    }
    $engine = strtolower(trim((string) ($provider['inference_engine'] ?? '')));
    if (($provider['deployment_type'] ?? '') === 'local') {
        return $engine === 'http' ? 'cloud' : 'local';
    }
    return 'cloud';
}
