<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * AI.php 页面底部资源注入（Vite full bundle + plugin JS）
 * Footer asset injection for AI.php (Vite full bundle + plugin JS)
 *
 * Expects variables from the caller scope:
 * - $workspaceRoot (string): repo root path (AI.php's __DIR__)
 * - $pluginAssets (array{css: string[], js: string[]}): from adachat_load_plugin_assets()
 */
?>
<!-- 动态加载所有插件的 JS 文件（必须在核心脚本之后加载） -->
<?php foreach (($pluginAssets['js'] ?? []) as $jsFile): ?>
<script src="<?= htmlspecialchars((string) $jsFile, ENT_QUOTES, 'UTF-8') ?>" defer></script>
<?php endforeach; ?>

