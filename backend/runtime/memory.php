<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Local Runtime — 系统内存 / 显存占用探测
 * System RAM & GPU VRAM probing (best-effort on Windows)
 */

require_once __DIR__ . '/../utils.php';
require_once __DIR__ . '/../server_control.php';
require_once __DIR__ . '/../local_inference/worker.php';

/**
 * @return array{available: bool, total_mb: ?float, free_mb: ?float, used_mb: ?float, used_pct: ?float}
 */
function adachat_runtime_probe_system_memory(): array
{
    $empty = [
        'available' => false,
        'total_mb' => null,
        'free_mb' => null,
        'used_mb' => null,
        'used_pct' => null,
    ];

    if (stripos(PHP_OS, 'WIN') !== 0 || !adachat_is_exec_available()) {
        return $empty;
    }

    $ps = adachat_win_powershell_exe();
    if (!is_file($ps)) {
        return $empty;
    }

    $script = '$os=Get-CimInstance Win32_OperatingSystem;'
        . '$t=[math]::Round($os.TotalVisibleMemorySize/1MB,1);'
        . '$f=[math]::Round($os.FreePhysicalMemory/1MB,1);'
        . 'Write-Output ($t.ToString() + \',\' + $f.ToString())';
    $cmd = escapeshellarg($ps) . ' -NoProfile -NonInteractive -Command ' . escapeshellarg($script);
    $raw = @shell_exec($cmd);
    if (!is_string($raw) || trim($raw) === '') {
        return $empty;
    }

    $line = trim(explode("\n", trim($raw))[0] ?? '');
    $parts = array_map('trim', explode(',', $line));
    if (count($parts) < 2 || !is_numeric($parts[0]) || !is_numeric($parts[1])) {
        return $empty;
    }

    $total = (float) $parts[0];
    $free = (float) $parts[1];
    if ($total <= 0) {
        return $empty;
    }
    $used = max(0.0, $total - $free);
    $pct = round(($used / $total) * 100, 1);

    return [
        'available' => true,
        'total_mb' => $total,
        'free_mb' => $free,
        'used_mb' => round($used, 1),
        'used_pct' => $pct,
    ];
}

/**
 * @return array{available: bool, vendor: string, total_mb: ?float, used_mb: ?float, free_mb: ?float, used_pct: ?float, source: ?string}
 */
function adachat_runtime_probe_gpu_memory(): array
{
    $empty = [
        'available' => false,
        'vendor' => 'unknown',
        'total_mb' => null,
        'used_mb' => null,
        'free_mb' => null,
        'used_pct' => null,
        'source' => null,
    ];

    if (!adachat_is_exec_available()) {
        return $empty;
    }

    $nv = adachat_runtime_probe_gpu_memory_nvidia();
    if (!empty($nv['available'])) {
        return $nv;
    }

    $xpu = adachat_runtime_probe_gpu_memory_xpu();
    if (!empty($xpu['available'])) {
        return $xpu;
    }

    return $empty;
}

/**
 * @return array{available: bool, vendor: string, total_mb: ?float, used_mb: ?float, free_mb: ?float, used_pct: ?float, source: ?string}
 */
function adachat_runtime_probe_gpu_memory_nvidia(): array
{
    $empty = [
        'available' => false,
        'vendor' => 'nvidia',
        'total_mb' => null,
        'used_mb' => null,
        'free_mb' => null,
        'used_pct' => null,
        'source' => 'nvidia-smi',
    ];

    $cmd = 'nvidia-smi --query-gpu=memory.total,memory.used,memory.free --format=csv,noheader,nounits 2>nul';
    $raw = @shell_exec($cmd);
    if (!is_string($raw) || trim($raw) === '') {
        return $empty;
    }

    $line = trim(explode("\n", trim($raw))[0] ?? '');
    $parts = array_map('trim', explode(',', $line));
    if (count($parts) < 3 || !is_numeric($parts[0]) || !is_numeric($parts[1])) {
        return $empty;
    }

    $total = (float) $parts[0];
    $used = (float) $parts[1];
    $free = is_numeric($parts[2]) ? (float) $parts[2] : max(0.0, $total - $used);
    if ($total <= 0) {
        return $empty;
    }

    return [
        'available' => true,
        'vendor' => 'nvidia',
        'total_mb' => $total,
        'used_mb' => $used,
        'free_mb' => $free,
        'used_pct' => round(($used / $total) * 100, 1),
        'source' => 'nvidia-smi',
    ];
}

/**
 * Intel Arc / XPU — xpu-smi stats（若已安装）
 *
 * @return array{available: bool, vendor: string, total_mb: ?float, used_mb: ?float, free_mb: ?float, used_pct: ?float, source: ?string}
 */
