<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * PHP 内置服务器路由逻辑（由项目根目录 router.php 调用）
 * PHP built-in server router logic (invoked from repo-root router.php)
 *
 * @return bool  true = 已处理请求并应结束；false = 交给内置服务器处理静态文件
 */
function adachat_builtin_server_router_dispatch(): bool
{
    $root = dirname(__DIR__, 2);
    $uri = urldecode((string) ($_SERVER['REQUEST_URI'] ?? ''));
    $path = parse_url($uri, PHP_URL_PATH);
    $path = is_string($path) ? $path : '';

    $blocked = ['/ai_data/', '/ssl/', '/php/'];
    // 调试接口：直接返回 JSON，用于验证 Content-Type
    if ($path === '/_api_test' || $path === '/api_test.php') {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['ok' => true, 'msg' => 'test']);
        return true;
    }
    foreach ($blocked as $dir) {
        if (stripos($path, $dir) === 0 || stripos($path, $dir) !== false) {
            http_response_code(403);
            echo '403 Forbidden';
            return true;
        }
    }

    if ($path !== '/' && file_exists($root . $path)) {
        return false;
    }

    return false;
}
