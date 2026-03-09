<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 统一 AI 网关 - 支持聊天、图像生成、视频生成
 * 修复：统一 session_name 为 ADASESSID，解决 403 权限错误
 * 增强：获取模型列表时兼容更多 API 响应格式，包括直接返回数组的情况（如 Together AI）
 * 新增：支持图像生成（文生图/图生图）和视频生成
 */
require_once('ai_config.php');
require_once(__DIR__ . '/cost_optimizer.php');

session_name('ADASESSID');
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true) {
    header('HTTP/1.1 403 Forbidden');
    exit(json_encode(['error' => 'Unauthorized']));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrfToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (empty($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $csrfToken)) {
        http_response_code(403);
        exit(json_encode(['error' => 'CSRF token mismatch']));
    }
}

if (!is_dir(AI_DATA_DIR)) {
    mkdir(AI_DATA_DIR, 0755, true);
}

// ---------- 辅助函数 ----------
function getProviders() {
    if (!file_exists(AI_PROVIDERS_FILE)) {
        @file_put_contents(AI_PROVIDERS_FILE, json_encode([], JSON_UNESCAPED_UNICODE), LOCK_EX);
    }
    if (!file_exists(AI_PROVIDERS_FILE)) {
        return [];
    }
    $fp = @fopen(AI_PROVIDERS_FILE, 'r');
    if (!$fp) return [];
    $raw = '';
    if (@flock($fp, LOCK_SH)) {
        $raw = stream_get_contents($fp);
        @flock($fp, LOCK_UN);
    } else {
        $raw = stream_get_contents($fp);
    }
    @fclose($fp);
    $data = json_decode((string)$raw, true);
    return $data ?: [];
}

