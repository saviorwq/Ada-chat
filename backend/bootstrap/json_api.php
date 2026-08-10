<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * JSON API 公共启动（供 api.php 等薄入口复用）
 * Shared bootstrap for JSON API thin entrypoints (e.g. api.php)
 */

/**
 * 典型 JSON API：错误报告 + JSON 头 + session + 登录 + CSRF（POST）
 * Typical JSON API: error reporting + JSON header + session + login + CSRF (POST)
 */
function adachat_bootstrap_json_api_request(): void
{
    error_reporting(E_ALL);
    ini_set('display_errors', '0');

    require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'ai_config.php';
    require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'http.php';

    if (!headers_sent()) {
        header('Content-Type: application/json; charset=UTF-8');
    }

    adachat_boot_session();
    adachat_require_login_json();
    adachat_require_csrf_header_for_post();
}
