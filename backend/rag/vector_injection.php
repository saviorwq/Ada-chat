<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 向量 RAG 注入（模块化）
 * Vector RAG injection (module)
 *
 * 依赖：
 * - backend/rag_features.php: adachat_build_vector_rag_retrieval()
 * - backend/cost/message_utils.php: adachat_get_message_text()
 */

require_once __DIR__ . '/../rag_features.php';
require_once __DIR__ . '/../cost/message_utils.php';

/**
 * @return array{messages: array, hits: array<int, array{docName:string,chunkIndex:int,preview:string,score?:float}>}
 */
function adachat_rag_apply_vector_injection(array $messages, array $rag): array
{
    $empty = ['messages' => $messages, 'hits' => []];
    if (empty($rag['enabled'])) return $empty;
    if (((string) ($rag['mode'] ?? 'vector')) !== 'vector') return $empty;

    $topK = (int) ($rag['topK'] ?? 4);
    $maxChars = (int) ($rag['maxChars'] ?? 1800);
    $embedModel = trim((string) ($rag['embedModel'] ?? 'qwen3-embedding:0.6b'));

    $query = trim((string) ($rag['query'] ?? ''));
    if ($query === '') {
        for ($i = count($messages) - 1; $i >= 0; $i--) {
            if (($messages[$i]['role'] ?? '') === 'user') {
                $query = trim(adachat_get_message_text($messages[$i]));
                if ($query !== '') break;
            }
        }
    }
    if ($query === '') return $empty;

    $ret = adachat_build_vector_rag_retrieval($query, $topK, $maxChars, $embedModel);
    if (!$ret || empty($ret['prompt'])) return $empty;

    array_unshift($messages, ['role' => 'system', 'content' => (string) $ret['prompt']]);
    return [
        'messages' => $messages,
        'hits' => is_array($ret['hits'] ?? null) ? $ret['hits'] : [],
    ];
}
