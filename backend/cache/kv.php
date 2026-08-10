<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * KV 缓存（模块化）
 * KV cache helpers (module)
 *
 * 依赖：
 * - KV_CACHE_DIR 常量（cost_optimizer.php 定义）
 * - getCostSettings()（cost_optimizer.php 定义）
 * - adachat_get_message_text()（backend/cost/message_utils.php 定义）
 */

function _kvCacheDir() {
    if (!is_dir(KV_CACHE_DIR)) {
        mkdir(KV_CACHE_DIR, 0755, true);
    }
    return KV_CACHE_DIR;
}

function _kvCacheKey($messages, $model) {
    $parts = [];
    foreach ($messages as $m) {
        $parts[] = ($m['role'] ?? '') . ':' . adachat_get_message_text($m);
    }
    $parts[] = 'model:' . $model;
    return md5(implode('|', $parts));
}

function _kvCacheLooseKey($messages, $model) {
    $userMsgs = [];
    foreach ($messages as $m) {
        if (($m['role'] ?? '') === 'user') {
            $userMsgs[] = adachat_get_message_text($m);
        }
    }
    return md5(implode('|', $userMsgs) . '|model:' . $model);
}

function kvCacheLookup($messages, $model) {
    $settings = getCostSettings();
    if (empty($settings['kv_cache']['enabled'])) return null;

    $key = _kvCacheKey($messages, $model);
    $file = _kvCacheDir() . '/' . $key . '.json';
    if (!file_exists($file)) return null;

    $ttl = $settings['kv_cache']['ttl'] ?? 3600;
    if (time() - filemtime($file) > $ttl) {
        @unlink($file);
        return null;
    }

    $data = json_decode(file_get_contents($file), true);
    return $data['content'] ?? null;
}

function kvCacheLooseLookup($messages, $model) {
    $settings = getCostSettings();
    if (empty($settings['kv_cache']['enabled']) || empty($settings['kv_cache']['loose_match'])) return null;

    $key = _kvCacheLooseKey($messages, $model);
    $file = _kvCacheDir() . '/loose_' . $key . '.json';
    if (!file_exists($file)) return null;

    $ttl = $settings['kv_cache']['ttl'] ?? 3600;
    if (time() - filemtime($file) > $ttl) {
        @unlink($file);
        return null;
    }

    $data = json_decode(file_get_contents($file), true);
    return $data['content'] ?? null;
}

function kvCacheStore($messages, $model, $content) {
    $settings = getCostSettings();
    if (empty($settings['kv_cache']['enabled'])) return;

    $key = _kvCacheKey($messages, $model);
    $file = _kvCacheDir() . '/' . $key . '.json';
    file_put_contents($file, json_encode([
        'content' => $content,
        'model' => $model,
        'time' => time()
    ], JSON_UNESCAPED_UNICODE));
}

function kvCacheLooseStore($messages, $model, $content) {
    $settings = getCostSettings();
    if (empty($settings['kv_cache']['enabled']) || empty($settings['kv_cache']['loose_match'])) return;

    $key = _kvCacheLooseKey($messages, $model);
    $file = _kvCacheDir() . '/loose_' . $key . '.json';
    file_put_contents($file, json_encode([
        'content' => $content,
        'model' => $model,
        'time' => time()
    ], JSON_UNESCAPED_UNICODE));
}

function kvCacheEmitSSE($content) {
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('X-Cache-Hit: true');

    $chunks = mb_str_split($content, 4);
    foreach ($chunks as $chunk) {
        $data = json_encode([
            'choices' => [['delta' => ['content' => $chunk]]]
        ], JSON_UNESCAPED_UNICODE);
        echo "data: {$data}\n\n";
        if (ob_get_level()) ob_flush();
        flush();
    }
    echo "data: [DONE]\n\n";
    if (ob_get_level()) ob_flush();
    flush();
}

