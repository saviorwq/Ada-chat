<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/** 统一 AI 网关入口（薄入口）。实现见 backend/entrypoints/ai_proxy_entry.php */

require_once __DIR__ . '/backend/entrypoints/ai_proxy_entry.php';
adachat_entry_ai_proxy(__DIR__);