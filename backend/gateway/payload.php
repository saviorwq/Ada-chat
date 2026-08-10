<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 网关 payload 构造（模块化）
 * Gateway payload builder (module)
 */

function adachat_gateway_build_chat_post_data(
    string $modelName,
    array $messages,
    bool $stream,
    $temperature,
    $topP,
    $presencePenalty,
    $frequencyPenalty,
    $inputMaxTokens,
    $smartMaxTokens,
    $stopSequences,
    $tools = null,
    $toolChoice = null
): array {
    $postData = [
        'model' => $modelName,
        'messages' => $messages,
        'stream' => $stream
    ];

    if (is_numeric($temperature)) {
        $postData['temperature'] = max(0, min(2, (float) $temperature));
    }
    if (is_numeric($topP)) {
        $postData['top_p'] = max(0, min(1, (float) $topP));
    }
    if (is_numeric($presencePenalty)) {
        $postData['presence_penalty'] = max(-2, min(2, (float) $presencePenalty));
    }
    if (is_numeric($frequencyPenalty)) {
        $postData['frequency_penalty'] = max(-2, min(2, (float) $frequencyPenalty));
    }

    if (is_numeric($inputMaxTokens)) {
        $postData['max_tokens'] = max(1, (int) $inputMaxTokens);
    } elseif ($smartMaxTokens !== null) {
        $postData['max_tokens'] = (int) $smartMaxTokens;
    }

    if (is_array($stopSequences)) {
        $cleanStop = [];
        foreach ($stopSequences as $s) {
            $t = trim((string) $s);
            if ($t !== '') $cleanStop[] = $t;
            if (count($cleanStop) >= 8) break;
        }
        if (!empty($cleanStop)) {
            $postData['stop'] = $cleanStop;
        }
    }

    // OpenAI-compatible tool calling passthrough
    if (is_array($tools) && count($tools) > 0) {
        $cleanTools = [];
        foreach ($tools as $tool) {
            if (!is_array($tool)) continue;
            if (($tool['type'] ?? '') !== 'function') continue;
            $fn = $tool['function'] ?? null;
            if (!is_array($fn)) continue;
            $name = trim((string) ($fn['name'] ?? ''));
            if ($name === '' || strlen($name) > 128) continue;
            $entry = [
                'type' => 'function',
                'function' => [
                    'name' => $name,
                    'description' => (string) ($fn['description'] ?? ''),
                ],
            ];
            if (isset($fn['parameters']) && is_array($fn['parameters'])) {
                $entry['function']['parameters'] = $fn['parameters'];
            }
            $cleanTools[] = $entry;
            if (count($cleanTools) >= 32) break;
        }
        if ($cleanTools) {
            $postData['tools'] = $cleanTools;
            if (is_string($toolChoice) && $toolChoice !== '') {
                $postData['tool_choice'] = $toolChoice;
            } elseif (is_array($toolChoice)) {
                $postData['tool_choice'] = $toolChoice;
            } else {
                $postData['tool_choice'] = 'auto';
            }
        }
    }

    return $postData;
}

function adachat_gateway_build_image_post_data(
    string $mode,
    string $modelName,
    string $prompt,
    $imageBase64
): array {
    if ($mode === 'text2img') {
        return [
            'model' => $modelName,
            'prompt' => $prompt,
            'n' => 1,
            'size' => '1024x1024'
        ];
    }

    return [
        'model' => $modelName,
        'prompt' => $prompt,
        'image' => (string) $imageBase64,
        'n' => 1,
        'size' => '1024x1024'
    ];
}

function adachat_gateway_build_video_post_data(
    string $modelName,
    string $prompt
): array {
    return [
        'model' => $modelName,
        'prompt' => $prompt
    ];
}

