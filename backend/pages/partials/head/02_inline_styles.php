<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * AI 页内联样式（拆为 inline_styles/*，仅首段含 <style>、末段含 </style>）
 * Inline styles for AI page — split; only first chunk opens <style>, last closes it
 */

$inlineCss = __DIR__ . '/inline_styles';
require $inlineCss . '/css_01_layout_and_controls.php';
require $inlineCss . '/css_02_preset_autoswitch.php';
require $inlineCss . '/css_03_model_search.php';
require $inlineCss . '/css_04_cost_and_close.php';
