<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 网关输入解析（模块化）
 * Gateway input parser (module)
 */

function adachat_gateway_parse_input(): array
{
    $input = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($input)) {
        $input = [];
    }

    $task = (string) ($input['task'] ?? 'chat');
    $client = strtolower(trim((string) ($input['client'] ?? '')));

    $hasBypassField = array_key_exists('bypassCostOptimizer', $input);
    $bypassCostOptimizer = $hasBypassField ? !empty($input['bypassCostOptimizer']) : false;
    // CYOA 聊天默认直通（绕过省钱策略），除非前端显式传 false。
    if ($task === 'chat' && $client === 'cyoa' && !$hasBypassField) {
        $bypassCostOptimizer = true;
    }

    return [
        'input' => $input,
        'task' => $task,
        'modelParam' => (string) ($input['model'] ?? ''),
        'prompt' => (string) ($input['prompt'] ?? ''),
        'messages' => is_array($input['messages'] ?? null) ? $input['messages'] : [],
        'stream' => !empty($input['stream']),
        'temperature' => $input['temperature'] ?? null,
        'topP' => $input['top_p'] ?? null,
        'presencePenalty' => $input['presence_penalty'] ?? null,
        'frequencyPenalty' => $input['frequency_penalty'] ?? null,
        'inputMaxTokens' => $input['max_tokens'] ?? null,
        'stopSequences' => $input['stop'] ?? null,
        'tools' => is_array($input['tools'] ?? null) ? $input['tools'] : null,
        'toolChoice' => $input['tool_choice'] ?? null,
        'mode' => (string) ($input['mode'] ?? 'text2img'),
        'imageBase64' => $input['image'] ?? '',
        'rag' => is_array($input['rag'] ?? null) ? $input['rag'] : null,
        'client' => $client,
        'hasBypassField' => $hasBypassField,
        'bypassCostOptimizer' => $bypassCostOptimizer,
        'isCyoaBypassCost' => ($task === 'chat' && $client === 'cyoa' && $bypassCostOptimizer),
        'isCyoaChat' => ($task === 'chat' && $client === 'cyoa'),
    ];
}