function adachat_runtime_probe_gpu_memory_xpu(): array
{
    $empty = [
        'available' => false,
        'vendor' => 'intel',
        'total_mb' => null,
        'used_mb' => null,
        'free_mb' => null,
        'used_pct' => null,
        'source' => 'xpu-smi',
    ];

    $cmd = 'xpu-smi stats -d 0 2>nul';
    $raw = @shell_exec($cmd);
    if (!is_string($raw) || trim($raw) === '') {
        return $empty;
    }

    $total = null;
    $used = null;
    foreach (preg_split('/\R/', $raw) ?: [] as $line) {
        if (!preg_match('/Memory\s*(?:Usage|Used)?\s*[:|]\s*(\d+(?:\.\d+)?)\s*(?:MiB|MB|GB)?/i', $line, $m)) {
            continue;
        }
        $val = (float) $m[1];
        if (stripos($line, 'Total') !== false) {
            $total = $val;
        } elseif (stripos($line, 'Used') !== false || stripos($line, 'Usage') !== false) {
            $used = $val;
        }
    }

    if ($used === null) {
        if (preg_match('/GPU\s*Memory\s*Used\s*[:|]\s*(\d+(?:\.\d+)?)/i', $raw, $m)) {
            $used = (float) $m[1];
        }
    }
    if ($total === null && preg_match('/GPU\s*Memory\s*Total\s*[:|]\s*(\d+(?:\.\d+)?)/i', $raw, $m)) {
        $total = (float) $m[1];
    }

    if ($used === null) {
        return $empty;
    }

    if ($total === null || $total <= 0) {
        // 无总量时仅报告已用，占比留空
        return [
            'available' => true,
            'vendor' => 'intel',
            'total_mb' => null,
            'used_mb' => $used,
            'free_mb' => null,
            'used_pct' => null,
            'source' => 'xpu-smi',
        ];
    }

    $free = max(0.0, $total - $used);

    return [
        'available' => true,
        'vendor' => 'intel',
        'total_mb' => $total,
        'used_mb' => $used,
        'free_mb' => $free,
        'used_pct' => round(($used / $total) * 100, 1),
        'source' => 'xpu-smi',
    ];
}

/**
 * 探测本机 GPU 相关常驻服务
 *
 * @return array{llama_vulkan: bool, llama_direct: bool, image_worker: bool, image_loaded_model: ?string, acestep: bool, labels: list<string>}
 */
function adachat_runtime_detect_gpu_services(): array
{
    $labels = [];

    $vulkanOk = false;
    $endpoint = 'http://127.0.0.1:8080/health';
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 1.2,
            'ignore_errors' => true,
        ],
    ]);
    $raw = @file_get_contents($endpoint, false, $ctx);
    if (is_string($raw) && $raw !== '') {
        $parsed = json_decode($raw, true);
        $vulkanOk = is_array($parsed) && (!empty($parsed['status']) || array_key_exists('slots_idle', $parsed));
    }
    if ($vulkanOk) {
        $labels[] = 'llama (Vulkan :8080)';
    }

    $directOk = false;
    $directHealth = adachat_local_worker_health();
    if (is_array($directHealth) && !empty($directHealth)) {
        $directOk = true;
        $labels[] = 'llama (direct worker)';
    }

    $imageWorker = false;
    $loadedModel = null;
    if (!function_exists('adachat_image_worker_health')) {
        require_once __DIR__ . '/../image/worker.php';
    }
    $imgHealth = adachat_image_worker_health();
    if (is_array($imgHealth) && !empty($imgHealth['ok'])) {
        $status = strtoupper((string) ($imgHealth['status'] ?? ''));
        $loadedModel = isset($imgHealth['loaded_model']) && $imgHealth['loaded_model'] !== ''
            ? (string) $imgHealth['loaded_model']
            : null;
        if ($status === 'READY' || $status === 'BUSY' || $loadedModel !== null) {
            $imageWorker = true;
            $labels[] = 'image worker' . ($loadedModel ? " ({$loadedModel})" : '');
        }
    }

    $acestep = false;
    if (!function_exists('adachat_music_acestep_health')) {
        require_once __DIR__ . '/../music/acestep.php';
    }
    if (function_exists('adachat_music_acestep_health') && adachat_music_acestep_health()) {
        $acestep = true;
        $labels[] = 'ACE-Step (:8001)';
    }

    return [
        'llama_vulkan' => $vulkanOk,
        'llama_direct' => $directOk,
        'image_worker' => $imageWorker,
        'image_loaded_model' => $loadedModel,
        'acestep' => $acestep,
        'labels' => $labels,
    ];
}

/**
 * @return array<string, mixed>
 */
function adachat_runtime_build_memory_snapshot(): array
{
    $ram = adachat_runtime_probe_system_memory();
    $gpu = adachat_runtime_probe_gpu_memory();
    $services = adachat_runtime_detect_gpu_services();

    $busy = !empty($services['llama_vulkan'])
        || !empty($services['llama_direct'])
        || !empty($services['image_worker'])
        || !empty($services['acestep']);

    $pressure = $busy;
    if (!empty($ram['available']) && ($ram['free_mb'] ?? 99999) < 4096) {
        $pressure = true;
    }
    if (!empty($gpu['available']) && ($gpu['used_pct'] ?? 0) >= 70) {
        $pressure = true;
    }
    if (!empty($gpu['available']) && ($gpu['used_mb'] ?? 0) >= 2048 && empty($gpu['used_pct'])) {
        $pressure = true;
    }

    return [
        'ram' => $ram,
        'gpu' => $gpu,
        'services' => $services,
        'busy' => $busy,
        'pressure' => $pressure,
        'updated_at' => date('c'),
    ];
}
