<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 会话登录态（模块化）
 * Session login state (module)
 *
 * 注意 / Note:
 * - 依赖调用方已 adachat_boot_session() 启动 session（通常在 backend/http.php）
 * - Uses $_SESSION['loggedin'] as the canonical flag for backward compatibility
 */

function adachat_auth_is_logged_in(): bool
{
    return isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true;
}

function adachat_auth_set_logged_in(bool $value = true): void
{
    $_SESSION['loggedin'] = $value === true;
}

function adachat_auth_clear_session_and_logout(): void
{
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        @session_destroy();
    }
}

function adachat_auth_require_login_html(): void
{
    if (adachat_auth_is_logged_in()) return;

    http_response_code(403);
    echo '<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>禁止访问</title>'
        . '<style>body{background:#0f172a;color:#e2e8f0;font-family:system-ui;padding:2rem;text-align:center;}'
        . 'a{color:#38bdf8;}</style></head><body>'
        . '<h1>需要先登录</h1><p><a href="login.php">返回登录</a></p></body></html>';
    exit;
}

function adachat_auth_require_login_json(): void
{
    if (adachat_auth_is_logged_in()) return;

    http_response_code(403);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['success' => false, 'error' => 'Unauthorized'], JSON_UNESCAPED_UNICODE);
    exit;
}

