<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 登录页入口逻辑（模块化）
 * Login page controller (module)
 */

function adachat_pages_login_entry(string $workspaceRoot): void
{
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'html_page.php';
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'ai_config.php';
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'auth' . DIRECTORY_SEPARATOR . 'password.php';
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'auth' . DIRECTORY_SEPARATOR . 'session.php';

    $csrfToken = adachat_bootstrap_html_public_page();
    $error = '';

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $posted = $_POST['_csrf_token'] ?? '';
        if (!hash_equals($csrfToken, (string) $posted)) {
            $error = '请求验证失败，请刷新页面重试';
        } else {
            $password = $_POST['password'] ?? '';
            if (adachat_auth_verify_password((string) $password)) {
                adachat_auth_set_logged_in(true);
                header('Location: AI.php');
                exit;
            }
            $error = '密码错误';
        }
    }

    if (isset($_GET['logout'])) {
        adachat_auth_clear_session_and_logout();
        header('Location: login.php');
        exit;
    }

    if (isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true) {
        header('Location: AI.php');
        exit;
    }

    require rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'pages' . DIRECTORY_SEPARATOR . 'login_view.php';
}

