<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * PHP built-in server router（根目录占位，逻辑在 backend/dev）
 * Blocks direct web access to sensitive directories
 */
require_once __DIR__ . '/backend/dev/builtin_server_router.php';

return adachat_builtin_server_router_dispatch();