function saveProviders($providers) {
    if (!is_dir(AI_DATA_DIR)) {
        @mkdir(AI_DATA_DIR, 0755, true);
    }
    $payload = json_encode($providers, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($payload === false) $payload = '[]';
    @file_put_contents(AI_PROVIDERS_FILE, $payload, LOCK_EX);
}

function findProvider($id) {
    $providers = getProviders();
    foreach ($providers as $p) {
        if ($p['id'] === $id) return $p;
    }
    return null;
}

function isLocalRequest() {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    if ($ip === '127.0.0.1' || $ip === '::1' || $ip === '::ffff:127.0.0.1') {
        return true;
    }
    return false;
}

function scheduleStopServer() {
    if (!isExecAvailable()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }
    $stopBat = __DIR__ . DIRECTORY_SEPARATOR . 'stop.bat';
    if (!file_exists($stopBat)) {
        return ['ok' => false, 'error' => 'stop_bat_missing'];
    }
    // Delay 1-2s to ensure HTTP response is sent first.
    if (stripos(PHP_OS, 'WIN') === 0) {
        $bat = str_replace('"', '""', $stopBat);
        $cmd = 'start "" /B cmd /c "ping 127.0.0.1 -n 2 >nul & ""' . $bat . '"""';
        @exec($cmd, $out, $code);
        return ['ok' => true, 'cmd' => $cmd];
    }
    $cmd = 'sh -c ' . escapeshellarg('sleep 1; ' . escapeshellarg($stopBat) . ' >/dev/null 2>&1 &');
    @exec($cmd, $out, $code);
    return ['ok' => true, 'cmd' => $cmd];
}

function ulen($text) {
    $s = (string)$text;
    if (function_exists('mb_strlen')) {
        return mb_strlen($s, 'UTF-8');
    }
    return strlen($s);
}

function usub($text, $start, $length) {
    $s = (string)$text;
    $st = (int)$start;
    $ln = (int)$length;
    if (function_exists('mb_substr')) {
        return mb_substr($s, $st, $ln, 'UTF-8');
    }
    return substr($s, $st, $ln);
}

function inferModelType($modelId) {
    $id = strtolower(trim((string)$modelId));
    if ($id === '') return 'chat';

    // embedding / rerank models are not for chat generation.
    if (
        strpos($id, 'embed') !== false ||
        strpos($id, 'embedding') !== false ||
        strpos($id, 'bge-') !== false ||
        strpos($id, 'e5-') !== false ||
        strpos($id, 'gte-') !== false ||
        strpos($id, 'rerank') !== false
    ) {
        return 'embedding';
    }
    if (strpos($id, 'ocr') !== false || strpos($id, 'asr') !== false) return 'ocr';
    if (
        strpos($id, 'vision') !== false ||
        strpos($id, 'vl-') !== false ||
        strpos($id, 'llava') !== false
    ) {
        return 'vision';
    }
    if (
        strpos($id, 'translate') !== false ||
        strpos($id, 'translation') !== false ||
        strpos($id, 'nllb') !== false
    ) {
        return 'translation';
    }
    if (strpos($id, 'video') !== false || strpos($id, 'sora') !== false) return 'video';
    if (
        strpos($id, 'image') !== false ||
        strpos($id, 'sdxl') !== false ||
        strpos($id, 'stable-diffusion') !== false ||
        strpos($id, 'flux') !== false ||
        strpos($id, 'wanx') !== false
    ) {
        return 'image';
    }
    if (
        strpos($id, 'coder') !== false ||
        strpos($id, 'code') !== false ||
        strpos($id, 'deepseek-coder') !== false
    ) {
        return 'code';
    }
    return 'chat';
}

function normalizeAllModelObjects($allModels) {
    $out = [];
    $seen = [];
    foreach ($allModels as $m) {
        $id = trim((string)$m);
        if ($id === '' || isset($seen[$id])) continue;
        $seen[$id] = true;
        $out[] = [
            'id' => $id,
            'type' => inferModelType($id),
        ];
    }
    return $out;
}

function getRagVectorScriptPath() {
    return __DIR__ . '/rag_vector_bridge.py';
}

function getRagVectorStorePath() {
    return AI_DATA_DIR . '/rag_store.json';
}

function getRagVectorDbDir() {
    return AI_DATA_DIR . '/rag_vector_db';
}

function isExecAvailable() {
    if (!function_exists('exec')) return false;
    $disabled = array_map('trim', explode(',', (string)ini_get('disable_functions')));
    return !in_array('exec', $disabled, true);
}

function getPythonCommands() {
    $out = [];
    $push = function($exe, $extra = []) use (&$out) {
        $key = strtolower($exe . '|' . implode(' ', $extra));
        if (!isset($out[$key])) {
            $out[$key] = ['exe' => $exe, 'extra' => $extra];
        }
    };

    // Command-style launchers
    $push('py', ['-3']);
    $push('py', []);
    $push('python', []);
    $push('python3', []);

    // Absolute paths (Windows common locations)
    $absCandidates = [
        'C:\\Users\\Administrator\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe',
        'C:\\Users\\Administrator\\AppData\\Local\\Python\\bin\\python.exe',
        '/usr/bin/python3',
        '/usr/local/bin/python3',
        '/opt/python/bin/python3',
    ];
    $userProfile = (string)($_SERVER['USERPROFILE'] ?? getenv('USERPROFILE') ?? '');
    if ($userProfile !== '') {
        $absCandidates[] = $userProfile . '\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe';
        $absCandidates[] = $userProfile . '\\AppData\\Local\\Python\\bin\\python.exe';
    }
    $envPython = trim((string)getenv('RAG_PYTHON_BIN'));
    if ($envPython !== '') {
        $absCandidates[] = $envPython;
    }
    foreach ($absCandidates as $p) {
        if ($p && file_exists($p)) {
            $push($p, []);
        }
    }
    return array_values($out);
}

function buildCommandLine($pySpec, $script, $subcommand, $args = []) {
    $parts = [escapeshellarg((string)$pySpec['exe'])];
    foreach (($pySpec['extra'] ?? []) as $e) {
        $parts[] = escapeshellarg((string)$e);
    }
    $parts[] = escapeshellarg((string)$script);
    $parts[] = escapeshellarg((string)$subcommand);
    foreach ($args as $k => $v) {
        if ($v === null || $v === '') continue;
        $parts[] = escapeshellarg((string)$k);
        $parts[] = escapeshellarg((string)$v);
    }
    return implode(' ', $parts) . ' 2>&1';
}

function parseJsonFromMixedOutput($raw) {
    $txt = trim((string)$raw);
    if ($txt === '') return null;
    $parsed = json_decode($txt, true);
    if (is_array($parsed)) return $parsed;

    // Fallback: parse the last non-empty line as JSON.
    $lines = preg_split('/\r\n|\r|\n/', $txt);
    if (!is_array($lines)) return null;
    for ($i = count($lines) - 1; $i >= 0; $i--) {
        $line = trim((string)$lines[$i]);
        if ($line === '') continue;
        $cand = json_decode($line, true);
        if (is_array($cand)) return $cand;
    }
    return null;
}

function runRagVectorBridge($subcommand, $args = []) {
    $script = getRagVectorScriptPath();
    if (!file_exists($script)) {
        return ['ok' => false, 'error' => 'vector_bridge_missing'];
    }
    if (!isExecAvailable()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }

    $defaultArgs = [
        '--store' => getRagVectorStorePath(),
        '--db-dir' => getRagVectorDbDir(),
        '--collection' => 'adachat_rag',
    ];
    $merged = array_merge($defaultArgs, $args);

    $attempts = [];
    foreach (getPythonCommands() as $py) {
        $cmd = buildCommandLine($py, $script, $subcommand, $merged);
        $lines = [];
        $code = 1;
        @exec($cmd, $lines, $code);
        $raw = trim(implode("\n", $lines));
        $attempts[] = [
            'cmd' => $cmd,
            'exit_code' => $code,
            'output' => usub($raw, 0, 500),
        ];
        if ($code !== 0) {
            continue;
        }
        $parsed = parseJsonFromMixedOutput($raw);
        if (is_array($parsed)) {
            return ['ok' => true, 'data' => $parsed];
        }
    }

    return [
        'ok' => false,
        'error' => 'vector_bridge_exec_failed',
        'detail' => ['attempts' => $attempts],
    ];
}

function installRagVectorDeps() {
    if (!isExecAvailable()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }
    $attempts = [];
    foreach (getPythonCommands() as $pySpec) {
        $base = [escapeshellarg((string)$pySpec['exe'])];
        foreach (($pySpec['extra'] ?? []) as $e) {
            $base[] = escapeshellarg((string)$e);
        }
        $ensureCmd = implode(' ', $base) . ' -m ensurepip --upgrade 2>&1';
        @exec($ensureCmd, $dummy, $dummyCode);

        $installCmd = implode(' ', $base) . ' -m pip install chromadb 2>&1';
        $lines = [];
        $code = 1;
        @exec($installCmd, $lines, $code);
        $raw = trim(implode("\n", $lines));
        $attempts[] = [
            'cmd' => $installCmd,
            'exit_code' => $code,
            'output' => usub($raw, 0, 500),
        ];
        if ($code === 0) {
            return [
                'ok' => true,
                'cmd' => $installCmd,
                'output' => $raw,
            ];
        }
    }
    return [
        'ok' => false,
        'error' => 'install_failed',
        'detail' => ['attempts' => $attempts],
    ];
}

function buildVectorRagSystemPrompt($query, $topK, $maxChars, $embedModel) {
    $ret = runRagVectorBridge('retrieve', [
        '--query' => (string)$query,
        '--top-k' => max(1, (int)$topK),
        '--max-chars' => max(600, (int)$maxChars),
        '--embed-model' => (string)$embedModel,
    ]);
    if (!$ret['ok']) return null;
    $data = $ret['data'] ?? [];
    $hits = $data['hits'] ?? [];
    if (!is_array($hits) || empty($hits)) return null;

    $refs = [];
    foreach ($hits as $h) {
        $doc = trim((string)($h['doc_name'] ?? 'doc'));
        $idx = (int)($h['chunk_index'] ?? 0) + 1;
        $txt = trim((string)($h['text'] ?? ''));
        if ($txt === '') continue;
        $refs[] = "【来源:{$doc}#{$idx}】\n{$txt}";
    }
    if (empty($refs)) return null;
    return "以下是从本地知识库检索到的参考资料。回答时请优先参考这些内容；若资料不足，请明确说明并给出保守结论。\n\n" . implode("\n\n", $refs);
}

function getRagStoreFilePath() {
    return AI_DATA_DIR . '/rag_store.json';
}

function defaultRagStore() {
    return [
        'version' => 2,
        'updatedAt' => time(),
        'docs' => []
    ];
}

function loadRagStore() {
    $file = getRagStoreFilePath();
    if (!file_exists($file)) {
        return defaultRagStore();
    }
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') {
        return defaultRagStore();
    }
    $data = json_decode($raw, true);
    if (!is_array($data) || !isset($data['docs']) || !is_array($data['docs'])) {
        return defaultRagStore();
    }
    if (!isset($data['version'])) {
        $data['version'] = 2;
    }
    if (!isset($data['updatedAt'])) {
        $data['updatedAt'] = time();
    }
    return $data;
}

