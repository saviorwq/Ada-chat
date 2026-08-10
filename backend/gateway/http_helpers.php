<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 网关 HTTP 工具（模块化）
 * Gateway HTTP helpers (module)
 */

function adachat_gateway_build_api_headers(string $apiKey): array
{
    $headers = ['Content-Type: application/json; charset=UTF-8'];
    $trimmedKey = trim($apiKey);
    if ($trimmedKey !== '') {
        $headers[] = 'Authorization: Bearer ' . $trimmedKey;
    }
    $headers[] = 'HTTP-Referer: ' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $headers[] = 'X-Title: Ada Chat';
    return $headers;
}

/**
 * Windows 下若未设置 curl.cainfo，则优先使用打包内 cacert.pem。
 *
 * @param resource $ch curl handle
 */
function adachat_gateway_apply_windows_cainfo($ch): void
{
    $caFile = dirname(__DIR__, 2) . '/php/ssl/cacert.pem';
    if (stripos(PHP_OS, 'WIN') === 0 && file_exists($caFile) && !ini_get('curl.cainfo')) {
        curl_setopt($ch, CURLOPT_CAINFO, $caFile);
    }
}

