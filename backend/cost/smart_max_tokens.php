<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 智能 max_tokens（模块化）
 * Smart max_tokens (module)
 *
 * 依赖：
 * - getCostSettings()（cost_optimizer.php）
 * - backend/cost/message_utils.php：adachat_get_message_text
 */

require_once __DIR__ . '/message_utils.php';

function adachat_calculate_smart_max_tokens($messages) {
    $settings = getCostSettings();
    $smt = $settings['smart_max_tokens'] ?? [];
    if (empty($smt['enabled'])) return null;

    $tiersStr = $smt['tiers'] ?? '20:512,100:1024,500:2048,0:4096';
    $tiers = [];
    foreach (explode(',', $tiersStr) as $pair) {
        $parts = explode(':', trim($pair));
        if (count($parts) === 2) {
            $tiers[] = [(int)$parts[0], (int)$parts[1]];
        }
    }
    usort($tiers, function($a, $b) { return $b[0] - $a[0]; });

    $lastUserMsg = '';
    for ($i = count($messages) - 1; $i >= 0; $i--) {
        if (($messages[$i]['role'] ?? '') === 'user') {
            $lastUserMsg = adachat_get_message_text($messages[$i]);
            break;
        }
    }

    $charCount = mb_strlen($lastUserMsg);
    foreach ($tiers as $tier) {
        if ($charCount >= $tier[0]) {
            return $tier[1];
        }
    }
    return 4096;
}

