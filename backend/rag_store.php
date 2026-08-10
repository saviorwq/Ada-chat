<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * RAG store（服务端存储，JSON 文件）模块化
 * RAG store (server-side JSON file) module
 *
 * 依赖：ai_config.php 中 AI_DATA_DIR 常量
 * 依赖：backend/utils.php 中 adachat_ulen/adachat_usub
 */

function adachat_rag_store_file_path(): string
{
    return AI_DATA_DIR . '/rag_store.json';
}

/**
 * @return array{version:int, updatedAt:int, docs: array<int, array<string, mixed>>}
 */
function adachat_default_rag_store(): array
{
    return [
        'version' => 2,
        'updatedAt' => time(),
        'docs' => [],
    ];
}

/**
 * @return array{version:int, updatedAt:int, docs: array<int, array<string, mixed>>}
 */
function adachat_load_rag_store(): array
{
    $file = adachat_rag_store_file_path();
    if (!file_exists($file)) {
        return adachat_default_rag_store();
    }
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') {
        return adachat_default_rag_store();
    }
    $data = json_decode($raw, true);
    if (!is_array($data) || !isset($data['docs']) || !is_array($data['docs'])) {
        return adachat_default_rag_store();
    }
    if (!isset($data['version'])) {
        $data['version'] = 2;
    }
    if (!isset($data['updatedAt'])) {
        $data['updatedAt'] = time();
    }
    return $data;
}

/**
 * @param mixed $store
 * @return array{version:int, updatedAt:int, docs: array<int, array<string, mixed>>}
 */
function adachat_sanitize_rag_store($store): array
{
    $safe = adachat_default_rag_store();
    if (!is_array($store)) {
        return $safe;
    }

    $safe['version'] = 2;
    $safe['updatedAt'] = time();
    $docs = $store['docs'] ?? [];
    if (!is_array($docs)) {
        return $safe;
    }

    $maxDocs = 300;
    $maxChunksPerDoc = 3000;
    $maxCharsPerChunk = 2400;
    $maxNameLen = 220;
    $maxTotalChars = 5 * 1000 * 1000; // 5M chars guard
    $totalChars = 0;

    foreach ($docs as $doc) {
        if (!is_array($doc)) {
            continue;
        }
        $name = trim((string) ($doc['name'] ?? ''));
        $id = trim((string) ($doc['id'] ?? ''));
        $chunks = $doc['chunks'] ?? [];
        if ($name === '' || !is_array($chunks)) {
            continue;
        }

        if ($id === '') {
            $id = 'rag_' . bin2hex(random_bytes(6));
        }
        if (adachat_ulen($name) > $maxNameLen) {
            $name = adachat_usub($name, 0, $maxNameLen);
        }

        $safeChunks = [];
        $chunkCount = 0;
        foreach ($chunks as $ch) {
            if (!is_string($ch)) {
                continue;
            }
            $text = trim(str_replace("\r\n", "\n", $ch));
            if ($text === '') {
                continue;
            }
            if (adachat_ulen($text) > $maxCharsPerChunk) {
                $text = adachat_usub($text, 0, $maxCharsPerChunk);
            }
            $len = adachat_ulen($text);
            if ($len < 12) {
                continue;
            }
            $safeChunks[] = $text;
            $chunkCount++;
            $totalChars += $len;
            if ($chunkCount >= $maxChunksPerDoc || $totalChars >= $maxTotalChars) {
                break;
            }
        }

        if (!empty($safeChunks)) {
            $safe['docs'][] = [
                'id' => $id,
                'name' => $name,
                'chunks' => $safeChunks,
                'updatedAt' => time(),
            ];
        }
        if (count($safe['docs']) >= $maxDocs || $totalChars >= $maxTotalChars) {
            break;
        }
    }
    return $safe;
}

/**
 * @param mixed $store
 */
function adachat_save_rag_store($store): bool
{
    if (!is_dir(AI_DATA_DIR)) {
        @mkdir(AI_DATA_DIR, 0755, true);
    }
    $safe = adachat_sanitize_rag_store($store);
    $payload = json_encode($safe, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        return false;
    }
    return @file_put_contents(adachat_rag_store_file_path(), $payload, LOCK_EX) !== false;
}

/**
 * @param array<string, mixed> $store
 * @return array{docs:int, chunks:int, chars:int}
 */
function adachat_rag_store_stats(array $store): array
{
    $docs = is_array($store['docs'] ?? null) ? $store['docs'] : [];
    $docCount = count($docs);
    $chunkCount = 0;
    $charCount = 0;
    foreach ($docs as $doc) {
        $chunks = is_array($doc['chunks'] ?? null) ? $doc['chunks'] : [];
        $chunkCount += count($chunks);
        foreach ($chunks as $ch) {
            if (is_string($ch)) {
                $charCount += adachat_ulen($ch);
            }
        }
    }
    return [
        'docs' => $docCount,
        'chunks' => $chunkCount,
        'chars' => $charCount,
    ];
}

