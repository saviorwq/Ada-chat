<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../utils.php';
require_once __DIR__ . '/../gateway/http_helpers.php';
require_once __DIR__ . '/../json.php';

function adachat_video_cloud_style(array $provider): string
{
    $url = strtolower((string) ($provider['base_url'] ?? ''));
    if (strpos($url, 'siliconflow') !== false) {
        return 'siliconflow';
    }
    if (strpos($url, 'dashscope') !== false || strpos($url, 'aliyuncs') !== false) {
        return 'dashscope';
    }
    return 'openai_video';
}

function adachat_video_curl_json(string $url, string $apiKey, ?array $postData = null, string $method = 'POST'): array
{
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 120);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 30);
    $headers = adachat_gateway_build_api_headers($apiKey);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($postData !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData, JSON_UNESCAPED_UNICODE));
        }
    }
    adachat_gateway_apply_windows_cainfo($ch);
    $body = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return ['ok' => $code >= 200 && $code < 300, 'code' => $code, 'body' => $body, 'error' => $err];
}

function adachat_video_cloud_submit_siliconflow(array $provider, string $model, string $prompt, array $extra = []): array
{
    $base = rtrim((string) ($provider['base_url'] ?? ''), '/');
    $url = $base . '/video/submit';
    $payload = [
        'model' => $model,
        'prompt' => $prompt,
        'image_size' => (string) ($extra['image_size'] ?? '1280x720'),
    ];
    if (!empty($extra['image'])) {
        $payload['image'] = (string) $extra['image'];
    }
    $apiKey = trim((string) ($provider['api_key'] ?? ''));
    if ($apiKey === '') {
        return ['ok' => false, 'error' => '云端视频需要 API Key，请在供应商设置中填写'];
    }
    $res = adachat_video_curl_json($url, $apiKey, $payload);
    if (!$res['ok']) {
        return ['ok' => false, 'error' => '提交失败 HTTP ' . $res['code'] . ': ' . adachat_usub($res['body'], 0, 300)];
    }
    $data = json_decode($res['body'], true);
    $requestId = (string) ($data['requestId'] ?? $data['request_id'] ?? '');
    if ($requestId === '') {
        return ['ok' => false, 'error' => '未获得 requestId: ' . adachat_usub($res['body'], 0, 200)];
    }
    return ['ok' => true, 'request_id' => $requestId, 'style' => 'siliconflow'];
}

function adachat_video_cloud_poll_siliconflow(array $provider, string $requestId, int $maxSeconds = 600): array
{
    $base = rtrim((string) ($provider['base_url'] ?? ''), '/');
    $url = $base . '/video/status';
    $apiKey = trim((string) ($provider['api_key'] ?? ''));
    $started = time();
    while ((time() - $started) < $maxSeconds) {
        $res = adachat_video_curl_json($url, $apiKey, ['requestId' => $requestId]);
        if (!$res['ok']) {
            return ['ok' => false, 'error' => '轮询失败 HTTP ' . $res['code']];
        }
        $data = json_decode($res['body'], true);
        $status = (string) ($data['status'] ?? '');
        if ($status === 'Succeed') {
            $videoUrl = (string) ($data['results']['videos'][0]['url'] ?? $data['results']['video']['url'] ?? '');
            if ($videoUrl !== '') {
                return ['ok' => true, 'video_url' => $videoUrl, 'raw' => $data];
            }
            return ['ok' => false, 'error' => '成功但无视频 URL'];
        }
        if ($status === 'Failed') {
            return ['ok' => false, 'error' => (string) ($data['reason'] ?? '云端生成失败')];
        }
        sleep(3);
    }
    return ['ok' => false, 'error' => '云端视频生成超时'];
}

function adachat_video_cloud_submit_openai(array $provider, string $model, string $prompt, string $apiPath): array
{
    $base = rtrim((string) ($provider['base_url'] ?? ''), '/');
    $path = $apiPath !== '' ? $apiPath : '/videos/generations';
    $url = $base . $path;
    $apiKey = trim((string) ($provider['api_key'] ?? ''));
    $res = adachat_video_curl_json($url, $apiKey, ['model' => $model, 'prompt' => $prompt]);
    if (!$res['ok']) {
        return ['ok' => false, 'error' => 'HTTP ' . $res['code'] . ': ' . adachat_usub($res['body'], 0, 300)];
    }
    $data = json_decode($res['body'], true);
    if (!is_array($data)) {
        return ['ok' => false, 'error' => '无效响应'];
    }
    $videoUrl = (string) ($data['data'][0]['url'] ?? $data['video']['url'] ?? $data['url'] ?? '');
    if ($videoUrl !== '') {
        return ['ok' => true, 'video_url' => $videoUrl, 'raw' => $data];
    }
    $taskId = (string) ($data['id'] ?? $data['task_id'] ?? '');
    if ($taskId !== '') {
        return ['ok' => true, 'request_id' => $taskId, 'style' => 'openai_async', 'raw' => $data];
    }
    return ['ok' => false, 'error' => '未解析到视频结果', 'raw' => $data];
}

function adachat_video_process_cloud_job(array $job, array $provider): array
{
    $model = (string) ($job['model'] ?? '');
    $prompt = (string) ($job['prompt'] ?? '');
    $style = adachat_video_cloud_style($provider);

    if ($style === 'siliconflow') {
        $sub = adachat_video_cloud_submit_siliconflow($provider, $model, $prompt, is_array($job['extra'] ?? null) ? $job['extra'] : []);
        if (empty($sub['ok'])) {
            return $sub;
        }
        return adachat_video_cloud_poll_siliconflow($provider, (string) $sub['request_id']);
    }

    $apiPath = (string) ($provider['video_path'] ?? '/videos/generations');
    return adachat_video_cloud_submit_openai($provider, $model, $prompt, $apiPath);
}
