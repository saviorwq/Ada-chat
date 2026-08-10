<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 兼容入口：安装包与历史 require 仍指向根目录 ai_config.php
 * Shim: installer / legacy require root-level ai_config.php
 */
require_once __DIR__ . '/backend/config/ai_config.php';