function sanitizeRagStore($store) {
    $safe = defaultRagStore();
    if (!is_array($store)) return $safe;

    $safe['version'] = 2;
    $safe['updatedAt'] = time();
    $docs = $store['docs'] ?? [];
    if (!is_array($docs)) return $safe;

    $maxDocs = 300;
    $maxChunksPerDoc = 3000;
    $maxCharsPerChunk = 2400;
    $maxNameLen = 220;
    $maxTotalChars = 5 * 1000 * 1000; // 5M chars guard
    $totalChars = 0;

    foreach ($docs as $doc) {
        if (!is_array($doc)) continue;
        $name = trim((string)($doc['name'] ?? ''));
        $id = trim((string)($doc['id'] ?? ''));
        $chunks = $doc['chunks'] ?? [];
        if ($name === '' || !is_array($chunks)) continue;

        if ($id === '') {
            $id = 'rag_' . bin2hex(random_bytes(6));
        }
        if (ulen($name) > $maxNameLen) {
            $name = usub($name, 0, $maxNameLen);
        }

        $safeChunks = [];
        $chunkCount = 0;
        foreach ($chunks as $ch) {
            if (!is_string($ch)) continue;
            $text = trim(str_replace("\r\n", "\n", $ch));
            if ($text === '') continue;
            if (ulen($text) > $maxCharsPerChunk) {
                $text = usub($text, 0, $maxCharsPerChunk);
            }
            $len = ulen($text);
            if ($len < 12) continue;
            $safeChunks[] = $text;
            $chunkCount++;
            $totalChars += $len;
            if ($chunkCount >= $maxChunksPerDoc || $totalChars >= $maxTotalChars) break;
        }

        if (!empty($safeChunks)) {
            $safe['docs'][] = [
                'id' => $id,
                'name' => $name,
                'chunks' => $safeChunks,
                'updatedAt' => time()
            ];
        }
        if (count($safe['docs']) >= $maxDocs || $totalChars >= $maxTotalChars) break;
    }
    return $safe;
}

function saveRagStore($store) {
    if (!is_dir(AI_DATA_DIR)) {
        @mkdir(AI_DATA_DIR, 0755, true);
    }
    $safe = sanitizeRagStore($store);
    $payload = json_encode($safe, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        return false;
    }
    return @file_put_contents(getRagStoreFilePath(), $payload, LOCK_EX) !== false;
}

function ragStoreStats($store) {
    $docs = is_array($store['docs'] ?? null) ? $store['docs'] : [];
    $docCount = count($docs);
    $chunkCount = 0;
    $charCount = 0;
    foreach ($docs as $doc) {
        $chunks = is_array($doc['chunks'] ?? null) ? $doc['chunks'] : [];
        $chunkCount += count($chunks);
        foreach ($chunks as $ch) {
            if (is_string($ch)) $charCount += ulen($ch);
        }
    }
    return [
        'docs' => $docCount,
        'chunks' => $chunkCount,
        'chars' => $charCount
    ];
}

// 兼容低版本 PHP 的 array_is_list 判断
function isList($arr) {
    if (!is_array($arr)) return false;
    $i = 0;
    foreach ($arr as $k => $v) {
        if ($k !== $i++) return false;
    }
    return true;
}

function normalizeDeploymentType($rawType) {
    $type = strtolower(trim((string)$rawType));
    return $type === 'local' ? 'local' : 'cloud';
}

function buildApiHeaders($apiKey) {
    $headers = ['Content-Type: application/json'];
    $trimmedKey = trim((string)$apiKey);
    if ($trimmedKey !== '') {
        $headers[] = 'Authorization: Bearer ' . $trimmedKey;
    }
    $headers[] = 'HTTP-Referer: ' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $headers[] = 'X-Title: Ada Chat';
    return $headers;
}

