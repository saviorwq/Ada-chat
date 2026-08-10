<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 非流式执行（模块化）
 * Non-stream gateway execution (module)
 */

/**
 * @param resource $ch curl handle
 * @return array{ok: bool, httpCode: int, response: string, error: string|null}
 */
function adachat_gateway_exec_non_stream($ch): array
{
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = (string) curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if (curl_errno($ch)) {
        return [
            'ok' => false,
            'httpCode' => $httpCode,
            'response' => $response,
            'error' => (string) curl_error($ch),
        ];
    }
    return [
        'ok' => true,
        'httpCode' => $httpCode,
        'response' => $response,
        'error' => null,
    ];
}

