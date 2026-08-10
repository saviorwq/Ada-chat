<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 后端公共 HTTP / Session / Auth / CSRF 工具（轻量模块化）
 * Common HTTP helpers for headers, session, auth and CSRF (light modularization)
 */

require_once __DIR__ . '/auth/session.php';
require_once __DIR__ . '/auth/csrf.php';

function adachat_send_headers(array $headers): void
{
    if (empty($headers) || headers_sent()) return;
    foreach ($headers as $h) {
        if (is_string($h) && $h !== '') {
            header($h);
        }
    }
}

function adachat_send_security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('X-XSS-Protection: 1; mode=block');
}

/**
 * Start shared session with consistent cookie options.
 * Must be called before output.
 */
function adachat_boot_session(): void
{
    ini_set('session.cookie_httponly', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.cookie_lifetime', '0');
    ini_set('session.gc_maxlifetime', '86400');
    ini_set('session.cookie_path', '/');
    ini_set('session.cookie_samesite', 'Lax');
    session_name('ADASESSID');

    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        ini_set('session.cookie_secure', '1');
    }

    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
}

function adachat_require_login_html(): void
{
    adachat_auth_require_login_html();
}

function adachat_require_login_json(): void
{
    adachat_auth_require_login_json();
}

function adachat_get_or_create_csrf_token(): string
{
    return adachat_csrf_get_or_create_token();
}

function adachat_require_csrf_header_for_post(): void
{
    adachat_csrf_require_header_for_post();
}

