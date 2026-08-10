<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../../../cost_optimizer.php';
require_once __DIR__ . '/../../providers.php';
require_once __DIR__ . '/../../cost/kv_cache_pipeline.php';
require_once __DIR__ . '/../../cost/pipeline.php';
require_once __DIR__ . '/../../rag/vector_injection.php';
require_once __DIR__ . '/../fallback.php';
require_once __DIR__ . '/../payload.php';

function adachat_gateway_handle_chat(array $ctx): array {
    $provider = $ctx['provider'];
    $providerId = (string) ($ctx['providerId'] ?? '');
    $modelName = (string) ($ctx['modelName'] ?? '');
    $modelParam = (string) ($ctx['modelParam'] ?? '');
    $originalModel = (string) ($ctx['originalModel'] ?? $modelParam);
    $apiKey = (string) ($ctx['apiKey'] ?? '');
    $apiPath = (string) ($ctx['apiPath'] ?? '/chat/completions');

    $messages = is_array($ctx['messages'] ?? null) ? $ctx['messages'] : [];
    $stream = (bool) ($ctx['stream'] ?? false);
    $rag = $ctx['rag'] ?? null;

    $isCyoaChat = (bool) ($ctx['isCyoaChat'] ?? false);
    $isCyoaBypassCost = (bool) ($ctx['isCyoaBypassCost'] ?? false);

    $temperature = $ctx['temperature'] ?? null;
    $topP = $ctx['topP'] ?? null;
    $presencePenalty = $ctx['presencePenalty'] ?? null;
    $frequencyPenalty = $ctx['frequencyPenalty'] ?? null;
    $inputMaxTokens = $ctx['inputMaxTokens'] ?? null;
    $stopSequences = $ctx['stopSequences'] ?? null;
    $tools = is_array($ctx['tools'] ?? null) ? $ctx['tools'] : null;
    $toolChoice = $ctx['toolChoice'] ?? null;

    $smartMaxTokens = null;
    $costPipelineEnabled = false;

    $ragHits = [];
    if (is_array($rag)) {
        $ragInject = adachat_rag_apply_vector_injection($messages, $rag);
        $messages = is_array($ragInject['messages'] ?? null)
            ? $ragInject['messages']
            : $messages;
        $ragHits = is_array($ragInject['hits'] ?? null) ? $ragInject['hits'] : [];
    }

    // 带 tools 的请求跳过 KV 缓存，避免错误命中
    $hasTools = is_array($tools) && count($tools) > 0;

    if (!$isCyoaBypassCost && !$hasTools) {
        $costPipelineEnabled = true;
        adachat_cost_try_kv_cache_and_respond($messages, (string) $modelName, (bool) $stream, (bool) $isCyoaChat, (bool) $isCyoaBypassCost, (bool) $costPipelineEnabled);

        $pipe = adachat_cost_apply_pipeline([
            'messages' => $messages,
            'provider' => $provider,
            'providerId' => (string) $providerId,
            'modelName' => (string) $modelName,
            'modelParam' => (string) $modelParam,
            'apiKey' => (string) $apiKey,
            'apiPath' => (string) $apiPath
        ]);

        $messages = $pipe['messages'];
        $provider = $pipe['provider'];
        $providerId = $pipe['providerId'];
        $modelName = $pipe['modelName'];
        $apiKey = $pipe['apiKey'];
        $apiPath = $pipe['apiPath'];
        $smartMaxTokens = $pipe['smartMaxTokens'];
    } elseif (!$isCyoaBypassCost && $hasTools) {
        // 仍可做滑动窗口等轻量处理，但不走 KV 缓存短路
        $costPipelineEnabled = true;
        $pipe = adachat_cost_apply_pipeline([
            'messages' => $messages,
            'provider' => $provider,
            'providerId' => (string) $providerId,
            'modelName' => (string) $modelName,
            'modelParam' => (string) $modelParam,
            'apiKey' => (string) $apiKey,
            'apiPath' => (string) $apiPath
        ]);

        $messages = $pipe['messages'];
        $provider = $pipe['provider'];
        $providerId = $pipe['providerId'];
        $modelName = $pipe['modelName'];
        $apiKey = $pipe['apiKey'];
        $apiPath = $pipe['apiPath'];
        $smartMaxTokens = $pipe['smartMaxTokens'];
    }

    $postData = adachat_gateway_build_chat_post_data(
        (string) $modelName,
        $messages,
        (bool) $stream,
        $temperature,
        $topP,
        $presencePenalty,
        $frequencyPenalty,
        $inputMaxTokens,
        $smartMaxTokens,
        $stopSequences,
        $tools,
        $toolChoice
    );

    $fallback = adachat_gateway_probe_429_and_fallback(
        'chat',
        $originalModel !== '' ? $originalModel : null,
        (string) $modelParam,
        $provider,
        (string) $apiPath,
        (string) $apiKey,
        (string) $modelName,
        $postData
    );
    $didFallback = (bool) ($fallback['didFallback'] ?? false);
    $provider = $fallback['provider'];
    $apiPath = $fallback['apiPath'];
    $apiKey = $fallback['apiKey'];
    $modelName = $fallback['modelName'];
    $postData = $fallback['postData'];

    $headers = [];
    if ($isCyoaChat) {
        $headers[] = 'X-CYOA-Bypass-Cost: ' . ($isCyoaBypassCost ? '1' : '0');
        $headers[] = 'X-CYOA-Cost-Pipeline: ' . ($costPipelineEnabled ? '1' : '0');
        // 非缓存命中路径固定为 0；缓存命中时由 kv_cache_pipeline 直接输出并 exit。
        $headers[] = 'X-CYOA-Cache-Hit: 0';
    }
    if (!empty($ragHits)) {
        // Base64 JSON：避免 header 特殊字符问题 / Avoid header encoding issues
        $payload = base64_encode(
            (string) json_encode($ragHits, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );
        if (is_string($payload) && $payload !== '') {
            $headers[] = 'X-AdaChat-Rag-Citations: ' . $payload;
        }
    }

    return [
        'provider' => $provider,
        'providerId' => $providerId,
        'modelName' => $modelName,
        'apiKey' => $apiKey,
        'apiPath' => $apiPath,
        'messages' => $messages,
        'stream' => $stream,
        'postData' => $postData,
        'smartMaxTokens' => $smartMaxTokens,
        'costPipelineEnabled' => $costPipelineEnabled,
        'didFallback' => $didFallback,
        'headers' => $headers
    ];
}

