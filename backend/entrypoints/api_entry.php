<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * api.php 入口逻辑（模块化）
 * api.php entry controller (module)
 *
 * 约束 / Constraint:
 * - 插件后端路由保持内联在 backend/api/entry.php（不单独拆路由文件）
 */

function adachat_entry_api(string $workspaceRoot): void
{
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'json_api.php';
    adachat_bootstrap_json_api_request();

    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'entry.php';

    // 1) 插件后端路由（优先）：api.php?plugin=<id>&action=<action>
    adachat_api_maybe_route_plugin_backend($workspaceRoot);

    // 2) CYOA 数据存储 API（save/load/list/delete）
    adachat_api_handle_cyoa_storage($workspaceRoot);
}

