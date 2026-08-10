<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * CSRF token 生成与校验（模块化）
 * CSRF token generator and validator (module)
 *
 * 约定 / Convention:
 * - token 存在 $_SESSION['csrf_token']
 * - POST 请求要求携带 Header: X-CSRF-Token
 */

function adachat_csrf_get_or_create_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return (string) $_SESSION['csrf_token'];
}

function adachat_csrf_require_header_for_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        return;
    }
    $csrfToken = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    if ($expected === '' || !hash_equals($expected, $csrfToken)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(
            ['success' => false, 'error' => 'CSRF token mismatch'],
            JSON_UNESCAPED_UNICODE
        );
        exit;
    }
}

