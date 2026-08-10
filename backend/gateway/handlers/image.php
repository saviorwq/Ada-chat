<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../payload.php';
require_once __DIR__ . '/../fallback.php';

function adachat_gateway_handle_image(array $ctx): array {
    $mode = (string) ($ctx['mode'] ?? '');
    $provider = $ctx['provider'] ?? null;
    $modelName = (string) ($ctx['modelName'] ?? '');
    $modelParam = (string) ($ctx['modelParam'] ?? '');
    $apiKey = (string) ($ctx['apiKey'] ?? '');
    $apiPath = (string) ($ctx['apiPath'] ?? '/images/generations');
    $prompt = (string) ($ctx['prompt'] ?? '');
    $imageBase64 = $ctx['imageBase64'] ?? null;
    $stream = (bool) ($ctx['stream'] ?? false);

    $postData = adachat_gateway_build_image_post_data($mode, $modelName, $prompt, $imageBase64);

    $fallback = adachat_gateway_probe_429_and_fallback(
        'image',
        null,
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

    return [
        'provider' => $provider,
        'apiPath' => $apiPath,
        'apiKey' => $apiKey,
        'postData' => $postData,
        // image 任务不支持流式（保持旧行为）
        'stream' => false,
        'modelName' => $modelName,
        'didFallback' => $didFallback
    ];
}

