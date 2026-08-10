<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 网关任务分发（模块化）
 * Gateway task dispatcher (module)
 */

require_once __DIR__ . '/handlers/chat.php';
require_once __DIR__ . '/handlers/image.php';
require_once __DIR__ . '/handlers/video.php';
require_once __DIR__ . '/routing.php';

/**
 * @return array{ok: bool, status?: int, error?: string, provider?: array, providerId?: string, modelName?: string, apiKey?: string, apiPath?: string, postData?: array, stream?: bool, headers?: array<int,string>, costPipelineEnabled?: bool}
 */
function adachat_gateway_dispatch_task(string $task, array $ctx): array
{
    $provider = $ctx['provider'] ?? null;
    if (!is_array($provider)) {
        return ['ok' => false, 'status' => 500, 'error' => 'Missing provider'];
    }

    $mode = (string) ($ctx['mode'] ?? '');
    $streamIn = (bool) ($ctx['stream'] ?? false);
    $apiPath = adachat_gateway_select_api_path($task, $provider, $mode);
    $stream = adachat_gateway_force_stream_for_task($task, $streamIn);

    if ($apiPath === '') {
        return ['ok' => false, 'status' => 400, 'error' => 'Invalid task'];
    }

    // 将归一化后的 apiPath/stream 回填给 handler 使用（同时保持原 ctx 其余字段不变）
    $ctx['apiPath'] = $apiPath;
    $ctx['stream'] = $stream;

    switch ($task) {
        case 'chat': {
            $out = adachat_gateway_handle_chat($ctx);
            return [
                'ok' => true,
                'provider' => $out['provider'],
                'providerId' => (string) ($out['providerId'] ?? ''),
                'modelName' => (string) ($out['modelName'] ?? ''),
                'apiKey' => (string) ($out['apiKey'] ?? ''),
                'apiPath' => (string) ($out['apiPath'] ?? $apiPath),
                'postData' => $out['postData'],
                'stream' => (bool) ($out['stream'] ?? false),
                'headers' => is_array($out['headers'] ?? null) ? $out['headers'] : [],
                'costPipelineEnabled' => (bool) ($out['costPipelineEnabled'] ?? false),
            ];
        }
        case 'image': {
            $out = adachat_gateway_handle_image($ctx);
            return [
                'ok' => true,
                'provider' => $out['provider'],
                'modelName' => (string) ($out['modelName'] ?? ''),
                'apiKey' => (string) ($out['apiKey'] ?? ''),
                'apiPath' => (string) ($out['apiPath'] ?? $apiPath),
                'postData' => $out['postData'],
                'stream' => (bool) ($out['stream'] ?? false),
                'headers' => [],
            ];
        }
        case 'video': {
            $out = adachat_gateway_handle_video($ctx);
            return [
                'ok' => true,
                'provider' => $out['provider'],
                'modelName' => (string) ($out['modelName'] ?? ''),
                'apiKey' => (string) ($out['apiKey'] ?? ''),
                'apiPath' => (string) ($out['apiPath'] ?? $apiPath),
                'postData' => $out['postData'],
                'stream' => (bool) ($out['stream'] ?? false),
                'headers' => [],
            ];
        }
        default:
            return ['ok' => false, 'status' => 400, 'error' => 'Invalid task'];
    }
}

