<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * cost_optimizer.php 入口逻辑（模块化）
 * cost_optimizer.php entry controller (module)
 */

function adachat_entry_cost_optimizer(string $workspaceRoot): void
{
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'cost' . DIRECTORY_SEPARATOR . 'entry.php';
}

