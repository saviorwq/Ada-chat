<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * HTML 页面公共启动（薄入口复用）
 * Shared bootstrap for HTML entry pages (thin entrypoints)
 */

/**
 * 已登录 HTML 页：安全头 + session + HTML 登录校验 + CSRF
 * Authenticated HTML page: security headers + session + HTML login + CSRF token
 *
 * @return string CSRF token
 */
function adachat_bootstrap_html_authenticated_page(): string
{
    require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'http.php';

    adachat_send_security_headers();
    adachat_boot_session();
    adachat_require_login_html();

    return adachat_get_or_create_csrf_token();
}

/**
 * 登录页等公开 HTML：安全头 + session + CSRF（不强制已登录）
 * Public HTML page (e.g. login): security headers + session + CSRF token
 *
 * @return string CSRF token
 */
function adachat_bootstrap_html_public_page(): string
{
    require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'http.php';

    adachat_send_security_headers();
    adachat_boot_session();

    return adachat_get_or_create_csrf_token();
}
