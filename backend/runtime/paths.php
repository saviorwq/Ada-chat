<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Local Runtime Manager — 路径与功能开关
 * Paths and feature flags for Local Runtime Manager
 */

require_once __DIR__ . '/../image/paths.php';
require_once __DIR__ . '/../local_inference/paths.php';
require_once __DIR__ . '/../video/paths.php';

function adachat_runtime_dir(): string
{
    return AI_DATA_DIR . DIRECTORY_SEPARATOR . 'runtime';
}

function adachat_runtime_ensure_dirs(): void
{
    $dir = adachat_runtime_dir();
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $feat = AI_DATA_DIR . DIRECTORY_SEPARATOR . 'features';
    if (!is_dir($feat)) {
        @mkdir($feat, 0755, true);
    }
}

function adachat_runtime_coord_log_path(): string
{
    return adachat_runtime_dir() . DIRECTORY_SEPARATOR . 'coord.log';
}

/**
 * GPU 协调默认开启；可用环境变量或 off 标记关闭
 * GPU coordination on by default; disable via env or off-marker file
 */
function adachat_runtime_gpu_coord_enabled(): bool
{
    $env = getenv('ADACHAT_RUNTIME_GPU_COORD');
    if ($env === '0' || strtolower((string) $env) === 'false') {
        return false;
    }
    if ($env === '1' || strtolower((string) $env) === 'true') {
        return true;
    }
    $off = AI_DATA_DIR . DIRECTORY_SEPARATOR . 'features' . DIRECTORY_SEPARATOR . 'runtime_gpu_coord_off';
    if (is_file($off)) {
        return false;
    }
    return true;
}

function adachat_runtime_log(string $line): void
{
    adachat_runtime_ensure_dirs();
    $ts = date('c');
    @file_put_contents(
        adachat_runtime_coord_log_path(),
        '[' . $ts . '] ' . $line . "\n",
        FILE_APPEND
    );
}

function adachat_runtime_default_models_dir(): string
{
    return adachat_local_models_default_dir();
}
