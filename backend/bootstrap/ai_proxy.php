<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * ai_proxy.php 薄入口公共启动（session + 登录 + CSRF）
 * Shared bootstrap for ai_proxy.php thin entry (session + login + CSRF)
 */

function adachat_bootstrap_ai_proxy_request(): void
{
    require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'ai_config.php';
    require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'http.php';

    adachat_boot_session();
    adachat_require_login_json();
    adachat_require_csrf_header_for_post();
}
