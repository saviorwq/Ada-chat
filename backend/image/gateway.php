<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/jobs.php';
require_once __DIR__ . '/spawn.php';
require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/prompt_translate.php';
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
    $negative = '';
    if (!empty($parsed['input']['negative_prompt'])) {
        $negative = (string) $parsed['input']['negative_prompt'];
        $extra['negative_prompt'] = $negative;
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
    // 导出格式：png(iTXt) | jpeg(EXIF 仿实拍)
    $outFmt = strtolower(trim((string) (
        $parsed['input']['output_format']
            ?? $parsed['input']['image_format']
            ?? 'png'
    )));
    if ($outFmt === 'jpg') {
        $outFmt = 'jpeg';
    }
    if ($outFmt !== 'jpeg') {
        $outFmt = 'png';
    }
    $extra['output_format'] = $outFmt;
    if (!empty($parsed['input']['exif_make'])) {
        $extra['exif_make'] = trim((string) $parsed['input']['exif_make']);
    }
    if (!empty($parsed['input']['exif_model'])) {
        $extra['exif_model'] = trim((string) $parsed['input']['exif_model']);
    }
    if (!empty($parsed['input']['hardware'])) {
        $extra['hardware'] = trim((string) $parsed['input']['hardware']);
    }

    // SD/SDXL：出图前用本机 LLM 把中文提示词译成英文（须在停 llama 之前）
    $tr = adachat_image_maybe_translate_prompts($prompt, $negative, $modelName);
    $prompt = (string) ($tr['prompt'] ?? $prompt);
    if (array_key_exists('negative_prompt', $tr)) {
        $extra['negative_prompt'] = (string) $tr['negative_prompt'];
    }
    if (!empty($tr['translated'])) {
        $extra['prompt_translated'] = true;
        $extra['prompt_translate_via'] = (string) ($tr['via'] ?? '');
        if (!empty($tr['prompt_original'])) {
            $extra['prompt_original'] = (string) $tr['prompt_original'];
        }
        if (!empty($tr['negative_original'])) {
            $extra['negative_original'] = (string) $tr['negative_original'];
        }
    } elseif (!empty($tr['skipped'])) {
        $extra['prompt_translate_skipped'] = (string) $tr['skipped'];
    }

    // 图生图未传构图图：有人物预设则降级为文生图+锁脸（无需再传脸图）
    if ($genMode === 'img2img') {
        $imageData = (string) ($parsed['imageBase64'] ?? '');
        if (trim($imageData) === '') {
            if (!empty($extra['bind_cid'])) {
                $genMode = 'text2img';
                $extra['gen_mode'] = 'text2img';
                unset($extra['strength']);
            } else {
                http_response_code(400);
                adachat_json_headers();
                echo adachat_json_encode_unicode([
                    'error' => '图生图需要上传参考图',
                    'hint' => '请上传构图底图（≤1MB），或改用「文生图」并选择人物脸部预设锁脸（无需上传）。',
                ]);
                return;
            }
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

    // GPU 协调：停 llama + 停 ACE（与音乐互斥）
    $prepare = adachat_runtime_prepare('image');
    $job['runtime_prepare'] = [
        'ok' => (bool) ($prepare['ok'] ?? false),
        'skipped' => (bool) ($prepare['skipped'] ?? false),
        'acestep_stop' => $prepare['acestep_stop'] ?? null,
        'at' => date('c'),
    ];
    adachat_image_save_job($job);

    $spawn = adachat_image_spawn_worker_result((string) $job['id']);
    if (empty($spawn['ok'])) {
        $job['status'] = 'failed';
        $code = (string) ($spawn['error'] ?? 'spawn_failed');
        $job['error'] = match ($code) {
            'exec_disabled' => '无法启动后台图片任务（PHP exec 被禁用）',
            'worker_script_missing' => '无法启动后台图片任务（缺少 run_worker.php）',
            default => '无法启动后台图片任务（worker 拉起失败，请重试或查看 ai_data/image_jobs/_spawn.log）',
        };
        adachat_image_save_job($job);
        @adachat_runtime_release('image');
        http_response_code(500);
        adachat_json_headers();
        echo adachat_json_encode_unicode([
            'error' => $job['error'],
            'job_id' => $job['id'],
            'spawn_error' => $code,
        ]);
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
