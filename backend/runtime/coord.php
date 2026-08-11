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
