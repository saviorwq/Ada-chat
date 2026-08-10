<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Action 入口（模块化）
 * Action entry (module)
 */

require_once __DIR__ . '/runtime.php';
require_once __DIR__ . '/../json.php';
require_once __DIR__ . '/dispatch.php';

function adachat_actions_entry(string $action): void
{
    adachat_actions_bootstrap_json_fatal();
    if (adachat_dispatch_actions($action)) {
        exit;
    }
    adachat_json(['error' => 'Invalid action'], 404);
}

