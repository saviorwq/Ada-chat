<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 回复压缩指令注入（模块化）
 * Output compression instruction injection (module)
 *
 * 依赖：
 * - getCostSettings()（cost_optimizer.php）
 */

function adachat_apply_compress_output($messages) {
    $settings = getCostSettings();
    $co = $settings['compress_output'] ?? [];
    if (empty($co['enabled']) || empty($co['instruction'])) return $messages;

    $last = end($messages);
    if ($last && ($last['role'] ?? '') === 'user') {
        $messages[count($messages) - 1]['content'] .= "\n\n[输出要求] " . $co['instruction'];
    }
    return $messages;
}

