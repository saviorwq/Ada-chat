<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/** 成本优化引擎入口（薄入口）。实现见 backend/entrypoints/cost_optimizer_entry.php */

require_once __DIR__ . '/backend/entrypoints/cost_optimizer_entry.php';
adachat_entry_cost_optimizer(__DIR__);
