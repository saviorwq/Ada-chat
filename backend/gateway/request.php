<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 网关请求初始化（模块化）
 * Gateway request initialization (module)
 *
 * 目标：把 curl 的公共初始化逻辑从 ai_proxy.php 抽出去，减少入口复杂度。
 */

require_once __DIR__ . '/http_helpers.php';

/**
 * 初始化 curl 句柄（POST JSON + headers + timeouts + Windows CAINFO）。
 *
 * @param string $url
 * @param string $apiKey
 * @param array<string, mixed> $postData
 * @param int $timeoutSec
 * @param int $connectTimeoutSec
 * @return resource curl handle
 */
function adachat_gateway_init_curl_json(string $url, string $apiKey, array $postData, int $timeoutSec, int $connectTimeoutSec)
{
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    $headers = adachat_gateway_build_api_headers($apiKey);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeoutSec);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $connectTimeoutSec);
    adachat_gateway_apply_windows_cainfo($ch);
    return $ch;
}

