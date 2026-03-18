<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * AI 模块专用配置 - 与主后台共享会话
 */

// 数据目录（绝对路径）
define('AI_DATA_DIR', __DIR__ . '/ai_data');
define('AI_PROVIDERS_FILE', AI_DATA_DIR . '/providers.json');

// 会话超时（秒）
define('AI_SESSION_LIFETIME', 86400); // 24小时

// 设置会话 cookie 参数（在 session_start() 前自动生效）
ini_set('session.cookie_lifetime', AI_SESSION_LIFETIME);
ini_set('session.cookie_path', '/');
ini_set('session.cookie_httponly', 1);
ini_set('session.use_strict_mode', 1);
ini_set('session.cookie_samesite', 'Lax');
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    ini_set('session.cookie_secure', 1);
}

// 客户端绕过省钱策略控制：
// - true: 仅白名单 client 可使用 bypassCostOptimizer=true
// - false: 任意 client 只要显式传 bypassCostOptimizer=true 即可绕过
if (!defined('AI_BYPASS_COST_ALLOWLIST_ENABLED')) {
    define('AI_BYPASS_COST_ALLOWLIST_ENABLED', true);
}
if (!defined('AI_BYPASS_COST_ALLOWED_CLIENTS')) {
    define('AI_BYPASS_COST_ALLOWED_CLIENTS', ['cyoa']);
}
if (!defined('AI_BYPASS_COST_ALLOW_EMPTY_CLIENT')) {
    define('AI_BYPASS_COST_ALLOW_EMPTY_CLIENT', false);
}