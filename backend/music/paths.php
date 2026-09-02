<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * ACE-Step 音乐 Runtime 路径
 * Paths for ACE-Step music runtime
 */

function adachat_music_jobs_dir(): string
{
    return AI_DATA_DIR . DIRECTORY_SEPARATOR . 'music_jobs';
}

function adachat_music_output_dir(): string
{
    return AI_DATA_DIR . DIRECTORY_SEPARATOR . 'generated_music';
}

function adachat_music_worker_script_path(): string
{
    return __DIR__ . DIRECTORY_SEPARATOR . 'run_worker.php';
}

/** ACE-Step 安装根目录（含 venv_xpu / checkpoints） */
function adachat_music_acestep_root(): string
{
    $env = trim((string) (getenv('ADACHAT_ACESTEP_ROOT') ?: ''));
    if ($env !== '' && is_dir($env)) {
        return $env;
    }
    if (is_dir('D:\\ACE-Step\\ACE-Step-1.5')) {
        return 'D:\\ACE-Step\\ACE-Step-1.5';
    }
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'ACE-Step-1.5';
}

function adachat_music_acestep_base_url(): string
{
    $env = trim((string) (getenv('ADACHAT_ACESTEP_URL') ?: ''));
    if ($env !== '') {
        return rtrim($env, '/');
    }
    return 'http://127.0.0.1:8001';
}

function adachat_music_acestep_api_bat(): string
{
    $userBat = 'D:\\ACE-Step\\启动ACE-Step-API.bat';
    if (is_file($userBat)) {
        return $userBat;
    }
    $root = adachat_music_acestep_root();
    $headless = $root . DIRECTORY_SEPARATOR . 'start_api_server_xpu_headless.bat';
    if (is_file($headless)) {
        return $headless;
    }
    return $root . DIRECTORY_SEPARATOR . 'start_api_server_xpu.bat';
}

/** checkpoints 下是否已有可用 DiT 目录 */
function adachat_music_acestep_dit_ready(string $modelName): bool
{
    $name = trim($modelName);
    if ($name === '') {
        return false;
    }
    $dir = adachat_music_acestep_root() . DIRECTORY_SEPARATOR . 'checkpoints' . DIRECTORY_SEPARATOR . $name;
    if (!is_dir($dir)) {
        return false;
    }
    foreach (['model.safetensors', 'pytorch_model.bin', 'diffusion_pytorch_model.safetensors'] as $f) {
        if (is_file($dir . DIRECTORY_SEPARATOR . $f)) {
            $sz = (int) @filesize($dir . DIRECTORY_SEPARATOR . $f);
            // base 权重约 4.8GB；未下完的残片不当作就绪
            if ($sz > 100 * 1024 * 1024) {
                return true;
            }
        }
    }
    return false;
}

/**
 * 默认 DiT：优先 base（CFG/步数有效、杂音更可控），否则 turbo
 */
function adachat_music_default_dit_model(): string
{
    $env = trim((string) (getenv('ADACHAT_ACESTEP_MODEL') ?: ''));
    if ($env !== '' && adachat_music_acestep_dit_ready($env)) {
        return $env;
    }
    if (adachat_music_acestep_dit_ready('acestep-v15-base')) {
        return 'acestep-v15-base';
    }
    return 'acestep-v15-turbo';
}
