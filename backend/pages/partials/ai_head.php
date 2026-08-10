<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * AI 页面 <head>：拆分为 head/*（元信息 + 插件 CSS + 内联样式）
 * AI page <head> — split into head/* partials
 */

$headPartials = __DIR__ . '/head';
require $headPartials . '/01_meta_and_plugin_css.php';
require $headPartials . '/02_inline_styles.php';
require $headPartials . '/03_head_close.php';
