<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Local Runtime Manager — GPU 协调（prepare / release）
 * GPU coordination: free Vulkan LLM before heavy image/video jobs
 */

require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/../server_control.php';

/**
 * 本地出图/出视频前：停 Vulkan llama，释显存
 *
 * @return array{ok: bool, skipped?: bool, reason?: string, llama?: array<string, mixed>}
 */
function adachat_runtime_prepare(string $modality): array
{
    $modality = strtolower(trim($modality));
    if ($modality !== 'image' && $modality !== 'video') {
        return ['ok' => false, 'reason' => 'unsupported_modality'];
    }
    if (!adachat_runtime_gpu_coord_enabled()) {
        adachat_runtime_log("prepare({$modality}) skipped: gpu_coord_off");
        return ['ok' => true, 'skipped' => true, 'reason' => 'gpu_coord_off'];
    }

    $llama = adachat_stop_llama_server_now();
    adachat_runtime_log(
        'prepare(' . $modality . ') stop_llama ok=' . (!empty($llama['ok']) ? '1' : '0')
        . ' killed=' . (!empty($llama['killed']) ? '1' : '0')
    );

    // 短暂等待驱动释显存
    if (function_exists('usleep')) {
        @usleep(400000);
    }

    return [
        'ok' => (bool) ($llama['ok'] ?? false),
        'skipped' => false,
        'llama' => $llama,
        'modality' => $modality,
    ];
}

/**
 * 任务结束后：标记 GPU 协调结束（best-effort）
 *
 * 重要：release ≠ 卸载 Image Worker / 杀 Diffusers 进程。
 * release != unload image worker / kill Diffusers process.
 *
 * - image：只清 llama 退出哨兵，不自动拉回 llama（避免与常驻 Image 抢显存）
 * - video：仍可 ensure llama（视频仍为 oneshot）
 *
 * @return array{ok: bool, skipped?: bool, reason?: string, ensure?: array<string, mixed>}
 */
function adachat_runtime_release(string $modality): array
{
    $modality = strtolower(trim($modality));
    if ($modality !== 'image' && $modality !== 'video') {
        return ['ok' => false, 'reason' => 'unsupported_modality'];
    }
    if (!adachat_runtime_gpu_coord_enabled()) {
        adachat_runtime_log("release({$modality}) skipped: gpu_coord_off");
        return ['ok' => true, 'skipped' => true, 'reason' => 'gpu_coord_off'];
    }

    // 清除 prepare 写入的 quit 哨兵
    $sentinel = adachat_llama_quit_sentinel_path();
    if (is_file($sentinel)) {
        @unlink($sentinel);
    }

    // Image Worker 常驻：release 不杀 worker，也不自动 ensure llama
    if ($modality === 'image') {
        adachat_runtime_log('release(image) keep_image_worker=1 skip_ensure_llama=1');
        return [
            'ok' => true,
            'skipped' => false,
            'ensure' => ['ok' => true, 'skipped' => true, 'reason' => 'image_worker_resident'],
            'modality' => $modality,
            'image_worker_kept' => true,
        ];
    }

    $ensure = adachat_schedule_ensure_local_services();
    adachat_runtime_log(
        'release(' . $modality . ') ensure ok=' . (!empty($ensure['ok']) ? '1' : '0')
        . ' err=' . (string) ($ensure['error'] ?? '')
    );

    return [
        'ok' => true,
        'skipped' => false,
        'ensure' => $ensure,
        'modality' => $modality,
    ];
}

/**
 * 是否本机 Vulkan llama-server 端点
 */
function adachat_runtime_is_local_llama_base(string $baseUrl): bool
{
    $u = strtolower(trim($baseUrl));
    if ($u === '') {
        return false;
    }
    // 仅认本机 8080（Vulkan llama-server 默认）
    return (bool) preg_match('#^https?://(127\.0\.0\.1|localhost):8080(/|$)#', $u);
}

/**
 * 探测 Vulkan llama health（与 runtime_status 一致）
 *
 * @return array{ok: bool, endpoint: string, detail?: array<string, mixed>}
 */
function adachat_runtime_vulkan_health(): array
{
    require_once __DIR__ . '/status.php';
    return adachat_runtime_probe_vulkan();
}

/**
 * 聊天前确保 Vulkan LLM 可用（生图后 release 不拉 llama，需在此补上）
 * Ensure Vulkan LLM before chat — image release intentionally skips ensure
 *
 * @return array{ok: bool, already?: bool, ensured?: bool, waited_ms?: int, error?: string}
 */
function adachat_runtime_ensure_vulkan_llm(int $waitMs = 20000): array
{
    $h = adachat_runtime_vulkan_health();
    if (!empty($h['ok'])) {
        return ['ok' => true, 'already' => true];
    }

    $sentinel = adachat_llama_quit_sentinel_path();
    if (is_file($sentinel)) {
        @unlink($sentinel);
    }

    $ens = adachat_schedule_ensure_local_services();
    adachat_runtime_log(
        'ensure_vulkan_llm schedule ok=' . (!empty($ens['ok']) ? '1' : '0')
        . ' err=' . (string) ($ens['error'] ?? '')
    );

    $deadline = microtime(true) + max(2.0, $waitMs / 1000);
    $start = microtime(true);
    while (microtime(true) < $deadline) {
        usleep(400000);
        $h = adachat_runtime_vulkan_health();
        if (!empty($h['ok'])) {
            $waited = (int) round((microtime(true) - $start) * 1000);
            adachat_runtime_log("ensure_vulkan_llm ready waited_ms={$waited}");
            return ['ok' => true, 'ensured' => true, 'waited_ms' => $waited];
        }
    }

    adachat_runtime_log('ensure_vulkan_llm timeout');
    return [
        'ok' => false,
        'ensured' => true,
        'waited_ms' => $waitMs,
        'error' => 'llama_server_not_ready',
        'ensure' => $ens,
    ];
}

/**
 * 若供应商指向本机 llama，聊天前确保服务可用
 *
 * @return array{ok: bool, skipped?: bool, result?: array<string, mixed>, reason?: string}
 */
function adachat_runtime_prepare_chat_if_local_llama(array $provider): array
{
    $base = (string) ($provider['base_url'] ?? '');
    if (!adachat_runtime_is_local_llama_base($base)) {
        return ['ok' => true, 'skipped' => true, 'reason' => 'not_local_llama'];
    }
    $ret = adachat_runtime_ensure_vulkan_llm(20000);
    return ['ok' => (bool) ($ret['ok'] ?? false), 'skipped' => false, 'result' => $ret];
}