// ---------- API 路由 ----------
$action = $_GET['action'] ?? $_POST['action'] ?? null;
if ($action) {
    if (!headers_sent()) {
        header('Content-Type: application/json');
    }
    // Ensure fatal errors in action path still return JSON.
    @ob_start();
    register_shutdown_function(function () {
        $err = error_get_last();
        if (!$err) return;
        $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
        if (!in_array($err['type'] ?? 0, $fatalTypes, true)) return;
        $buf = '';
        if (ob_get_level() > 0) {
            $buf = (string)ob_get_contents();
            @ob_clean();
        }
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json');
        }
        echo json_encode([
            'success' => false,
            'error' => 'php_fatal',
            'message' => (string)($err['message'] ?? ''),
            'file' => basename((string)($err['file'] ?? '')),
            'line' => (int)($err['line'] ?? 0),
            'buffer' => usub(trim($buf), 0, 600),
        ], JSON_UNESCAPED_UNICODE);
    });

    // 获取所有供应商
    if ($action === 'get_providers') {
        $providers = getProviders();
        foreach ($providers as &$p) {
            unset($p['api_key']);
        }
        echo json_encode($providers);
        exit;
    }

    // 获取单个供应商
    if ($action === 'get_provider') {
        $id = $_GET['id'] ?? '';
        $p = findProvider($id);
        if ($p) {
            unset($p['api_key']);
            echo json_encode($p);
        } else {
            echo json_encode(null);
        }
        exit;
    }

    // 保存供应商（新增图像/视频路径）
    if ($action === 'save_provider') {
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? null;
        $name = $input['name'] ?? '';
        $base_url = rtrim($input['base_url'] ?? '', '/');
        $api_key = $input['api_key'] ?? '';
        $models_path = $input['models_path'] ?? '/models';
        $chat_path = $input['chat_path'] ?? '/chat/completions';
        $image_gen_path = $input['image_gen_path'] ?? '/images/generations';
        $image_edit_path = $input['image_edit_path'] ?? '/images/edits';
        $video_path = $input['video_path'] ?? '/videos/generations';
        $cache_strategy = $input['cache_strategy'] ?? 'auto';
        $deployment_type = normalizeDeploymentType($input['deployment_type'] ?? 'cloud');

        if (!$name || !$base_url) {
            echo json_encode(['success' => false, 'error' => '缺少必要字段']);
            exit;
        }
        if (!$id && !$api_key && $deployment_type !== 'local') {
            echo json_encode(['success' => false, 'error' => '新增供应商必须提供 API Key']);
            exit;
        }

        $providers = getProviders();
        if ($id) {
            foreach ($providers as &$p) {
                if ($p['id'] === $id) {
                    $p['name'] = $name;
                    $p['base_url'] = $base_url;
                    if ($deployment_type === 'local' && $api_key === '') {
                        // Local providers commonly run without API key.
                        $p['api_key'] = '';
                    } elseif (!empty($api_key)) {
                        $p['api_key'] = $api_key;
                    }
                    $p['models_path'] = $models_path;
                    $p['chat_path'] = $chat_path;
                    $p['image_gen_path'] = $image_gen_path;
                    $p['image_edit_path'] = $image_edit_path;
                    $p['video_path'] = $video_path;
                    $p['cache_strategy'] = $cache_strategy;
                    $p['deployment_type'] = $deployment_type;
                    break;
                }
            }
        } else {
            $id = uniqid('prov_');
            $providers[] = [
                'id' => $id,
                'name' => $name,
                'base_url' => $base_url,
                'api_key' => $api_key,
                'models_path' => $models_path,
                'chat_path' => $chat_path,
                'image_gen_path' => $image_gen_path,
                'image_edit_path' => $image_edit_path,
                'video_path' => $video_path,
                'cache_strategy' => $cache_strategy,
                'deployment_type' => $deployment_type,
                'all_models' => [],
                'models' => []
            ];
        }
        saveProviders($providers);
        echo json_encode(['success' => true, 'id' => $id]);
        exit;
    }

    // 删除供应商
    if ($action === 'delete_provider') {
        $id = $_GET['id'] ?? '';
        $providers = getProviders();
        $providers = array_filter($providers, fn($p) => $p['id'] !== $id);
        saveProviders(array_values($providers));
        echo json_encode(['success' => true]);
        exit;
    }

    // 获取模型列表（从供应商 API 拉取全量，存入 all_models）
    if ($action === 'fetch_models') {
        $id = $_GET['id'] ?? '';
        $provider = findProvider($id);
        if (!$provider) {
            echo json_encode(['success' => false, 'error' => '供应商不存在']);
            exit;
        }

        $url = $provider['base_url'] . $provider['models_path'];
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, buildApiHeaders($provider['api_key'] ?? ''));
        $caFile = __DIR__ . '/php/ssl/cacert.pem';
        if (stripos(PHP_OS, 'WIN') === 0 && file_exists($caFile) && !ini_get('curl.cainfo')) {
            curl_setopt($ch, CURLOPT_CAINFO, $caFile);
        }
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($httpCode !== 200) {
            echo json_encode(['success' => false, 'error' => '获取模型失败，HTTP ' . $httpCode . ($curlError ? ' - ' . $curlError : '')]);
            exit;
        }

        $data = json_decode($response, true);
        if (!$data) {
            echo json_encode(['success' => false, 'error' => '无法解析API响应：' . substr($response, 0, 200)]);
            exit;
        }

        $allModels = [];

        // 情况1：直接数组（如 Together AI 返回的纯数组）
        if (isList($data)) {
            foreach ($data as $item) {
                if (is_string($item)) {
                    $allModels[] = $item;
                } elseif (is_array($item)) {
                    $modelId = $item['id'] ?? $item['model'] ?? $item['name'] ?? null;
                    if (is_string($modelId) && $modelId !== '') {
                        $allModels[] = $modelId;
                    }
                }
            }
        }
        // 情况2：标准 OpenAI 风格 { "data": [ { "id": ... } ] }
        elseif (isset($data['data']) && is_array($data['data'])) {
            foreach ($data['data'] as $item) {
                $modelId = $item['id'] ?? $item['model'] ?? $item['name'] ?? null;
                if (is_string($modelId) && $modelId !== '') {
                    $allModels[] = $modelId;
                }
            }
        }
        // 情况3：{ "models": [ ... ] } 风格
        elseif (isset($data['models']) && is_array($data['models'])) {
            foreach ($data['models'] as $item) {
                if (is_string($item) && $item !== '') {
                    $allModels[] = $item;
                } elseif (is_array($item)) {
                    $modelId = $item['id'] ?? $item['model'] ?? $item['name'] ?? null;
                    if (is_string($modelId) && $modelId !== '') {
                        $allModels[] = $modelId;
                    }
                }
            }
        }
        // 情况4：其他可能的格式，如直接对象映射
        elseif (is_array($data)) {
            // 如果以上都不匹配，尝试遍历所有值
            foreach ($data as $key => $value) {
                if (is_string($value) && $value !== '') {
                    $allModels[] = $value;
                } elseif (is_array($value) && isset($value['id'])) {
                    $allModels[] = $value['id'];
                }
            }
        }

        if (empty($allModels)) {
            $sample = substr($response, 0, 500);
            echo json_encode([
                'success' => false,
                'error' => '未找到任何模型，API返回内容片段：' . $sample
            ]);
            exit;
        }

        // 更新供应商的 all_models 字段，并自动推断模型类型
        $allModelObjects = normalizeAllModelObjects($allModels);
        $providers = getProviders();
        foreach ($providers as &$p) {
            if ($p['id'] === $id) {
                $p['all_models'] = $allModels;
                $p['all_model_objs'] = $allModelObjects;
                break;
            }
        }
        saveProviders($providers);

        echo json_encode([
            'success' => true,
            'models' => $allModels,
            'model_objects' => $allModelObjects
        ]);
        exit;
    }

    // 更新启用的模型列表（用户勾选后保存，包含类型）
    if ($action === 'update_provider_models') {
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? '';
        $models = $input['models'] ?? []; // 预期格式 [ { id: "model1", type: "chat" }, ... ]

        $providers = getProviders();
        $found = false;
        foreach ($providers as &$p) {
            if ($p['id'] === $id) {
                $p['models'] = $models;
                $found = true;
                break;
            }
        }
        if ($found) {
            saveProviders($providers);
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => '供应商不存在']);
        }
        exit;
    }

    // 获取所有启用的模型（返回带类型的选项）
    if ($action === 'list_models') {
        $providers = getProviders();
        $options = [];
        foreach ($providers as $p) {
            if (empty($p['models'])) continue;
            foreach ($p['models'] as $model) {
                // $model 可能是字符串（旧数据），也可能是数组 {id, type}
                if (is_string($model)) {
                    // 兼容旧数据：默认类型为 chat
                    $modelId = $model;
                    $type = inferModelType($modelId);
                } else {
                    $modelId = $model['id'];
                    $type = $model['type'] ?? inferModelType($modelId);
                    $inferred = inferModelType($modelId);
                    if ($inferred === 'embedding' && $type === 'chat') {
                        $type = 'embedding';
                    }
                }
                $options[] = [
                    'value' => $p['id'] . '::' . $modelId,
                    'label' => $modelId . ' (' . $p['name'] . ')',
                    'type' => $type
                ];
            }
        }
        echo json_encode(['models' => $options]);
        exit;
    }

    // 设置访问密码（保存到服务器端文件）
    if ($action === 'set_password') {
        $input = json_decode(file_get_contents('php://input'), true);
        $password = $input['password'] ?? '';
        $pw_file = AI_DATA_DIR . '/.auth_password';

        if ($password === '') {
            if (file_exists($pw_file)) unlink($pw_file);
            echo json_encode(['success' => true, 'message' => 'Password cleared']);
        } else {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            file_put_contents($pw_file, $hash);
            echo json_encode(['success' => true, 'message' => 'Password saved']);
        }
        exit;
    }

    // 获取成本优化设置
    if ($action === 'get_cost_settings') {
        echo json_encode(['success' => true, 'settings' => getCostSettings()]);
        exit;
    }

    // 保存成本优化设置
    if ($action === 'save_cost_settings') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !isset($input['settings'])) {
            echo json_encode(['success' => false, 'error' => '无效数据']);
            exit;
        }
        saveCostSettings($input['settings']);
        echo json_encode(['success' => true]);
        exit;
    }

    // 获取 RAG 知识库（服务端存储）
    if ($action === 'get_rag_store') {
        $store = loadRagStore();
        echo json_encode([
            'success' => true,
            'store' => $store,
            'stats' => ragStoreStats($store)
        ]);
        exit;
    }

    // 保存 RAG 知识库（服务端存储）
    if ($action === 'save_rag_store') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input) || !isset($input['store'])) {
            echo json_encode(['success' => false, 'error' => '无效数据']);
            exit;
        }
        $ok = saveRagStore($input['store']);
        if (!$ok) {
            echo json_encode(['success' => false, 'error' => '写入失败']);
            exit;
        }
        $store = loadRagStore();
        echo json_encode([
            'success' => true,
            'store' => $store,
            'stats' => ragStoreStats($store)
        ]);
        exit;
    }

    // 手动重建向量索引（Ollama embedding + Chroma）
    if ($action === 'rag_rebuild_index') {
        $input = json_decode(file_get_contents('php://input'), true);
        $embedModel = trim((string)($input['embed_model'] ?? 'qwen3-embedding:0.6b'));
        $ret = runRagVectorBridge('rebuild', [
            '--embed-model' => $embedModel,
        ]);
        if (!$ret['ok']) {
            echo json_encode([
                'success' => false,
                'error' => $ret['error'] ?? 'rebuild_failed',
                'detail' => $ret['detail'] ?? null,
                'hint' => '若在 Windows 服务进程下找不到 py/python，请在系统环境变量中配置 Python 或设置 RAG_PYTHON_BIN。'
            ]);
            exit;
        }
        echo json_encode(['success' => true, 'result' => ($ret['data'] ?? [])]);
        exit;
    }

    // 查询向量RAG运行状态（Python/chromadb/ollama）
    if ($action === 'rag_vector_status') {
        $ret = runRagVectorBridge('doctor', []);
        if (!$ret['ok']) {
            echo json_encode([
                'success' => false,
                'error' => $ret['error'] ?? 'status_failed',
                'detail' => $ret['detail'] ?? null
            ]);
            exit;
        }
        echo json_encode(['success' => true, 'status' => ($ret['data'] ?? [])]);
        exit;
    }

    // 一键安装向量依赖（chromadb）
    if ($action === 'rag_vector_install_deps') {
        $install = installRagVectorDeps();
        if (!$install['ok']) {
            echo json_encode([
                'success' => false,
                'error' => $install['error'] ?? 'install_failed',
                'detail' => $install['detail'] ?? null,
                'hint' => '请在服务器终端手动执行其一: python3 -m pip install chromadb 或 python -m pip install chromadb；也可配置环境变量 RAG_PYTHON_BIN 指向 python 可执行文件。'
            ]);
            exit;
        }
        $ret = runRagVectorBridge('doctor', []);
        echo json_encode([
            'success' => true,
            'installed_with' => $install['cmd'],
            'status' => $ret['ok'] ? ($ret['data'] ?? []) : null,
        ]);
        exit;
    }

    // 检查最新 release（服务端代查，避免前端直连 GitHub API 被限流/跨域拦截）
    if ($action === 'check_update') {
        $updateUrl = 'https://api.github.com/repos/saviorwq/Ada-chat/releases/latest';
        $ch = curl_init($updateUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: application/vnd.github+json',
            'User-Agent: AdaChat-UpdateChecker/1.0'
        ]);
        $resp = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($resp === false || $httpCode !== 200) {
            echo json_encode([
                'success' => false,
                'error' => 'update_fetch_failed',
                'message' => 'HTTP ' . $httpCode . ($curlError ? (' - ' . $curlError) : ''),
            ]);
            exit;
        }

        $data = json_decode($resp, true);
        if (!is_array($data)) {
            echo json_encode([
                'success' => false,
                'error' => 'update_parse_failed',
                'message' => 'invalid_json'
            ]);
            exit;
        }

        echo json_encode([
            'success' => true,
            'release' => [
                'tag' => (string)($data['tag_name'] ?? ''),
                'name' => (string)($data['name'] ?? ''),
                'body' => (string)($data['body'] ?? ''),
                'url' => (string)($data['html_url'] ?? ''),
                'publishedAt' => (string)($data['published_at'] ?? '')
            ]
        ]);
        exit;
    }

    // 安全退出：注销会话 + 尝试停止本地服务（仅本机请求）
    if ($action === 'safe_exit') {
        if (!isLocalRequest()) {
            echo json_encode(['success' => false, 'error' => 'forbidden_non_local']);
            exit;
        }
        $stop = scheduleStopServer();
        // Log out session after scheduling shutdown.
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            @session_destroy();
        }
        echo json_encode([
            'success' => true,
            'stop_scheduled' => (bool)($stop['ok'] ?? false),
            'stop_result' => $stop,
        ]);
        exit;
    }

    echo json_encode(['error' => 'Invalid action']);
    exit;
}

