<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 成本优化引擎入口（供 cost_optimizer.php 兼容入口调用）
 * Cost optimizer entry (used by legacy root entry cost_optimizer.php)
 *
 * 约束 / Constraints:
 * - 依赖 AI_DATA_DIR 已在 ai_config.php 中定义
 * - 保持旧的全局函数名（getCostSettings/saveCostSettings/...）以兼容历史调用
 */

if (!defined('COST_SETTINGS_FILE')) {
    define('COST_SETTINGS_FILE', AI_DATA_DIR . '/cost_settings.json');
}
if (!defined('KV_CACHE_DIR')) {
    define('KV_CACHE_DIR', AI_DATA_DIR . '/kv_cache');
}

require_once __DIR__ . '/message_utils.php';
require_once __DIR__ . '/sliding_window.php';
require_once __DIR__ . '/smart_max_tokens.php';
require_once __DIR__ . '/model_routing.php';
require_once __DIR__ . '/compress_output.php';
require_once __DIR__ . '/prompt_compress.php';
require_once __DIR__ . '/../cache/kv.php';

// ========== 设置读写 ==========

function getCostSettings()
{
    if (!file_exists(COST_SETTINGS_FILE)) {
        return getDefaultCostSettings();
    }
    $data = json_decode((string) file_get_contents(COST_SETTINGS_FILE), true);
    return is_array($data) ? array_merge(getDefaultCostSettings(), $data) : getDefaultCostSettings();
}

function saveCostSettings($settings): void
{
    file_put_contents(
        COST_SETTINGS_FILE,
        json_encode($settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
    );
}

function getDefaultCostSettings(): array
{
    return [
        'sliding_window' => [
            'enabled' => true,
            'max_tokens' => 10000,
            'keep_first_rounds' => 2,
            'keep_last_rounds' => 5,
        ],
        'model_routing' => [
            'enabled' => false,
            'light_model' => '',
            'simple_max_chars' => 30,
            'complex_keywords' => '',
        ],
        'compress_output' => [
            'enabled' => false,
            'instruction' => '',
        ],
        'kv_cache' => [
            'enabled' => false,
            'ttl' => 3600,
            'loose_match' => false,
        ],
        'smart_max_tokens' => [
            'enabled' => false,
            'tiers' => '20:512,100:1024,500:2048,0:4096',
        ],
        'prompt_compress' => [
            'enabled' => false,
        ],
    ];
}

// ========== 兼容包装：旧函数名 → 新模块函数 ==========

function applySlidingWindow($messages)
{
    return adachat_apply_sliding_window($messages);
}

function applyCompressOutput($messages)
{
    return adachat_apply_compress_output($messages);
}

function compressSystemPrompt($messages)
{
    return adachat_compress_system_prompt($messages);
}

function calculateSmartMaxTokens($messages)
{
    return adachat_calculate_smart_max_tokens($messages);
}

function shouldRouteToLightModel($messages)
{
    return adachat_should_route_to_light_model($messages);
}

function getLightModel()
{
    return adachat_get_light_model();
}

