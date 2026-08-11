<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 跨 Runtime 协调冒烟（不加载 Diffusers 大模型）
 * Smoke GPU coordination without loading SD weights
 *
 * 用法: php\php.exe scripts/runtime-switch-smoke.php
 */
declare(strict_types=1);

$root = dirname(__DIR__);
require $root . DIRECTORY_SEPARATOR . 'ai_config.php';
require $root . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'runtime' . DIRECTORY_SEPARATOR . 'entry.php';
require $root . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'image' . DIRECTORY_SEPARATOR . 'worker.php';

$fail = 0;
$pass = 0;

function assert_true(bool $cond, string $name): void
{
    global $fail, $pass;
    if ($cond) {
        echo "[PASS] {$name}\n";
        $pass++;
    } else {
        echo "[FAIL] {$name}\n";
        $fail++;
    }
}

echo "=== Local Runtime switch smoke ===\n";

assert_true(adachat_runtime_gpu_coord_enabled(), 'gpu_coord enabled (default)');
assert_true(
    adachat_runtime_is_local_llama_base('http://127.0.0.1:8080/v1'),
    'detect local llama base_url'
);
assert_true(
    !adachat_runtime_is_local_llama_base('https://api.openai.com/v1'),
    'reject cloud base_url'
);

$vk = adachat_runtime_vulkan_health();
echo '  vulkan.ok=' . (!empty($vk['ok']) ? '1' : '0') . "\n";

$imgH = adachat_image_worker_health();
echo '  image_worker=' . ($imgH ? json_encode([
    'status' => $imgH['status'] ?? null,
    'loaded' => $imgH['loaded_model'] ?? null,
], JSON_UNESCAPED_UNICODE) : 'null') . "\n";

// prepare should stop llama (if any) without touching image worker pid
$beforeImg = adachat_image_worker_health();
$prep = adachat_runtime_prepare('image');
assert_true(!empty($prep['ok']) || !empty($prep['skipped']), 'prepare(image) returns ok/skipped');
$afterPrepImg = adachat_image_worker_health();
if ($beforeImg !== null) {
    assert_true($afterPrepImg !== null, 'prepare does not kill image worker (was up)');
} else {
    echo "[INFO] image worker was down before prepare — skip keep-alive assert\n";
}

$rel = adachat_runtime_release('image');
assert_true(!empty($rel['ok']), 'release(image) ok');
assert_true(!empty($rel['image_worker_kept']), 'release keeps image worker flag');
assert_true(
    !empty($rel['ensure']['skipped']) || (($rel['ensure']['reason'] ?? '') === 'image_worker_resident'),
    'release(image) skips ensure llama'
);

$afterRelImg = adachat_image_worker_health();
if ($beforeImg !== null) {
    assert_true($afterRelImg !== null, 'release does not kill image worker');
}

// ensure vulkan path — short wait only (full load may need tens of seconds)
$ens = adachat_runtime_ensure_vulkan_llm(2500);
echo '  ensure_vulkan ok=' . (!empty($ens['ok']) ? '1' : '0')
    . ' already=' . (!empty($ens['already']) ? '1' : '0')
    . ' err=' . (string) ($ens['error'] ?? '') . "\n";
if (!empty($ens['ok'])) {
    assert_true(true, 'ensure_vulkan_llm reachable or already up');
} else {
    echo "[WARN] ensure_vulkan_llm not ready in 2.5s — acceptable for smoke\n";
}

// 只测「云端跳过」；本机 ensure 上面已覆盖，避免再卡 20s
$skipCloud = adachat_runtime_prepare_chat_if_local_llama([
    'base_url' => 'https://api.siliconflow.cn/v1',
    'deployment_type' => 'cloud',
]);
assert_true(!empty($skipCloud['skipped']), 'cloud chat skips llama ensure');

assert_true(
    adachat_runtime_is_local_llama_base('http://127.0.0.1:8080/v1'),
    'chat-path URL still detected as local llama'
);

echo "=== done: pass={$pass} fail={$fail} ===\n";
exit($fail > 0 ? 1 : 0);
