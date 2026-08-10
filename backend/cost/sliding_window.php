<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 滑动窗口裁剪（模块化）
 * Sliding window trimming (module)
 *
 * 依赖：
 * - getCostSettings()（cost_optimizer.php）
 * - backend/cost/message_utils.php：adachat_get_message_text/adachat_estimate_tokens
 */

require_once __DIR__ . '/message_utils.php';

function adachat_apply_sliding_window($messages) {
    $settings = getCostSettings();
    $sw = $settings['sliding_window'] ?? [];
    if (empty($sw['enabled'])) return $messages;

    $maxTokens = $sw['max_tokens'] ?? 10000;
    $keepFirst = $sw['keep_first_rounds'] ?? 2;
    $keepLast  = $sw['keep_last_rounds'] ?? 5;

    $system = [];
    $conversation = [];
    foreach ($messages as $m) {
        if (($m['role'] ?? '') === 'system') {
            $system[] = $m;
        } else {
            $conversation[] = $m;
        }
    }

    $rounds = [];
    $current = [];
    foreach ($conversation as $m) {
        $current[] = $m;
        if (($m['role'] ?? '') === 'assistant') {
            $rounds[] = $current;
            $current = [];
        }
    }
    if (!empty($current)) {
        $rounds[] = $current;
    }

    if (count($rounds) <= $keepFirst + $keepLast) {
        return $messages;
    }

    $totalTokens = 0;
    foreach ($system as $m) {
        $totalTokens += adachat_estimate_tokens(adachat_get_message_text($m));
    }

    $kept = array_merge(
        array_slice($rounds, 0, $keepFirst),
        array_slice($rounds, -$keepLast)
    );

    $keptTokens = $totalTokens;
    foreach ($kept as $round) {
        foreach ($round as $m) {
            $keptTokens += adachat_estimate_tokens(adachat_get_message_text($m));
        }
    }

    if ($keptTokens >= $maxTokens) {
        $result = $system;
        foreach ($kept as $round) {
            $result = array_merge($result, $round);
        }
        return $result;
    }

    $middle = array_slice($rounds, $keepFirst, max(0, count($rounds) - $keepFirst - $keepLast));
    $resultMiddle = [];
    $middleTokens = 0;
    foreach ($middle as $round) {
        $roundTokens = 0;
        foreach ($round as $m) {
            $roundTokens += adachat_estimate_tokens(adachat_get_message_text($m));
        }
        if ($keptTokens + $middleTokens + $roundTokens > $maxTokens) {
            break;
        }
        $middleTokens += $roundTokens;
        $resultMiddle[] = $round;
    }

    $result = $system;
    foreach (array_slice($rounds, 0, $keepFirst) as $round) {
        $result = array_merge($result, $round);
    }
    foreach ($resultMiddle as $round) {
        $result = array_merge($result, $round);
    }
    foreach (array_slice($rounds, -$keepLast) as $round) {
        $result = array_merge($result, $round);
    }
    return $result;
}

