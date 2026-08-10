<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../local_inference/paths.php';

/**
 * 本地文生图功能开关（默认关闭）
 * Local image feature flag (off by default)
 */
function adachat_local_image_feature_enabled(): bool
{
    $env = getenv('ADACHAT_LOCAL_IMAGE');
    if ($env === '1' || strtolower((string) $env) === 'true') {
        return true;
    }
    $flag = AI_DATA_DIR . DIRECTORY_SEPARATOR . 'features' . DIRECTORY_SEPARATOR . 'local_image_enabled';
    return is_file($flag);
}

function adachat_image_jobs_dir(): string
{
    return AI_DATA_DIR . DIRECTORY_SEPARATOR . 'image_jobs';
}

function adachat_image_output_dir(): string
{
    return AI_DATA_DIR . DIRECTORY_SEPARATOR . 'generated_images';
}

function adachat_image_inference_script_path(): string
{
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'image_inference_bridge.py';
}

function adachat_image_worker_script_path(): string
{
    return __DIR__ . DIRECTORY_SEPARATOR . 'run_worker.php';
}

function adachat_image_local_models_dir(array $provider): string
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

function adachat_image_provider_mode(array $provider): string
{
    // 本地供应商的文生图一律走 Ada Image Runtime（与对话用的 HTTP/llama 无关）
    // Local providers always use Ada Image Runtime for T2I (independent of chat HTTP/llama)
    if (($provider['deployment_type'] ?? '') === 'local') {
        return 'local';
    }
    if (adachat_local_provider_is_direct($provider)) {
        return 'local';
    }
    return 'cloud';
}
