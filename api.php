<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * CYOA 数据存储 API
 * CYOA 游戏数据存储 API（需登录 + CSRF 验证）
 */

require_once __DIR__ . '/backend/entrypoints/api_entry.php';
adachat_entry_api(__DIR__);