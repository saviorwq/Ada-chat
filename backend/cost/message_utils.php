<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 消息文本提取与粗略 token 估算（模块化）
 * Message text extraction and rough token estimate (module)
 */

require_once __DIR__ . '/../utils.php';

/**
 * 从 message 结构中提取可用于缓存/统计的纯文本。
 *
 * @param array<string, mixed> $msg
 */
function adachat_get_message_text(array $msg): string
{
    $content = $msg['content'] ?? '';
    if (is_string($content)) {
        return $content;
    }
    if (is_array($content)) {
        $parts = [];
        foreach ($content as $part) {
            if (is_array($part) && isset($part['text'])) {
                $parts[] = (string) $part['text'];
            }
        }
        return implode("\n", $parts);
    }
    return '';
}

/**
 * 非严格 token 估算，用于预算/剪枝等启发式。
 */
function adachat_estimate_tokens(string $text): int
{
    $cjk = preg_match_all('/[\x{4e00}-\x{9fff}\x{3000}-\x{303f}\x{ff00}-\x{ffef}]/u', $text);
    $ascii = max(0, adachat_ulen($text) - (int) $cjk);
    return (int) (($cjk * 0.6) + ($ascii / 4));
}

