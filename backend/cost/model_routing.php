<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 模型路由（模块化）
 * Model routing (module)
 *
 * 依赖：
 * - getCostSettings()（cost_optimizer.php）
 * - backend/cost/message_utils.php：adachat_get_message_text
 */

require_once __DIR__ . '/message_utils.php';

function adachat_should_route_to_light_model($messages) {
    $settings = getCostSettings();
    $mr = $settings['model_routing'] ?? [];
    if (empty($mr['enabled'])) return false;

    $lastUserMsg = '';
    for ($i = count($messages) - 1; $i >= 0; $i--) {
        if (($messages[$i]['role'] ?? '') === 'user') {
            $lastUserMsg = adachat_get_message_text($messages[$i]);
            break;
        }
    }

    if (mb_strlen($lastUserMsg) > ($mr['simple_max_chars'] ?? 30)) {
        $keywords = array_filter(array_map('trim', explode(',', $mr['complex_keywords'] ?? '')));
        foreach ($keywords as $kw) {
            if ($kw !== '' && mb_strpos($lastUserMsg, $kw) !== false) {
                return false;
            }
        }
    }

    return mb_strlen($lastUserMsg) <= ($mr['simple_max_chars'] ?? 30);
}

function adachat_get_light_model() {
    $settings = getCostSettings();
    return $settings['model_routing']['light_model'] ?? '';
}

