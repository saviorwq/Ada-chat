<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * AI 完整版页面视图（由 AI.php require）
 * AI full-page view (included from AI.php)
 *
 * 期望调用方已设置 / Expected from caller:
 * $workspaceRoot, $csrfToken, $pluginAssets, $viteFull, $viteFullJsPath
 */

require $workspaceRoot . '/backend/pages/partials/ai_head.php';
require $workspaceRoot . '/backend/pages/partials/ai_body_shell.php';
require $workspaceRoot . '/backend/pages/partials/ai_modals_help_support.php';
require $workspaceRoot . '/backend/pages/partials/ai_settings_modal.php';
require $workspaceRoot . '/backend/pages/partials/ai_footer_assets.php';
