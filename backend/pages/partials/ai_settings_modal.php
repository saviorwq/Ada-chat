<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 设置模态框（拆分为 settings/* 片段，便于维护）
 * Settings modal — split into settings/* partials
 */

$settingsPartials = __DIR__ . '/settings';
require $settingsPartials . '/01_sidebar.php';
require $settingsPartials . '/02_main_header.php';
require $settingsPartials . '/03_provider_panel.php';
require $settingsPartials . '/04_model_type_matrix_panels.php';
require $settingsPartials . '/05_preset_word_panels.php';
require $settingsPartials . '/06_rag_panel.php';
require $settingsPartials . '/07_timeout_general_panel.php';
require $settingsPartials . '/08_language_update_profile_panels.php';
require $settingsPartials . '/09_skin_cost_panels.php';
require $settingsPartials . '/10_security_plugin_debug_panels.php';
require $settingsPartials . '/11_placeholder_and_close.php';
