<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * JSON 响应工具（模块化）
 * JSON response helpers (module)
 */

/**
 * @param mixed $data
 */
function adachat_json_encode_unicode($data): string
{
    return json_encode($data, JSON_UNESCAPED_UNICODE);
}

/**
 * 与 adachat_json() 一致的 JSON 响应头（流式网关等非 exit 路径可复用）
 * Same JSON response headers as adachat_json() for paths that do not exit
 */
function adachat_json_headers(): void
{
    if (headers_sent()) {
        return;
    }
    header('Content-Type: application/json; charset=UTF-8');
}

/**
 * @param mixed $data
 */
function adachat_json($data, int $status = 200): void
{
    http_response_code($status);
    adachat_json_headers();
    echo adachat_json_encode_unicode($data);
    exit;
}