// ---------- 缓存对齐引擎 ----------
function detectCacheStrategy($provider) {
    $strategy = $provider['cache_strategy'] ?? 'auto';
    if ($strategy !== 'auto') return $strategy;

    $url = strtolower($provider['base_url'] ?? '');
    if (strpos($url, 'anthropic') !== false)  return 'breakpoint';
    if (strpos($url, 'openrouter') !== false)  return 'breakpoint';
    if (strpos($url, 'deepseek') !== false)    return 'prefix';
    if (strpos($url, 'openai') !== false)      return 'prefix';
    return 'prefix';
}

function estimateTokens($text) {
    if (!is_string($text)) return 0;
    $cjk = preg_match_all('/[\x{4e00}-\x{9fff}\x{3000}-\x{303f}\x{ff00}-\x{ffef}]/u', $text);
    $ascii = max(0, ulen($text) - $cjk);
    return intval($cjk * 0.6 + $ascii / 4);
}

function getMessageText($msg) {
    $content = $msg['content'] ?? '';
    if (is_string($content)) return $content;
    if (is_array($content)) {
        $parts = [];
        foreach ($content as $part) {
            if (is_array($part) && isset($part['text'])) {
                $parts[] = $part['text'];
            }
        }
        return implode("\n", $parts);
    }
    return '';
}

