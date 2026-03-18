<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * Ada Chat 成本优化引擎
 *
 * 功能：滑动窗口、KV 缓存、模型路由、回复压缩、智能 max_tokens、System Prompt 压缩
 */

define('COST_SETTINGS_FILE', AI_DATA_DIR . '/cost_settings.json');
define('KV_CACHE_DIR', AI_DATA_DIR . '/kv_cache');

// ========== 设置读写 ==========

function getCostSettings() {
    if (!file_exists(COST_SETTINGS_FILE)) {
        return getDefaultCostSettings();
    }
    $data = json_decode(file_get_contents(COST_SETTINGS_FILE), true);
    return is_array($data) ? array_merge(getDefaultCostSettings(), $data) : getDefaultCostSettings();
}

function saveCostSettings($settings) {
    file_put_contents(COST_SETTINGS_FILE, json_encode($settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function getDefaultCostSettings() {
    return [
        'sliding_window' => [
            'enabled' => true,
            'max_tokens' => 10000,
            'keep_first_rounds' => 2,
            'keep_last_rounds' => 5
        ],
        'model_routing' => [
            'enabled' => false,
            'light_model' => '',
            'simple_max_chars' => 30,
            'complex_keywords' => ''
        ],
        'compress_output' => [
            'enabled' => false,
            'instruction' => ''
        ],
        'kv_cache' => [
            'enabled' => false,
            'ttl' => 3600,
            'loose_match' => false
        ],
        'smart_max_tokens' => [
            'enabled' => false,
            'tiers' => '20:512,100:1024,500:2048,0:4096'
        ],
        'prompt_compress' => [
            'enabled' => false
        ]
    ];
}

// ========== 滑动窗口 ==========

function applySlidingWindow($messages) {
    $settings = getCostSettings();
    $sw = $settings['sliding_window'] ?? [];
    if (empty($sw['enabled'])) return $messages;

    $maxTokens = $sw['max_tokens'] ?? 10000;
    $keepFirst = $sw['keep_first_rounds'] ?? 2;
    $keepLast  = $sw['keep_last_rounds'] ?? 5;

    $system = [];
    $conversation = [];
    foreach ($messages as $m) {
        if (($m['role'] ?? '') === 'system') {
            $system[] = $m;
        } else {
            $conversation[] = $m;
        }
    }

    $rounds = [];
    $current = [];
    foreach ($conversation as $m) {
        $current[] = $m;
        if (($m['role'] ?? '') === 'assistant') {
            $rounds[] = $current;
            $current = [];
        }
    }
    if (!empty($current)) {
        $rounds[] = $current;
    }

    if (count($rounds) <= $keepFirst + $keepLast) {
        return $messages;
    }

    $totalTokens = 0;
    foreach ($system as $m) {
        $totalTokens += estimateTokens(getMessageText($m));
    }

    $kept = array_merge(
        array_slice($rounds, 0, $keepFirst),
        array_slice($rounds, -$keepLast)
    );

    $keptTokens = $totalTokens;
    foreach ($kept as $round) {
        foreach ($round as $m) {
            $keptTokens += estimateTokens(getMessageText($m));
        }
    }

    if ($keptTokens >= $maxTokens) {
        $result = $system;
        foreach ($kept as $round) {
            $result = array_merge($result, $round);
        }
        return $result;
    }

    $middle = array_slice($rounds, $keepFirst, count($rounds) - $keepFirst - $keepLast);
    $middleKept = [];
    $remaining = $maxTokens - $keptTokens;

    for ($i = count($middle) - 1; $i >= 0; $i--) {
        $roundTokens = 0;
        foreach ($middle[$i] as $m) {
            $roundTokens += estimateTokens(getMessageText($m));
        }
        if ($roundTokens <= $remaining) {
            array_unshift($middleKept, $middle[$i]);
            $remaining -= $roundTokens;
        } else {
            break;
        }
    }

    $result = $system;
    foreach (array_slice($rounds, 0, $keepFirst) as $round) {
        $result = array_merge($result, $round);
    }
    foreach ($middleKept as $round) {
        $result = array_merge($result, $round);
    }
    foreach (array_slice($rounds, -$keepLast) as $round) {
        $result = array_merge($result, $round);
    }

    return $result;
}

// ========== 回复压缩指令注入 ==========

function applyCompressOutput($messages) {
    $settings = getCostSettings();
    $co = $settings['compress_output'] ?? [];
    if (empty($co['enabled']) || empty($co['instruction'])) return $messages;

    $last = end($messages);
    if ($last && ($last['role'] ?? '') === 'user') {
        $messages[count($messages) - 1]['content'] .= "\n\n[输出要求] " . $co['instruction'];
    }
    return $messages;
}

// ========== System Prompt 压缩 ==========

function compressSystemPrompt($messages) {
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

// ========== 智能 max_tokens ==========

function calculateSmartMaxTokens($messages) {
    $settings = getCostSettings();
    $smt = $settings['smart_max_tokens'] ?? [];
    if (empty($smt['enabled'])) return null;

    $tiersStr = $smt['tiers'] ?? '20:512,100:1024,500:2048,0:4096';
    $tiers = [];
    foreach (explode(',', $tiersStr) as $pair) {
        $parts = explode(':', trim($pair));
        if (count($parts) === 2) {
            $tiers[] = [(int)$parts[0], (int)$parts[1]];
        }
    }
    usort($tiers, function($a, $b) { return $b[0] - $a[0]; });

    $lastUserMsg = '';
    for ($i = count($messages) - 1; $i >= 0; $i--) {
        if (($messages[$i]['role'] ?? '') === 'user') {
            $lastUserMsg = getMessageText($messages[$i]);
            break;
        }
    }

    $charCount = mb_strlen($lastUserMsg);
    foreach ($tiers as $tier) {
        if ($charCount >= $tier[0]) {
            return $tier[1];
        }
    }
    return 4096;
}

// ========== 模型路由 ==========

function shouldRouteToLightModel($messages) {
    $settings = getCostSettings();
    $mr = $settings['model_routing'] ?? [];
    if (empty($mr['enabled'])) return false;

    $lastUserMsg = '';
    for ($i = count($messages) - 1; $i >= 0; $i--) {
        if (($messages[$i]['role'] ?? '') === 'user') {
            $lastUserMsg = getMessageText($messages[$i]);
            break;
        }
    }

    if (mb_strlen($lastUserMsg) > ($mr['simple_max_chars'] ?? 30)) {
        $keywords = array_filter(array_map('trim', explode(',', $mr['complex_keywords'] ?? '')));
        foreach ($keywords as $kw) {
            if ($kw !== '' && mb_strpos($lastUserMsg, $kw) !== false) {
                return false;
            }
        }
    }

    return mb_strlen($lastUserMsg) <= ($mr['simple_max_chars'] ?? 30);
}

function getLightModel() {
    $settings = getCostSettings();
    return $settings['model_routing']['light_model'] ?? '';
}

// ========== KV 缓存 ==========

function _kvCacheDir() {
    if (!is_dir(KV_CACHE_DIR)) {
        mkdir(KV_CACHE_DIR, 0755, true);
    }
    return KV_CACHE_DIR;
}

function _kvCacheKey($messages, $model) {
    $parts = [];
    foreach ($messages as $m) {
        $parts[] = ($m['role'] ?? '') . ':' . getMessageText($m);
    }
    $parts[] = 'model:' . $model;
    return md5(implode('|', $parts));
}

function _kvCacheLooseKey($messages, $model) {
    $userMsgs = [];
    foreach ($messages as $m) {
        if (($m['role'] ?? '') === 'user') {
            $userMsgs[] = getMessageText($m);
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
