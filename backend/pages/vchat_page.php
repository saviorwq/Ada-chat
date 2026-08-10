<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Vite 精简版入口逻辑（模块化）
 * Vite slim page controller (module)
 */

function adachat_pages_vchat_entry(string $workspaceRoot): void
{
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'html_page.php';
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'vite_slim_bundle_guard.php';

    $csrfToken = adachat_bootstrap_html_authenticated_page();

    $hrefs = adachat_bootstrap_require_vite_slim_bundle_or_503($workspaceRoot);
    $hasBundle = true;

    require rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'pages' . DIRECTORY_SEPARATOR . 'vchat_view.php';
}