function applyCacheAlignment($messages, $provider) {
    $strategy = detectCacheStrategy($provider);
    if ($strategy === 'none' || empty($messages)) return $messages;

    $count = count($messages);
    $lastSystemIdx = -1;
    for ($i = 0; $i < $count; $i++) {
        if (($messages[$i]['role'] ?? '') === 'system') $lastSystemIdx = $i;
    }

    if ($strategy === 'breakpoint') {
        // Anthropic / OpenRouter: 在 system 消息和历史末尾插入 cache_control 断点
        // 断点 1: system 消息（最稳定的部分）
        if ($lastSystemIdx >= 0) {
            $sysContent = $messages[$lastSystemIdx]['content'];
            if (is_string($sysContent)) {
                $messages[$lastSystemIdx]['content'] = [
                    ['type' => 'text', 'text' => $sysContent, 'cache_control' => ['type' => 'ephemeral']]
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
            $hContent = $messages[$histEnd]['content'];
            if (is_string($hContent)) {
                $messages[$histEnd]['content'] = [
                    ['type' => 'text', 'text' => $hContent, 'cache_control' => ['type' => 'ephemeral']]
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
                $merged .= getMessageText($sm) . "\n\n";
            }
            $messages = array_merge(
                [['role' => 'system', 'content' => trim($merged)]],
                $otherMsgs
            );
        }
    }

    return $messages;
}

// ---------- 处理请求（聊天、图像生成、视频生成）----------
$input = json_decode(file_get_contents('php://input'), true);
$task = $input['task'] ?? 'chat';
$modelParam = $input['model'] ?? '';
$prompt = $input['prompt'] ?? '';
$messages = $input['messages'] ?? [];
$stream = $input['stream'] ?? false;
$temperature = $input['temperature'] ?? null;
$topP = $input['top_p'] ?? null;
$presencePenalty = $input['presence_penalty'] ?? null;
$frequencyPenalty = $input['frequency_penalty'] ?? null;
$inputMaxTokens = $input['max_tokens'] ?? null;
$stopSequences = $input['stop'] ?? null;
$mode = $input['mode'] ?? 'text2img';
$imageBase64 = $input['image'] ?? '';
$rag = is_array($input['rag'] ?? null) ? $input['rag'] : null;
$client = strtolower(trim((string)($input['client'] ?? '')));
$hasBypassField = is_array($input) && array_key_exists('bypassCostOptimizer', $input);
$bypassCostOptimizer = $hasBypassField ? !empty($input['bypassCostOptimizer']) : false;
// CYOA 聊天默认直通（绕过省钱策略），除非前端显式传 false。
if ($task === 'chat' && $client === 'cyoa' && !$hasBypassField) {
    $bypassCostOptimizer = true;
}
$isCyoaBypassCost = ($task === 'chat' && $client === 'cyoa' && $bypassCostOptimizer);
$isCyoaChat = ($task === 'chat' && $client === 'cyoa');

if (!$modelParam) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing model']);
    exit;
}

if (strpos($modelParam, '::') === false) {
    echo json_encode(['error' => 'Invalid model format, expected providerId::modelName']);
    exit;
}
list($providerId, $modelName) = explode('::', $modelParam, 2);

$provider = findProvider($providerId);
if (!$provider) {
    echo json_encode(['error' => 'Provider not found']);
    exit;
}

$apiKey = trim((string)($provider['api_key'] ?? ''));

// 根据任务选择 API 路径
switch ($task) {
    case 'chat':
        $apiPath = $provider['chat_path'] ?? '/chat/completions';

        // Optional: server-side vector RAG injection (true embedding retrieval).
        if (is_array($rag) && !empty($rag['enabled']) && (($rag['mode'] ?? 'vector') === 'vector')) {
            $ragTopK = (int)($rag['topK'] ?? 4);
            $ragMaxChars = (int)($rag['maxChars'] ?? 1800);
            $ragEmbedModel = trim((string)($rag['embedModel'] ?? 'qwen3-embedding:0.6b'));
            $ragQuery = trim((string)($rag['query'] ?? ''));
            if ($ragQuery === '') {
                for ($ri = count($messages) - 1; $ri >= 0; $ri--) {
                    if (($messages[$ri]['role'] ?? '') === 'user') {
                        $ragQuery = trim(getMessageText($messages[$ri]));
                        if ($ragQuery !== '') break;
                    }
                }
            }
            if ($ragQuery !== '') {
                $ragPrompt = buildVectorRagSystemPrompt($ragQuery, $ragTopK, $ragMaxChars, $ragEmbedModel);
                if ($ragPrompt) {
                    array_unshift($messages, ['role' => 'system', 'content' => $ragPrompt]);
                }
            }
        }

        $smartMaxTokens = null;
        $costPipelineEnabled = false;
        if (!$isCyoaBypassCost) {
            $costPipelineEnabled = true;
            // ===== 成本优化流水线 =====
            // Step 1: KV 缓存命中检测（精确匹配：user + system + model）
            $cachedResponse = kvCacheLookup($messages, $modelName);
            // Step 1b: 宽松匹配（仅 user + model，跨会话复用）
            if ($cachedResponse === null) {
                $cachedResponse = kvCacheLooseLookup($messages, $modelName);
            }
            if ($cachedResponse !== null) {
                if ($stream) {
                    if ($isCyoaChat) {
                        header('X-CYOA-Bypass-Cost: ' . ($isCyoaBypassCost ? '1' : '0'));
                        header('X-CYOA-Cost-Pipeline: ' . ($costPipelineEnabled ? '1' : '0'));
                        header('X-CYOA-Cache-Hit: 1');
                    }
                    kvCacheEmitSSE($cachedResponse);
                } else {
                    header('Content-Type: application/json');
                    header('X-Cache-Hit: true');
                    if ($isCyoaChat) {
                        header('X-CYOA-Bypass-Cost: ' . ($isCyoaBypassCost ? '1' : '0'));
                        header('X-CYOA-Cost-Pipeline: ' . ($costPipelineEnabled ? '1' : '0'));
                        header('X-CYOA-Cache-Hit: 1');
                    }
                    echo json_encode([
                        'choices' => [['message' => ['role' => 'assistant', 'content' => $cachedResponse]]],
                        'model' => $modelName
                    ]);
                }
                exit;
            }

            // Step 2: 模型路由（简单指令 → 廉价模型）
            $originalModel = $modelParam;
            if (shouldRouteToLightModel($messages)) {
                $lightModel = getLightModel();
                if ($lightModel && strpos($lightModel, '::') !== false) {
                    list($lightProviderId, $lightModelName) = explode('::', $lightModel, 2);
                    $lightProvider = findProvider($lightProviderId);
                    if ($lightProvider) {
                        $providerId = $lightProviderId;
                        $modelName = $lightModelName;
                        $provider = $lightProvider;
                        $apiKey = trim((string)($provider['api_key'] ?? ''));
                        $apiPath = $provider['chat_path'] ?? '/chat/completions';
                    }
                }
            }

            // Step 3: 滑动窗口（裁剪过长历史）
            $messages = applySlidingWindow($messages);

            // Step 4: 压缩回复指令注入
            $messages = applyCompressOutput($messages);

            // Step 5: System Prompt 压缩记号
            $messages = compressSystemPrompt($messages);

            // Step 6: 缓存对齐（provider 级断点/前缀优化）
            $messages = applyCacheAlignment($messages, $provider);

            // Step 7: 智能 max_tokens
            $smartMaxTokens = calculateSmartMaxTokens($messages);
        }

        $postData = [
            'model' => $modelName,
            'messages' => $messages,
            'stream' => $stream
        ];
        if (is_numeric($temperature)) {
            $postData['temperature'] = max(0, min(2, (float)$temperature));
        }
        if (is_numeric($topP)) {
            $postData['top_p'] = max(0, min(1, (float)$topP));
        }
        if (is_numeric($presencePenalty)) {
            $postData['presence_penalty'] = max(-2, min(2, (float)$presencePenalty));
        }
        if (is_numeric($frequencyPenalty)) {
            $postData['frequency_penalty'] = max(-2, min(2, (float)$frequencyPenalty));
        }
        if (is_numeric($inputMaxTokens)) {
            $postData['max_tokens'] = max(1, (int)$inputMaxTokens);
        } elseif ($smartMaxTokens !== null) {
            $postData['max_tokens'] = $smartMaxTokens;
        }
        if (is_array($stopSequences)) {
            $cleanStop = [];
            foreach ($stopSequences as $s) {
                $t = trim((string)$s);
                if ($t !== '') $cleanStop[] = $t;
                if (count($cleanStop) >= 8) break;
            }
            if (!empty($cleanStop)) {
                $postData['stop'] = $cleanStop;
            }
        }
        break;
    case 'image':
        if ($mode === 'text2img') {
            $apiPath = $provider['image_gen_path'] ?? '/images/generations';
            $postData = [
                'model' => $modelName,
                'prompt' => $prompt,
                'n' => 1,
                'size' => '1024x1024' // 可根据需要调整或从输入获取
            ];
        } else { // img2img
            $apiPath = $provider['image_edit_path'] ?? '/images/edits';
            // 图生图通常需要 multipart/form-data，但很多供应商支持 base64 方式
            // 这里简化：假设供应商支持 JSON 格式，将图片作为 base64 传入
            $postData = [
                'model' => $modelName,
                'prompt' => $prompt,
                'image' => $imageBase64, // base64 图片
                'n' => 1,
                'size' => '1024x1024'
            ];
            // 注意：如果供应商要求 multipart，则需要特殊处理，此处先按 JSON 处理
        }
        // 图像生成一般不支持流式
        $stream = false;
        break;
    case 'video':
        $apiPath = $provider['video_path'] ?? '/videos/generations';
        $postData = [
            'model' => $modelName,
            'prompt' => $prompt
        ];
        $stream = false;
        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid task']);
        exit;
}

// 429 回退：如果当前是路由后的廉价模型，先尝试非流式探测是否 429
$didFallback = false;
if ($task === 'chat' && isset($originalModel) && $modelParam !== $originalModel) {
    $probeUrl = $provider['base_url'] . $apiPath;
    $probeCh = curl_init($probeUrl);
    curl_setopt($probeCh, CURLOPT_POST, true);
    curl_setopt($probeCh, CURLOPT_HTTPHEADER, buildApiHeaders($apiKey));
    $probeData = $postData;
    $probeData['stream'] = false;
    $probeData['max_tokens'] = 1;
    curl_setopt($probeCh, CURLOPT_POSTFIELDS, json_encode($probeData));
    curl_setopt($probeCh, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($probeCh, CURLOPT_TIMEOUT, 10);
    curl_setopt($probeCh, CURLOPT_CONNECTTIMEOUT, 5);
    $caFile = __DIR__ . '/php/ssl/cacert.pem';
    if (stripos(PHP_OS, 'WIN') === 0 && file_exists($caFile) && !ini_get('curl.cainfo')) {
        curl_setopt($probeCh, CURLOPT_CAINFO, $caFile);
    }
    curl_exec($probeCh);
    $probeCode = curl_getinfo($probeCh, CURLINFO_HTTP_CODE);
    curl_close($probeCh);

    if ($probeCode === 429) {
        list($origProviderId, $origModelName) = explode('::', $originalModel, 2);
        $origProvider = findProvider($origProviderId);
        if ($origProvider) {
            $provider = $origProvider;
            $modelName = $origModelName;
            $apiKey = trim((string)($provider['api_key'] ?? ''));
            $apiPath = $provider['chat_path'] ?? '/chat/completions';
            $postData['model'] = $modelName;
            $didFallback = true;
        }
    }
}

$apiUrl = $provider['base_url'] . $apiPath;

if ($isCyoaChat) {
    header('X-CYOA-Bypass-Cost: ' . ($isCyoaBypassCost ? '1' : '0'));
    header('X-CYOA-Cost-Pipeline: ' . (($costPipelineEnabled ?? false) ? '1' : '0'));
    header('X-CYOA-Cache-Hit: 0');
}

$ch = curl_init($apiUrl);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, buildApiHeaders($apiKey));
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 600);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 30);

