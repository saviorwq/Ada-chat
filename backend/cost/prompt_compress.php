<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * System Prompt 压缩（模块化）
 * System prompt compression (module)
 *
 * 依赖：
 * - getCostSettings()（cost_optimizer.php）
 */

function adachat_compress_system_prompt($messages) {
    $settings = getCostSettings();
    if (empty($settings['prompt_compress']['enabled'])) return $messages;

    foreach ($messages as &$m) {
        if (($m['role'] ?? '') === 'system' && is_string($m['content'] ?? null)) {
            $text = $m['content'];
            $text = preg_replace('/\n{3,}/', "\n\n", $text);
            $text = preg_replace('/[ \t]+/', ' ', $text);
            $text = preg_replace('/<!--.*?-->/s', '', $text);
            $m['content'] = trim($text);
        }
    }
    return $messages;
}

