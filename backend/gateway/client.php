<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 网关客户端构造（模块化）
 * Gateway client builder (module)
 *
 * 依赖：
 * - backend/gateway/request.php: adachat_gateway_init_curl_json()
 */

require_once __DIR__ . '/request.php';

function adachat_gateway_build_api_url(array $provider, string $apiPath): string
{
    return (string) ($provider['base_url'] ?? '') . $apiPath;
}

/**
 * @return resource|\CurlHandle
 */
function adachat_gateway_create_client(string $apiUrl, string $apiKey, $postData, bool $isCyoaChat)
{
    $timeout = $isCyoaChat ? 1800 : 600;
    $connectTimeout = $isCyoaChat ? 60 : 30;
    return adachat_gateway_init_curl_json($apiUrl, $apiKey, $postData, $timeout, $connectTimeout);
}

