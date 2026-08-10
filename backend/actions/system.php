<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 系统/设置/更新/安全退出相关 action（模块化）
 * System-related actions (module)
 */

require_once __DIR__ . '/../utils.php';
require_once __DIR__ . '/../server_control.php';
require_once __DIR__ . '/../json.php';
require_once dirname(__DIR__, 2) . '/cost_optimizer.php';
require_once __DIR__ . '/../auth/password.php';
require_once __DIR__ . '/../auth/session.php';
require_once __DIR__ . '/../auth/csrf.php';

function adachat_handle_system_actions(string $action): bool
{
    // 供 Vite 开发页（index.html）拉取 CSRF，与 AI.php / vchat.php 中 meta 一致
    if ($action === 'csrf_token') {
        adachat_json(['csrf_token' => adachat_csrf_get_or_create_token()]);
    }

    // 设置访问密码（保存到服务器端文件）
    if ($action === 'set_password') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        $password = is_array($input) ? (string) ($input['password'] ?? '') : '';
        adachat_json(adachat_auth_set_password($password));
    }

    // 获取成本优化设置
    if ($action === 'get_cost_settings') {
        adachat_json(['success' => true, 'settings' => getCostSettings()]);
    }

    // 保存成本优化设置
    if ($action === 'save_cost_settings') {
        $input = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($input) || !isset($input['settings'])) {
            adachat_json(['success' => false, 'error' => '无效数据'], 400);
        }
        saveCostSettings($input['settings']);
        adachat_json(['success' => true]);
    }

    // 检查最新 release（服务端代查，避免前端直连 GitHub API 被限流/跨域拦截）
    if ($action === 'check_update') {
        $updateUrl = 'https://api.github.com/repos/saviorwq/Ada-chat/releases/latest';
        $ch = curl_init($updateUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 4);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: application/vnd.github+json',
            'User-Agent: AdaChat-UpdateChecker/1.0',
        ]);
        $resp = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($resp === false || $httpCode !== 200) {
            adachat_json([
                'success' => false,
                'error' => 'update_fetch_failed',
                'message' => 'HTTP ' . $httpCode . ($curlError ? (' - ' . $curlError) : ''),
            ]);
        }

        $data = json_decode((string) $resp, true);
        if (!is_array($data)) {
            adachat_json([
                'success' => false,
                'error' => 'update_parse_failed',
                'message' => 'invalid_json',
            ]);
        }

        adachat_json([
            'success' => true,
            'release' => [
                'tag' => (string) ($data['tag_name'] ?? ''),
                'name' => (string) ($data['name'] ?? ''),
                'body' => (string) ($data['body'] ?? ''),
                'url' => (string) ($data['html_url'] ?? ''),
                'publishedAt' => (string) ($data['published_at'] ?? ''),
            ],
        ]);
    }

    // 启动时 ensure 本机后台（llama-server 等；仅本机）
    // Ensure local background services on app boot (local requests only)
    if ($action === 'ensure_local_services') {
        if (!adachat_is_local_request()) {
            adachat_json(['success' => false, 'error' => 'forbidden_non_local'], 403);
        }
        if (session_status() === PHP_SESSION_ACTIVE) {
            @session_write_close();
        }
        $ensure = adachat_schedule_ensure_local_services();
        adachat_json([
            'success' => true,
            'ensure_scheduled' => (bool) ($ensure['ok'] ?? false),
            'ensure_result' => $ensure,
        ]);
    }

    // 安全退出：立刻停 llama（释显存）+ 延迟停 PHP（仅本机）
    // Safe exit: stop llama now (free VRAM) + delayed PHP stop (local only)
    if ($action === 'safe_exit') {
        if (!adachat_is_local_request()) {
            adachat_json(['success' => false, 'error' => 'forbidden_non_local'], 403);
        }
        $stop = adachat_schedule_stop_server();
        adachat_auth_clear_session_and_logout();
        adachat_json([
            'success' => true,
            'stop_scheduled' => (bool) ($stop['ok'] ?? false),
            'llama_stopped' => (bool) (($stop['llama']['ok'] ?? false)),
            'stop_result' => $stop,
        ]);
    }

    return false;
}

