<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 本地模型推理路径
 * Local model inference paths
 */

function adachat_local_inference_script_path(): string
{
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'local_inference_bridge.py';
}

function adachat_local_models_default_dir(): string
{
    $winDefault = 'D:\\models';
    if (is_dir($winDefault)) {
        return $winDefault;
    }
    return AI_DATA_DIR . DIRECTORY_SEPARATOR . 'local_models';
}

function adachat_local_provider_models_dir(array $provider): string
{
    $raw = trim((string) ($provider['models_dir'] ?? ''));
    if ($raw !== '') {
        return $raw;
    }
    return adachat_local_models_default_dir();
}

function adachat_local_provider_inference_engine(array $provider): string
{
    $engine = strtolower(trim((string) ($provider['inference_engine'] ?? '')));
    if ($engine === 'direct') {
        return 'direct';
    }
    if (($provider['deployment_type'] ?? '') === 'local' && $engine === '') {
        // 本地供应商默认走直连文件推理，不再要求 Ollama HTTP 服务
        return 'direct';
    }
    return $engine !== '' ? $engine : 'http';
}

function adachat_local_provider_is_direct(array $provider): bool
{
    return adachat_local_provider_inference_engine($provider) === 'direct';
}
