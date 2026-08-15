<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/jobs.php';
require_once __DIR__ . '/spawn.php';
require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/../json.php';
require_once __DIR__ . '/../providers.php';
require_once __DIR__ . '/../runtime/coord.php';

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
        echo adachat_json_encode_unicode(['error' => '文生图/图生图需要 prompt']);
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

    $genMode = strtolower(trim((string) ($parsed['mode'] ?? 'text2img')));
    if ($genMode === 'i2i' || $genMode === 'image2image') {
        $genMode = 'img2img';
    }
    if ($genMode !== 'img2img') {
        $genMode = 'text2img';
    }

    $extra = [
        'gen_mode' => $genMode,
    ];
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
    if (!empty($parsed['input']['lora_id'])) {
        $extra['lora_id'] = trim((string) $parsed['input']['lora_id']);
    }
    if (isset($parsed['input']['lora_scale'])) {
        $extra['lora_scale'] = (float) $parsed['input']['lora_scale'];
    }
    if (isset($parsed['input']['strength'])) {
        $extra['strength'] = (float) $parsed['input']['strength'];
    } elseif ($genMode === 'img2img') {
        $extra['strength'] = 0.85;
    }
    if (!empty($parsed['input']['bind_cid'])) {
        $extra['bind_cid'] = trim((string) $parsed['input']['bind_cid']);
    }
    if (array_key_exists('use_char_preset', $parsed['input'] ?? [])) {
        $extra['use_char_preset'] = !empty($parsed['input']['use_char_preset']);
    }

    if ($genMode === 'img2img') {
        $imageData = (string) ($parsed['imageBase64'] ?? '');
        if (trim($imageData) === '') {
            http_response_code(400);
            adachat_json_headers();
            echo adachat_json_encode_unicode([
                'error' => '图生图需要上传参考图',
                'hint' => '请将模式切到「图生图」后再上传图片（≤1MB）。构图底图必填；锁脸可另选角色或临时脸。',
            ]);
            return;
        }
    }

    $job = adachat_image_create_job([
        'provider_id' => $providerId,
        'model' => $modelName,
        'prompt' => $prompt,
        'mode' => $mode,
        'extra' => $extra,
    ]);

    if ($genMode === 'img2img') {
        $initPath = adachat_image_save_init_image(
            (string) $job['id'],
            (string) ($parsed['imageBase64'] ?? '')
        );
        if ($initPath === null) {
            $job['status'] = 'failed';
            $job['error'] = '参考图无效或过大（请用 ≤1MB 的 jpg/png）';
            adachat_image_save_job($job);
            http_response_code(400);
            adachat_json_headers();
            echo adachat_json_encode_unicode([
                'error' => $job['error'],
                'job_id' => $job['id'],
            ]);
            return;
        }
        $job['extra']['init_image'] = $initPath;
        // 可选：临时人脸（与构图底图分离）
        $tempFace = (string) ($parsed['input']['temp_face'] ?? $parsed['input']['temp_face_ref'] ?? '');
        if (trim($tempFace) !== '') {
            $facePath = adachat_image_save_face_image((string) $job['id'], $tempFace);
            if ($facePath !== null) {
                $job['extra']['temp_face_ref'] = $facePath;
            }
        }
        adachat_image_save_job($job);
    }

    // GPU 协调：出图前尽量停 Vulkan LLM 释显存
    $prepare = adachat_runtime_prepare('image');
    $job['runtime_prepare'] = [
        'ok' => (bool) ($prepare['ok'] ?? false),
        'skipped' => (bool) ($prepare['skipped'] ?? false),
        'at' => date('c'),
    ];
    adachat_image_save_job($job);

    $spawned = adachat_image_spawn_worker((string) $job['id']);
    if (!$spawned) {
        $job['status'] = 'failed';
        $job['error'] = '无法启动后台图片任务（exec 被禁用）';
        adachat_image_save_job($job);
        // best-effort 恢复 LLM
        @adachat_runtime_release('image');
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
        'gen_mode' => $genMode,
        'message' => $genMode === 'img2img' ? '本地图生图任务已排队' : '本地文生图任务已排队',
        'poll_action' => 'image_job_status',
        'runtime_prepare' => $job['runtime_prepare'],
    ]);
}
