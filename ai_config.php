<?php
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