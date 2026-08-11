<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/jobs.php';
require_once __DIR__ . '/spawn.php';
require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/../json.php';
require_once __DIR__ . '/../providers.php';
require_once __DIR__ . '/../runtime/coord.php';

function adachat_video_gateway_submit(array $parsed, string $providerId, string $modelName, array $provider): void
{
    $prompt = trim((string) ($parsed['prompt'] ?? ''));
    if ($prompt === '') {
        http_response_code(400);
        adachat_json_headers();
        echo adachat_json_encode_unicode(['error' => '视频生成需要 prompt']);
        return;
    }

    $mode = adachat_video_provider_mode($provider);
    if ($mode === 'cloud' && trim((string) ($provider['api_key'] ?? '')) === '') {
        http_response_code(400);
        adachat_json_headers();
        echo adachat_json_encode_unicode([
            'error' => '云端视频模式需要 API Key。请在供应商设置填写密钥，或切换本地视频模型。',
        ]);
        return;
    }

    $extra = [];
    if (!empty($parsed['input']['image_size'])) {
        $extra['image_size'] = (string) $parsed['input']['image_size'];
    }
    if (!empty($parsed['imageBase64']) || !empty($parsed['input']['image'])) {
        $extra['image'] = (string) ($parsed['input']['image'] ?? $parsed['imageBase64'] ?? '');
    }

    $job = adachat_video_create_job([
        'provider_id' => $providerId,
        'model' => $modelName,
        'prompt' => $prompt,
        'mode' => $mode,
        'extra' => $extra,
    ]);

    $runtimePrepare = null;
    if ($mode === 'local') {
        $prepare = adachat_runtime_prepare('video');
        $runtimePrepare = [
            'ok' => (bool) ($prepare['ok'] ?? false),
            'skipped' => (bool) ($prepare['skipped'] ?? false),
            'at' => date('c'),
        ];
        $job['runtime_prepare'] = $runtimePrepare;
        adachat_video_save_job($job);
    }

    $spawned = adachat_video_spawn_worker((string) $job['id']);
    if (!$spawned) {
        $job['status'] = 'failed';
        $job['error'] = '无法启动后台视频任务（exec 被禁用）';
        adachat_video_save_job($job);
        if ($mode === 'local') {
            @adachat_runtime_release('video');
        }
        http_response_code(500);
        adachat_json_headers();
        echo adachat_json_encode_unicode(['error' => $job['error'], 'job_id' => $job['id']]);
        return;
    }

    $payload = [
        'job_id' => $job['id'],
        'status' => 'queued',
        'mode' => $mode,
        'message' => $mode === 'local' ? '本地视频生成任务已排队' : '云端视频生成任务已提交',
        'poll_action' => 'video_job_status',
    ];
    if ($runtimePrepare !== null) {
        $payload['runtime_prepare'] = $runtimePrepare;
    }
    adachat_json_headers();
    echo adachat_json_encode_unicode($payload);
}
