<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 网关回退逻辑（模块化）
 * Gateway fallback logic (module)
 */

require_once __DIR__ . '/http_helpers.php';
require_once __DIR__ . '/curl_json.php';

/**
 * 429 探测：若当前 provider/model 为“路由后的廉价模型”，先 probe 一次避免流式再失败；若 probe 返回 429，则回退到 originalModel。
 *
 * @param array<string, mixed> $provider 当前 provider（可被回退覆盖）
 * @param string $apiPath 当前请求 path（可被回退覆盖）
 * @param string $apiKey 当前 key（可被回退覆盖）
 * @param string $modelName 当前模型名（可被回退覆盖）
 * @param array<string, mixed> $postData 当前请求 payload（会被更新 model 字段）
 *
 * @return array{didFallback: bool, provider: array<string, mixed>, apiPath: string, apiKey: string, modelName: string, postData: array<string, mixed>}
 */
function adachat_gateway_probe_429_and_fallback(
    string $task,
    ?string $originalModel,
    string $modelParam,
    array $provider,
    string $apiPath,
    string $apiKey,
    string $modelName,
    array $postData
): array {
    $didFallback = false;

    if ($task !== 'chat' || $originalModel === null || $modelParam === $originalModel) {
        return compact('didFallback', 'provider', 'apiPath', 'apiKey', 'modelName', 'postData');
    }

    $probeUrl = (string) ($provider['base_url'] ?? '') . $apiPath;
    $headers = adachat_gateway_build_api_headers($apiKey);
    $probeData = $postData;
    $probeData['stream'] = false;
    $probeData['max_tokens'] = 1;
    $probeCode = adachat_curl_post_json_code($probeUrl, $headers, $probeData, 10, 5);

    if ($probeCode !== 429) {
        return compact('didFallback', 'provider', 'apiPath', 'apiKey', 'modelName', 'postData');
    }

    if (strpos($originalModel, '::') === false) {
        return compact('didFallback', 'provider', 'apiPath', 'apiKey', 'modelName', 'postData');
    }

    [$origProviderId, $origModelName] = explode('::', $originalModel, 2);
    if ($origProviderId === '' || $origModelName === '') {
        return compact('didFallback', 'provider', 'apiPath', 'apiKey', 'modelName', 'postData');
    }

    // 注意：此处使用 providers 模块的查找函数
    if (!function_exists('adachat_find_provider')) {
        return compact('didFallback', 'provider', 'apiPath', 'apiKey', 'modelName', 'postData');
    }
    $origProvider = adachat_find_provider((string) $origProviderId);
    if (!$origProvider) {
        return compact('didFallback', 'provider', 'apiPath', 'apiKey', 'modelName', 'postData');
    }

    $provider = $origProvider;
    $modelName = (string) $origModelName;
    $apiKey = trim((string) ($provider['api_key'] ?? ''));
    $apiPath = (string) ($provider['chat_path'] ?? '/chat/completions');
    $postData['model'] = $modelName;
    $didFallback = true;

    return compact('didFallback', 'provider', 'apiPath', 'apiKey', 'modelName', 'postData');
}

