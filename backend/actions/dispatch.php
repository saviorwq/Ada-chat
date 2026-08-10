<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 统一 action 分发（模块化）
 * Unified action dispatcher (module)
 */

require_once __DIR__ . '/system.php';
require_once __DIR__ . '/providers.php';
require_once __DIR__ . '/video.php';
require_once __DIR__ . '/image.php';
require_once __DIR__ . '/rag.php';

function adachat_dispatch_actions(string $action): bool
{
    if (adachat_handle_system_actions($action)) return true;
    if (adachat_handle_providers_actions($action)) return true;
    if (adachat_handle_video_actions($action)) return true;
    if (adachat_handle_image_actions($action)) return true;
    if (adachat_handle_rag_actions($action)) return true;
    return false;
}

