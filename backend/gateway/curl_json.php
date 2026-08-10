<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * curl JSON 请求封装（模块化）
 * curl JSON request helper (module)
 *
 * 依赖：backend/gateway/http_helpers.php
 */

require_once __DIR__ . '/http_helpers.php';

/**
 * POST JSON 并返回 HTTP 状态码（不抛异常）。
 *
 * @param string $url
 * @param array<int, string> $headers
 * @param array<string, mixed> $data
 */
function adachat_curl_post_json_code(string $url, array $headers, array $data, int $timeoutSec, int $connectTimeoutSec): int
{
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeoutSec);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $connectTimeoutSec);
    adachat_gateway_apply_windows_cainfo($ch);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code;
}

