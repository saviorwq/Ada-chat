<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 兼容入口：安装包与历史脚本仍引用根目录 vite-manifest.php
 * Shim: installer / legacy require root-level vite-manifest.php
 */
require_once __DIR__ . '/backend/vite/manifest.php';
