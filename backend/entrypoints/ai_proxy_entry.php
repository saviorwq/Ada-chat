<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * ai_proxy.php 入口逻辑（模块化）
 * ai_proxy.php entry controller (module)
 */

function adachat_entry_ai_proxy(string $workspaceRoot): void
{
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'ai_proxy.php';
    adachat_bootstrap_ai_proxy_request();

    $action = $_GET['action'] ?? $_POST['action'] ?? null;
    if ($action) {
        require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'actions' . DIRECTORY_SEPARATOR . 'entry.php';
        adachat_actions_entry((string) $action);
    }

    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'gateway' . DIRECTORY_SEPARATOR . 'entry.php';
    adachat_gateway_entry();
}

