<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 门禁校验 - 与青灯拾卷 empty_site 门禁打通
 * Gate check integration for empty_site (ada_gate_verify)
 *
 * 说明 / Notes:
 * - 仅做“是否放行”的布尔判断；具体 Cookie/逻辑在 empty_site/config.php 内实现。
 * - 若未部署 empty_site，则返回 false（不放行）。
 */

function ada_chat_gate_ok(): bool
{
    $candidates = [];

    $dr = $_SERVER['DOCUMENT_ROOT'] ?? '';
    if (is_string($dr) && $dr !== '') {
        $candidates[] = rtrim($dr, "/\\") . DIRECTORY_SEPARATOR . 'empty_site' . DIRECTORY_SEPARATOR . 'config.php';
    }

    // Ada Chat/ -> 上一级
    $candidates[] = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'empty_site' . DIRECTORY_SEPARATOR . 'config.php';
    // Ada Chat/adachat/ -> 上两级
    $candidates[] = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'empty_site' . DIRECTORY_SEPARATOR . 'config.php';

    foreach (array_unique($candidates) as $path) {
        if (!is_string($path) || $path === '' || !file_exists($path)) {
            continue;
        }
        try {
            require_once $path;
            return function_exists('ada_gate_verify') && ada_gate_verify();
        } catch (Throwable) {
            return false;
        }
    }

    return false;
}

