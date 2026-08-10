<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 成本优化：KV 缓存编排（模块化）
 * Cost pipeline: KV cache orchestration (module)
 *
 * 目标：把 ai_proxy.php 里的“命中后直接返回/写回缓存”逻辑抽出来，
 * 让网关文件更干净，同时保持现有行为（包含 headers + exit）。
 *
 * 依赖：
 * - backend/cache/kv.php：kvCacheLookup/kvCacheLooseLookup/kvCacheEmitSSE/kvCacheStore/kvCacheLooseStore
 */

require_once __DIR__ . '/../cache/kv.php';
require_once __DIR__ . '/../json.php';

function adachat_cost_try_kv_cache_and_respond($messages, string $modelName, bool $stream, bool $isCyoaChat, bool $isCyoaBypassCost, bool $costPipelineEnabled): void {
    // Step 1: KV 缓存命中检测（精确匹配：user + system + model）
    $cachedResponse = kvCacheLookup($messages, $modelName);
    // Step 1b: 宽松匹配（仅 user + model，跨会话复用）
    if ($cachedResponse === null) {
        $cachedResponse = kvCacheLooseLookup($messages, $modelName);
    }
    if ($cachedResponse === null) return;

    if ($stream) {
        if ($isCyoaChat) {
            header('X-CYOA-Bypass-Cost: ' . ($isCyoaBypassCost ? '1' : '0'));
            header('X-CYOA-Cost-Pipeline: ' . ($costPipelineEnabled ? '1' : '0'));
            header('X-CYOA-Cache-Hit: 1');
        }
        kvCacheEmitSSE($cachedResponse);
    } else {
        adachat_json_headers();
        header('X-Cache-Hit: true');
        if ($isCyoaChat) {
            header('X-CYOA-Bypass-Cost: ' . ($isCyoaBypassCost ? '1' : '0'));
            header('X-CYOA-Cost-Pipeline: ' . ($costPipelineEnabled ? '1' : '0'));
            header('X-CYOA-Cache-Hit: 1');
        }
        echo adachat_json_encode_unicode([
            'choices' => [['message' => ['role' => 'assistant', 'content' => $cachedResponse]]],
            'model' => $modelName
        ]);
    }
    exit;
}

function adachat_cost_store_kv_cache($originalMessages, string $modelName, string $content): void {
    if ($content === '') return;
    kvCacheStore($originalMessages, $modelName, $content);
    kvCacheLooseStore($originalMessages, $modelName, $content);
}

