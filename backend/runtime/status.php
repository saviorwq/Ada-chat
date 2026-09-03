<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Local Runtime Manager — 聚合 status / doctor / health
 * Aggregate doctor/health across LLM / Image / Video
 */

require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/../server_control.php';
require_once __DIR__ . '/../local_inference/exec.php';
require_once __DIR__ . '/../local_inference/worker.php';
require_once __DIR__ . '/../image/local.php';
require_once __DIR__ . '/../rag_exec.php';
require_once __DIR__ . '/../utils.php';

/**
 * @return array{ok: bool, data?: array<string, mixed>, error?: string, detail?: mixed}
 */
function adachat_runtime_run_python_bridge(string $scriptPath, string $subcommand, array $args = []): array
{
    if (!is_file($scriptPath)) {
        return ['ok' => false, 'error' => 'bridge_missing', 'detail' => basename($scriptPath)];
    }
    if (!adachat_is_exec_available()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }

    $attempts = [];
    $cmds = function_exists('adachat_image_python_commands') && str_contains($scriptPath, 'image_inference')
        ? adachat_image_python_commands()
        : adachat_get_python_commands();

    foreach ($cmds as $py) {
        $cmd = adachat_build_command_line($py, $scriptPath, $subcommand, $args);
        $lines = [];
        $code = 1;
        @exec($cmd, $lines, $code);
        $raw = trim(implode("\n", $lines));
        $attempts[] = [
            'exit_code' => $code,
            'output' => adachat_usub($raw, 0, 600),
        ];
        if ($code !== 0) {
            continue;
        }
        $parsed = adachat_parse_json_from_mixed_output($raw);
        if (is_array($parsed)) {
            return ['ok' => true, 'data' => $parsed];
        }
    }

    return [
        'ok' => false,
        'error' => 'bridge_exec_failed',
        'detail' => ['attempts' => $attempts],
    ];
}

/**
 * @return array{ok: bool, endpoint: string, detail: array<string, mixed>}
 */
function adachat_runtime_probe_vulkan(): array
{
    $endpoint = 'http://127.0.0.1:8080/health';
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 1.5,
            'ignore_errors' => true,
        ],
    ]);
    $raw = @file_get_contents($endpoint, false, $ctx);
    if (!is_string($raw) || $raw === '') {
        return [
            'ok' => false,
            'endpoint' => $endpoint,
            'detail' => ['error' => 'unreachable'],
        ];
    }
    $parsed = json_decode($raw, true);
    return [
        'ok' => true,
        'endpoint' => $endpoint,
        'detail' => is_array($parsed) ? $parsed : ['raw' => adachat_usub($raw, 0, 200)],
    ];
}

/**
 * 设备优先序：xpu > cuda > vulkan(health) > cpu
 *
 * @return array{preferred: string, detail: array<string, mixed>}
 */
function adachat_runtime_pick_preferred_device(array $imageDoctor, bool $vulkanOk): array
{
    $detail = [
        'image' => $imageDoctor,
        'vulkan_ok' => $vulkanOk,
    ];
    $imgDevice = strtolower((string) ($imageDoctor['device'] ?? ''));
    if ($imgDevice === 'xpu') {
        return ['preferred' => 'xpu', 'detail' => $detail];
    }
    if ($imgDevice === 'cuda') {
        return ['preferred' => 'cuda', 'detail' => $detail];
    }
    if ($vulkanOk) {
        return ['preferred' => 'vulkan', 'detail' => $detail];
    }
    if ($imgDevice === 'cpu') {
        return ['preferred' => 'cpu', 'detail' => $detail];
    }
    return ['preferred' => 'unknown', 'detail' => $detail];
}

/**
 * @return array{version: int, devices: array<string, mixed>, workers: array<string, mixed>, flags: array<string, bool>, updated_at: string}
 */
