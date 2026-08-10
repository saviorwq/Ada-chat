<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * AI 完整版入口逻辑（模块化）
 * AI full page controller (module)
 */

function adachat_pages_ai_entry(string $workspaceRoot): void
{
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'html_page.php';
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'plugins' . DIRECTORY_SEPARATOR . 'asset_loader.php';
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'vite_full_bundle_guard.php';

    $csrfToken = adachat_bootstrap_html_authenticated_page();

    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'ai_config.php';

    // 获取所有插件资源（模块化）
    $pluginAssets = adachat_load_plugin_assets($workspaceRoot);

    // 仅 Vite：无 dist/full 入口则 503 提示构建（不再加载 legacy adachat-*.js）
    $viteFull = adachat_bootstrap_require_vite_full_bundle_or_503($workspaceRoot);
    $viteFullJsPath = (is_array($viteFull) && !empty($viteFull['js']) && is_string($viteFull['js']))
        ? ($workspaceRoot . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $viteFull['js']))
        : null;

    require rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'pages' . DIRECTORY_SEPARATOR . 'ai_view.php';
}

