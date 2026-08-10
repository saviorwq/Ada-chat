<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 缓存对齐（模块化）
 * Cache alignment helpers (module)
 */

require_once __DIR__ . '/message_utils.php';

/**
 * @param array<string, mixed> $provider
 */
function adachat_detect_cache_strategy(array $provider): string
{
    $strategy = $provider['cache_strategy'] ?? 'auto';
    if ($strategy !== 'auto') {
        return (string) $strategy;
    }

    $url = strtolower((string) ($provider['base_url'] ?? ''));
    if (strpos($url, 'anthropic') !== false) {
        return 'breakpoint';
    }
    if (strpos($url, 'openrouter') !== false) {
        return 'breakpoint';
    }
    if (strpos($url, 'deepseek') !== false) {
        return 'prefix';
    }
    if (strpos($url, 'openai') !== false) {
        return 'prefix';
    }
    return 'prefix';
}

/**
 * @param array<int, array<string, mixed>> $messages
 * @param array<string, mixed> $provider
 * @return array<int, array<string, mixed>>
 */
function adachat_apply_cache_alignment(array $messages, array $provider): array
{
    $strategy = adachat_detect_cache_strategy($provider);
    if ($strategy === 'none' || empty($messages)) {
        return $messages;
    }

    $count = count($messages);
    $lastSystemIdx = -1;
    for ($i = 0; $i < $count; $i++) {
        if (($messages[$i]['role'] ?? '') === 'system') {
            $lastSystemIdx = $i;
        }
    }

    if ($strategy === 'breakpoint') {
        // Anthropic / OpenRouter: 在 system 消息和历史末尾插入 cache_control 断点
        if ($lastSystemIdx >= 0) {
            $sysContent = $messages[$lastSystemIdx]['content'] ?? '';
            if (is_string($sysContent)) {
                $messages[$lastSystemIdx]['content'] = [
                    ['type' => 'text', 'text' => $sysContent, 'cache_control' => ['type' => 'ephemeral']],
                ];
            } elseif (is_array($sysContent)) {
                $lastIdx = count($sysContent) - 1;
                if ($lastIdx >= 0 && isset($sysContent[$lastIdx]['type']) && $sysContent[$lastIdx]['type'] === 'text') {
                    $messages[$lastSystemIdx]['content'][$lastIdx]['cache_control'] = ['type' => 'ephemeral'];
                }
            }
        }

        // 断点 2: 倒数第二条消息（缓存整个对话历史，只有最新 user message 是新的）
        if ($count >= 3) {
            $histEnd = $count - 2;
            $hContent = $messages[$histEnd]['content'] ?? '';
            if (is_string($hContent)) {
                $messages[$histEnd]['content'] = [
                    ['type' => 'text', 'text' => $hContent, 'cache_control' => ['type' => 'ephemeral']],
                ];
            } elseif (is_array($hContent)) {
                $lastIdx = count($hContent) - 1;
                if ($lastIdx >= 0 && isset($hContent[$lastIdx]['type']) && $hContent[$lastIdx]['type'] === 'text') {
                    $messages[$histEnd]['content'][$lastIdx]['cache_control'] = ['type' => 'ephemeral'];
                }
            }
        }
    }

    if ($strategy === 'prefix') {
        // OpenAI / DeepSeek: 自动前缀缓存，不需要显式标记
        // 但确保 system 消息合并在最前面，最大化前缀命中率
        $systemMsgs = [];
        $otherMsgs = [];
        foreach ($messages as $msg) {
            if (($msg['role'] ?? '') === 'system') {
                $systemMsgs[] = $msg;
            } else {
                $otherMsgs[] = $msg;
            }
        }
        if (count($systemMsgs) > 1) {
            $merged = '';
            foreach ($systemMsgs as $sm) {
                $merged .= adachat_get_message_text($sm) . "\n\n";
            }
            $messages = array_merge(
                [['role' => 'system', 'content' => trim($merged)]],
                $otherMsgs
            );
        }
    }

    return $messages;
}

