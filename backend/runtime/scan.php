<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Local Runtime Manager — 统一模型扫描
 * Unified local model scan (chat / image / video)
 */

require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/status.php';
require_once __DIR__ . '/../image/local.php';
require_once __DIR__ . '/../local_inference/exec.php';
require_once __DIR__ . '/../providers.php';

/**
 * @return array{success: bool, models_dir: string, models: array<int, array<string, mixed>>, errors?: array<string, mixed>}
 */
function adachat_runtime_scan_all(?string $modelsDir = null): array
{
    $dir = trim((string) $modelsDir);
    if ($dir === '') {
        $dir = adachat_runtime_default_models_dir();
    }

    $models = [];
    $errors = [];

    // Chat / GGUF
    $chat = adachat_run_local_inference_bridge('scan', ['--models-dir' => $dir]);
    if (!empty($chat['ok']) && is_array($chat['data']['models'] ?? null)) {
        foreach ($chat['data']['models'] as $m) {
            if (!is_array($m) || empty($m['id'])) {
                continue;
            }
            $type = (string) ($m['type'] ?? 'chat');
            $modality = ($type === 'video') ? 'video' : 'chat';
            $models[] = [
                'id' => (string) $m['id'],
                'modality' => $modality,
                'type' => $type,
                'format' => (string) ($m['format'] ?? ''),
                'path' => (string) ($m['path'] ?? ''),
                'source' => 'local_inference',
            ];
        }
    } else {
        $errors['chat'] = $chat['error'] ?? 'scan_failed';
    }

    // Image
    $fakeProvider = ['models_dir' => $dir, 'deployment_type' => 'local'];
    $img = adachat_image_scan_models($fakeProvider);
    if (!empty($img['success']) && is_array($img['models'] ?? null)) {
        foreach ($img['models'] as $m) {
            if (!is_array($m) || empty($m['id'])) {
                continue;
            }
            $models[] = [
                'id' => (string) $m['id'],
                'modality' => 'image',
                'type' => 'image',
                'format' => (string) ($m['format'] ?? ''),
                'family' => (string) ($m['family'] ?? ''),
                'path' => (string) ($m['path'] ?? ''),
                'source' => 'image',
            ];
        }
    } else {
        $errors['image'] = $img['error'] ?? 'scan_failed';
    }

    // Video bridge scan
    $vidScript = adachat_video_inference_script_path();
    $vid = adachat_runtime_run_python_bridge($vidScript, 'scan', ['--models-dir' => $dir]);
    if (!empty($vid['ok']) && is_array($vid['data']['models'] ?? null)) {
        foreach ($vid['data']['models'] as $m) {
            if (!is_array($m)) {
                continue;
            }
            $mid = (string) ($m['id'] ?? $m['path'] ?? '');
            if ($mid === '') {
                continue;
            }
            $models[] = [
                'id' => $mid,
                'modality' => 'video',
                'type' => 'video',
                'format' => (string) ($m['format'] ?? 'safetensors'),
                'path' => (string) ($m['path'] ?? $mid),
                'source' => 'video',
            ];
        }
    } else {
        $errors['video'] = $vid['error'] ?? 'scan_failed';
    }

    // 去重：同 id+modality
    $seen = [];
    $unique = [];
    foreach ($models as $m) {
        $key = ($m['modality'] ?? '') . '|' . ($m['id'] ?? '');
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $unique[] = $m;
    }

    return [
        'success' => true,
        'models_dir' => $dir,
        'models' => $unique,
        'count' => count($unique),
        'errors' => $errors,
    ];
}
