<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Hybrid 推理路由（表驱动，避免 entry.php 堆叠 if-else）
 * Hybrid inference routing — table-driven, keeps entry.php free of nested branches
 */

require_once __DIR__ . '/../local_inference/paths.php';
require_once __DIR__ . '/../local_inference/gateway.php';
require_once __DIR__ . '/../video/gateway.php';
require_once __DIR__ . '/../image/paths.php';
require_once __DIR__ . '/../image/gateway.php';
require_once __DIR__ . '/dispatch_task.php';
require_once __DIR__ . '/client.php';
require_once __DIR__ . '/runtime_budget.php';
require_once __DIR__ . '/response_exec.php';

/**
 * 本地直连尚不支持的任务（避免误打无效 HTTP 端点）
 * Tasks not supported under direct local inference
 */
function adachat_gateway_local_blocked_tasks(): array
{
    // 本地 Image Runtime 开启后不再拦截 image / Unblock image when feature flag is on
    if (function_exists('adachat_local_image_feature_enabled') && adachat_local_image_feature_enabled()) {
        return [];
    }
    return ['image'];
}

/**
 * @return 'local_chat'|'local_video'|'local_image'|'blocked_local'|'cloud_http'
 */
function adachat_gateway_route_inference(string $task, ?array $provider): string
{
    if (!is_array($provider)) {
        return 'cloud_http';
    }

    if ($task === 'video') {
        return 'local_video';
    }

    if (
        $task === 'image'
        && adachat_local_image_feature_enabled()
        && (
            adachat_local_provider_is_direct($provider)
            || (($provider['deployment_type'] ?? '') === 'local')
        )
    ) {
        return 'local_image';
    }

    if (adachat_local_provider_is_direct($provider)) {
        if ($task === 'chat') {
            return 'local_chat';
        }
        if (in_array($task, adachat_gateway_local_blocked_tasks(), true)) {
            return 'blocked_local';
        }
    }

    return 'cloud_http';
}

/**
 * 执行已路由的请求；返回 false 表示调用方无需继续（已输出响应）
 */
function adachat_gateway_execute_routed(
    string $route,
    array $parsed,
    array $resolved,
    string $modelParam
): bool {
    $providerId = (string) ($resolved['providerId'] ?? '');
    $modelName = (string) ($resolved['modelName'] ?? '');
    $provider = $resolved['provider'] ?? null;
    $apiKey = (string) ($resolved['apiKey'] ?? '');
    $task = (string) ($parsed['task'] ?? 'chat');
    $input = $parsed['input'] ?? [];

    switch ($route) {
        case 'local_chat':
            if (!adachat_local_inference_preflight_or_respond()) {
                return false;
            }
            adachat_local_inference_handle_chat($parsed, $providerId, $modelName, is_array($provider) ? $provider : []);
            return false;

        case 'local_video':
            adachat_video_gateway_submit(
                $parsed,
                $providerId,
                $modelName,
                is_array($provider) ? $provider : []
            );
            return false;

        case 'local_image':
            adachat_image_gateway_submit(
                $parsed,
                $providerId,
                $modelName,
                is_array($provider) ? $provider : []
            );
            return false;

        case 'blocked_local':
            adachat_local_inference_reject_unsupported_task($task, is_array($provider) ? $provider : []);
            return false;

        case 'cloud_http':
        default:
            break;
    }

    // 本机 Vulkan llama：生图 release 不拉回服务，聊天前在此 ensure
    if (
        $task === 'chat'
        && is_array($provider)
        && (($provider['deployment_type'] ?? '') === 'local')
    ) {
        require_once __DIR__ . '/../runtime/coord.php';
        $prep = adachat_runtime_prepare_chat_if_local_llama($provider);
        if (empty($prep['ok']) && empty($prep['skipped'])) {
            http_response_code(503);
            adachat_json_headers();
            echo adachat_json_encode_unicode([
                'error' => '本机 Vulkan LLM 未就绪（可能刚完成生图，正在拉起 llama-server）',
                'hint' => '请稍后重试；或托盘「启动 GPU」/ 设置→本地运行时 查看 llm_vulkan',
                'runtime' => $prep,
            ]);
            return false;
        }
    }

    $dispatch = adachat_gateway_dispatch_task($task, [
        'provider' => $provider,
        'providerId' => $providerId,
        'modelName' => $modelName,
        'modelParam' => (string) $modelParam,
        'originalModel' => (string) $modelParam,
        'apiKey' => $apiKey,
        'messages' => $parsed['messages'],
        'stream' => (bool) $parsed['stream'],
        'isCyoaChat' => (bool) $parsed['isCyoaChat'],
        'isCyoaBypassCost' => (bool) $parsed['isCyoaBypassCost'],
        'rag' => $parsed['rag'],
        'temperature' => $parsed['temperature'],
        'topP' => $parsed['topP'],
        'presencePenalty' => $parsed['presencePenalty'],
        'frequencyPenalty' => $parsed['frequencyPenalty'],
        'inputMaxTokens' => $parsed['inputMaxTokens'],
        'stopSequences' => $parsed['stopSequences'],
        'tools' => $parsed['tools'] ?? null,
        'toolChoice' => $parsed['toolChoice'] ?? null,
        'mode' => (string) $parsed['mode'],
        'prompt' => (string) $parsed['prompt'],
        'imageBase64' => $parsed['imageBase64'],
    ]);

    if (empty($dispatch['ok'])) {
        http_response_code((int) ($dispatch['status'] ?? 400));
        adachat_json_headers();
        echo adachat_json_encode_unicode(['error' => (string) ($dispatch['error'] ?? 'Invalid task')]);
        return false;
    }

    $provider = $dispatch['provider'];
    $apiKey = (string) ($dispatch['apiKey'] ?? $apiKey);
    $apiPath = (string) ($dispatch['apiPath'] ?? '');
    $postData = $dispatch['postData'];
    $stream = (bool) ($dispatch['stream'] ?? false);
    $responseHeaders = is_array($dispatch['headers'] ?? null) ? $dispatch['headers'] : [];

    $apiUrl = adachat_gateway_build_api_url($provider, $apiPath);

    adachat_send_headers($responseHeaders);
    adachat_gateway_apply_runtime_budget((bool) $stream, (bool) $parsed['isCyoaChat']);

    $ch = adachat_gateway_create_client((string) $apiUrl, (string) $apiKey, $postData, (bool) $parsed['isCyoaChat']);

    $originalMessages = is_array($input['messages'] ?? null) ? $input['messages'] : [];
    adachat_gateway_exec_and_respond(
        $ch,
        (bool) $stream,
        $task,
        $originalMessages,
        (string) ($dispatch['modelName'] ?? $modelName)
    );
    curl_close($ch);
    return false;
}