$caFile = __DIR__ . '/php/ssl/cacert.pem';
if (stripos(PHP_OS, 'WIN') === 0 && file_exists($caFile) && !ini_get('curl.cainfo')) {
    curl_setopt($ch, CURLOPT_CAINFO, $caFile);
}

// 保存原始 messages 引用，用于 KV 缓存存储（在优化处理之前的 messages 已不可用，用 $input 原始数据）
$originalMessages = $input['messages'] ?? [];
$shouldCacheResponse = ($task === 'chat');

ignore_user_abort(false);

if ($stream) {
    header('Content-Type: text/event-stream');
    header('X-Accel-Buffering: no');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    while (ob_get_level()) ob_end_clean();

    $streamHttpCode = 0;
    $errorBuffer = '';
    $isError = false;
    $fullContent = '';
    $clientDisconnected = false;

    curl_setopt($ch, CURLOPT_HEADER, false);
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $data) use (&$streamHttpCode, &$errorBuffer, &$isError, &$fullContent, &$clientDisconnected) {
        // 流式中断即停：前端断开 → 立即停止 curl → 停止计费
        if (connection_aborted()) {
            $clientDisconnected = true;
            return 0;
        }

        if ($streamHttpCode === 0) {
            $streamHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            if ($streamHttpCode >= 400) {
                $isError = true;
            }
        }
        if ($isError) {
            $errorBuffer .= $data;
        } else {
            echo $data;
            if (ob_get_level()) ob_flush();
            flush();
            foreach (explode("\n", $data) as $line) {
                $line = trim($line);
                if (strpos($line, 'data: ') === 0) {
                    $json = substr($line, 6);
                    if ($json !== '[DONE]') {
                        $parsed = json_decode($json, true);
                        $delta = $parsed['choices'][0]['delta']['content'] ?? '';
                        if ($delta !== '') $fullContent .= $delta;
                    }
                }
            }
        }
        return strlen($data);
    });

    $result = curl_exec($ch);

    if ($clientDisconnected) {
        // 用户中断，已到手的部分仍可缓存
        $shouldCacheResponse = false;
    } elseif (curl_errno($ch)) {
        $sseError = json_encode(['choices' => [['delta' => ['content' => "\n[连接错误] " . curl_error($ch)]]]]);
        echo "data: {$sseError}\n\ndata: [DONE]\n\n";
    } elseif ($isError) {
        $errMsg = "上游API错误 (HTTP {$streamHttpCode})";
        $errData = json_decode($errorBuffer, true);
        if ($errData) {
            if (isset($errData['error']['message'])) {
                $errMsg = $errData['error']['message'];
            } elseif (isset($errData['error']) && is_string($errData['error'])) {
                $errMsg = $errData['error'];
            }
        }
        $sseError = json_encode(['choices' => [['delta' => ['content' => "[错误] {$errMsg}"]]]]);
        echo "data: {$sseError}\n\ndata: [DONE]\n\n";
        $shouldCacheResponse = false;
    }
    if (ob_get_level()) ob_flush();
    flush();

    if ($shouldCacheResponse && $fullContent !== '') {
        kvCacheStore($originalMessages, $modelName, $fullContent);
        kvCacheLooseStore($originalMessages, $modelName, $fullContent);
    }
} else {
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if (curl_errno($ch)) {
        echo json_encode(['error' => curl_error($ch)]);
    } else {
        http_response_code($httpCode);
        echo $response;

        if ($shouldCacheResponse && $httpCode === 200) {
            $respData = json_decode($response, true);
            $respContent = $respData['choices'][0]['message']['content'] ?? '';
            if ($respContent !== '') {
                kvCacheStore($originalMessages, $modelName, $respContent);
                kvCacheLooseStore($originalMessages, $modelName, $respContent);
            }
        }
    }
}
curl_close($ch);