<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/jobs.php';
require_once __DIR__ . '/spawn.php';
require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/../json.php';
require_once __DIR__ . '/../providers.php';

function adachat_image_gateway_submit(array $parsed, string $providerId, string $modelName, array $provider): void
{
    if (!adachat_local_image_feature_enabled()) {
        http_response_code(400);
        adachat_json_headers();
        echo adachat_json_encode_unicode([
            'error' => '本地文生图 Runtime 未启用',
            'hint' => '创建 ai_data/features/local_image_enabled 或设置 ADACHAT_LOCAL_IMAGE=1。详见 docs/v1.5-local-image-runtime.md',
            'docs' => 'docs/v1.5-local-image-runtime.md',
        ]);
        return;
    }

    $prompt = trim((string) ($parsed['prompt'] ?? ''));
    // 去掉前端误带的分类标记，避免进 Diffusers
    $prompt = preg_replace('/^(?:\s*\[(?:文生图|图生图)\]\s*)+/u', '', $prompt) ?? $prompt;
    $prompt = trim((string) $prompt);
    if ($prompt === '') {
        http_response_code(400);
        adachat_json_headers();
        echo adachat_json_encode_unicode(['error' => '文生图需要 prompt']);
        return;
    }

    $mode = adachat_image_provider_mode($provider);
    if ($mode !== 'local') {
        http_response_code(400);
        adachat_json_headers();
        echo adachat_json_encode_unicode([
            'error' => '当前供应商不是本地文生图模式',
            'hint' => '请将部署类型设为「本地」，模型类型为图像生成；并确保已开启 local_image 开关。',
        ]);
        return;
    }

    $extra = [];
    if (!empty($parsed['input']['image_size'])) {
        $extra['image_size'] = (string) $parsed['input']['image_size'];
    }
    if (!empty($parsed['input']['negative_prompt'])) {
        $extra['negative_prompt'] = (string) $parsed['input']['negative_prompt'];
    }
    if (isset($parsed['input']['steps'])) {
        $extra['steps'] = (int) $parsed['input']['steps'];
    }
    if (isset($parsed['input']['guidance_scale'])) {
        $extra['guidance_scale'] = (float) $parsed['input']['guidance_scale'];
    }
    if (isset($parsed['input']['seed'])) {
        $extra['seed'] = $parsed['input']['seed'];
    }

    $job = adachat_image_create_job([
        'provider_id' => $providerId,
        'model' => $modelName,
        'prompt' => $prompt,
        'mode' => $mode,
        'extra' => $extra,
    ]);

    $spawned = adachat_image_spawn_worker((string) $job['id']);
    if (!$spawned) {
        $job['status'] = 'failed';
        $job['error'] = '无法启动后台图片任务（exec 被禁用）';
        adachat_image_save_job($job);
        http_response_code(500);
        adachat_json_headers();
        echo adachat_json_encode_unicode(['error' => $job['error'], 'job_id' => $job['id']]);
        return;
    }

    adachat_json_headers();
    echo adachat_json_encode_unicode([
        'job_id' => $job['id'],
        'status' => 'queued',
        'mode' => $mode,
        'message' => '本地文生图任务已排队',
        'poll_action' => 'image_job_status',
    ]);
}