function adachat_runtime_build_status(): array
{
    $llmDoctor = adachat_run_local_inference_bridge('doctor', []);
    $llmData = (is_array($llmDoctor['data'] ?? null)) ? $llmDoctor['data'] : [];
    $llmOk = !empty($llmDoctor['ok']) && (
        !empty($llmData['ready']) || !empty($llmData['llama_cpp']) || !empty($llmData['transformers'])
    );

    $directHealth = adachat_local_worker_health();
    $directEndpoint = adachat_local_worker_base_url();

    $vulkan = adachat_runtime_probe_vulkan();

    $imgScript = adachat_image_inference_script_path();
    $imgRet = adachat_runtime_run_python_bridge($imgScript, 'doctor', []);
    $imgData = (is_array($imgRet['data'] ?? null)) ? $imgRet['data'] : [];
    $imgOk = !empty($imgRet['ok']) && !empty($imgData['success']) && (
        !empty($imgData['torch']) || !empty($imgData['diffusers']) || !empty($imgData['ready'])
    );
    // doctor 可能 success=true 但缺依赖；以解析字段为准
    if (!empty($imgRet['ok']) && isset($imgData['success'])) {
        $imgOk = (bool) $imgData['success']
            && (!empty($imgData['torch']) || !empty($imgData['diffusers']) || ($imgData['device'] ?? '') !== '');
        // 若明确报告 missing，标为不可用
        if (!empty($imgData['missing']) && is_array($imgData['missing']) && $imgData['missing'] !== []) {
            $imgOk = false;
        }
    }

    if (!function_exists('adachat_image_worker_health')) {
        require_once __DIR__ . '/../image/worker.php';
    }
    $imgHealth = adachat_image_worker_health();

    $vidScript = adachat_video_inference_script_path();
    $vidRet = adachat_runtime_run_python_bridge($vidScript, 'doctor', []);
    $vidData = (is_array($vidRet['data'] ?? null)) ? $vidRet['data'] : [];
    $vidOk = !empty($vidRet['ok']) && (!empty($vidData['success']) || !empty($vidData['torch']) || !empty($vidData['diffusers']));

    $devices = adachat_runtime_pick_preferred_device($imgData, (bool) $vulkan['ok']);

    $memory = function_exists('adachat_runtime_build_memory_snapshot')
        ? adachat_runtime_build_memory_snapshot()
        : null;

    return [
        'version' => 1,
        'devices' => $devices,
        'memory' => $memory,
        'workers' => [
            'llm_direct' => [
                'ok' => $llmOk || $directHealth !== null,
                'endpoint' => $directEndpoint,
                'detail' => [
                    'doctor' => $llmData,
                    'doctor_ok' => !empty($llmDoctor['ok']),
                    'doctor_error' => $llmDoctor['error'] ?? null,
                    'health' => $directHealth,
                    'script' => is_file(adachat_local_inference_script_path()),
                ],
            ],
            'llm_vulkan' => [
                'ok' => (bool) $vulkan['ok'],
                'endpoint' => $vulkan['endpoint'],
                'detail' => $vulkan['detail'],
            ],
            'image' => [
                'ok' => $imgOk || (is_array($imgHealth) && !empty($imgHealth['ok'])),
                'mode' => (is_array($imgHealth) && !empty($imgHealth['ok'])) ? 'resident' : 'oneshot',
                'feature_enabled' => adachat_local_image_feature_enabled(),
                'endpoint' => function_exists('adachat_image_worker_base_url')
                    ? adachat_image_worker_base_url()
                    : 'http://127.0.0.1:18766',
                'detail' => [
                    'doctor' => $imgData,
                    'doctor_ok' => !empty($imgRet['ok']),
                    'doctor_error' => $imgRet['error'] ?? null,
                    'script' => is_file($imgScript),
                    'health' => $imgHealth,
                    'status' => is_array($imgHealth) ? ($imgHealth['status'] ?? null) : 'STOPPED',
                    'loaded_model' => is_array($imgHealth) ? ($imgHealth['loaded_model'] ?? null) : null,
                ],
            ],
            'video' => [
                'ok' => $vidOk,
                'mode' => 'oneshot',
                'detail' => [
                    'doctor' => $vidData,
                    'doctor_ok' => !empty($vidRet['ok']),
                    'doctor_error' => $vidRet['error'] ?? null,
                    'script' => is_file($vidScript),
                ],
            ],
            'music' => (static function () {
                if (!function_exists('adachat_music_acestep_health')) {
                    require_once __DIR__ . '/../music/acestep.php';
                }
                $ok = function_exists('adachat_music_acestep_health')
                    && adachat_music_acestep_health();
                $tcp = function_exists('adachat_music_acestep_tcp_up')
                    && adachat_music_acestep_tcp_up();
                $endpoint = function_exists('adachat_music_acestep_base_url')
                    ? adachat_music_acestep_base_url()
                    : 'http://127.0.0.1:8001';
                return [
                    'ok' => $ok,
                    'mode' => 'resident',
                    'endpoint' => $endpoint,
                    'detail' => [
                        'health' => $ok,
                        'tcp' => $tcp,
                        'hint' => $ok
                            ? 'ACE-Step API ready'
                            : ($tcp ? 'port_up_waiting_health' : 'stopped'),
                    ],
                ];
            })(),
        ],
        'flags' => [
            'local_image' => adachat_local_image_feature_enabled(),
            'gpu_coord' => adachat_runtime_gpu_coord_enabled(),
            'exec_available' => adachat_is_exec_available(),
        ],
        'updated_at' => date('c'),
    ];
}
