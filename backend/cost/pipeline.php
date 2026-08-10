<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 成本优化流水线（Step2~Step7）（模块化）
 * Cost optimization pipeline (Steps 2-7) (module)
 *
 * 职责：
 * - 模型路由（切换 provider/model/apiKey/apiPath）
 * - 滑动窗口裁剪
 * - 输出压缩指令注入
 * - System Prompt 压缩
 * - 缓存对齐（provider 级）
 * - 智能 max_tokens 计算
 *
 * 依赖（来自现有模块/入口文件）：
 * - shouldRouteToLightModel()/getLightModel()/applySlidingWindow()/applyCompressOutput()/compressSystemPrompt()/calculateSmartMaxTokens()（cost_optimizer.php）
 * - adachat_find_provider()（backend/providers.php）
 * - adachat_apply_cache_alignment()（backend/cost/cache_alignment.php）
 */

require_once __DIR__ . '/cache_alignment.php';

function adachat_cost_apply_pipeline(array $args): array {
    $messages = $args['messages'] ?? [];
    $provider = $args['provider'] ?? null;
    $providerId = (string) ($args['providerId'] ?? '');
    $modelName = (string) ($args['modelName'] ?? '');
    $modelParam = (string) ($args['modelParam'] ?? '');
    $apiKey = (string) ($args['apiKey'] ?? '');
    $apiPath = (string) ($args['apiPath'] ?? '/chat/completions');

    $smartMaxTokens = null;

    // Step 2: 模型路由（简单指令 → 廉价模型）
    $originalModel = $modelParam; // 保留：后续可用于回退/统计（与旧逻辑保持一致）
    unset($originalModel);
    if (shouldRouteToLightModel($messages)) {
        $lightModel = getLightModel();
        if ($lightModel && strpos($lightModel, '::') !== false) {
            list($lightProviderId, $lightModelName) = explode('::', $lightModel, 2);
            $lightProvider = adachat_find_provider((string) $lightProviderId);
            if ($lightProvider) {
                $providerId = (string) $lightProviderId;
                $modelName = (string) $lightModelName;
                $provider = $lightProvider;
                $apiKey = trim((string)($provider['api_key'] ?? ''));
                $apiPath = (string) ($provider['chat_path'] ?? '/chat/completions');
            }
        }
    }

    // Step 3: 滑动窗口（裁剪过长历史）
    $messages = applySlidingWindow($messages);

    // Step 4: 压缩回复指令注入
    $messages = applyCompressOutput($messages);

    // Step 5: System Prompt 压缩记号
    $messages = compressSystemPrompt($messages);

    // Step 6: 缓存对齐（provider 级断点/前缀优化）
    if (is_array($provider)) {
        $messages = adachat_apply_cache_alignment($messages, $provider);
    }

    // Step 7: 智能 max_tokens
    $smartMaxTokens = calculateSmartMaxTokens($messages);

    return [
        'messages' => $messages,
        'provider' => $provider,
        'providerId' => $providerId,
        'modelName' => $modelName,
        'apiKey' => $apiKey,
        'apiPath' => $apiPath,
        'smartMaxTokens' => $smartMaxTokens
    ];
}

