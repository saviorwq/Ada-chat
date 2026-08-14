<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 本地文生图常驻 Worker（Diffusers 加载一次后复用）
 * Persistent local image worker — load Diffusers once, reuse
 */

require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/../rag_exec.php';
require_once __DIR__ . '/../server_control.php';
require_once __DIR__ . '/../utils.php';

function adachat_image_worker_port(): int
{
    $raw = trim((string) (getenv('ADACHAT_IMAGE_WORKER_PORT') ?: ''));
    $port = $raw !== '' ? (int) $raw : 18766;
    return $port > 0 ? $port : 18766;
}

function adachat_image_worker_base_url(): string
{
    return 'http://127.0.0.1:' . adachat_image_worker_port();
}

/**
 * @return array<string, mixed>|null
 */
function adachat_image_worker_health(): ?array
{
    $url = adachat_image_worker_base_url() . '/health';
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 1.5,
            'ignore_errors' => true,
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    if (!is_string($raw) || $raw === '') {
        return null;
    }
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : null;
}

function adachat_image_worker_spawn(): bool
{
    if (!adachat_is_exec_available()) {
        return false;
    }
    $script = adachat_image_inference_script_path();
    if (!is_file($script)) {
        return false;
    }
    if (!function_exists('adachat_image_python_commands')) {
        require_once __DIR__ . '/local.php';
    }
    $port = adachat_image_worker_port();
    $pyList = adachat_image_python_commands();
    if (!$pyList) {
        return false;
    }
    $py = $pyList[0];
    $exe = (string) ($py['exe'] ?? 'python');
    $extra = is_array($py['extra'] ?? null) ? $py['extra'] : [];

    $parts = [escapeshellarg($exe)];
    foreach ($extra as $e) {
        $parts[] = escapeshellarg((string) $e);
    }
    $parts[] = escapeshellarg($script);
    $parts[] = escapeshellarg('serve');
    $parts[] = escapeshellarg('--host');
    $parts[] = escapeshellarg('127.0.0.1');
    $parts[] = escapeshellarg('--port');
    $parts[] = escapeshellarg((string) $port);
    $cmdCore = implode(' ', $parts);

    // 工作目录设为仓库根，便于相对路径 / PATH
    $cwd = dirname(__DIR__, 2);
    if (stripos(PHP_OS, 'WIN') === 0) {
        // popen+start：与 image spawn 一致，避免 exec 卡住
        $cmd = 'start "adachat_img_worker" /D "' . str_replace('"', '', $cwd) . '" /B ' . $cmdCore;
        @pclose(@popen($cmd, 'r'));
        return true;
    }
    @exec('cd ' . escapeshellarg($cwd) . ' && ' . $cmdCore . ' > /dev/null 2>&1 &');
    return true;
}

/**
 * 确保 Image Worker 可用（必要时拉起）
 * Ensure image worker is up; spawn if needed
 */
function adachat_image_worker_ensure(int $waitMs = 8000, bool $forceRespawn = false): bool
{
    if (!$forceRespawn) {
        $h = adachat_image_worker_health();
        if (is_array($h) && !empty($h['ok'])) {
            $st = strtoupper((string) ($h['status'] ?? ''));
            if (in_array($st, ['READY', 'BUSY', 'LOADING', 'ERROR'], true)) {
                return true;
            }
        }
    }
    if (!adachat_image_worker_spawn()) {
        return false;
    }
    $deadline = microtime(true) + max(1.0, $waitMs / 1000);
    while (microtime(true) < $deadline) {
        usleep(250000);
        $h = adachat_image_worker_health();
        if (is_array($h) && !empty($h['ok'])) {
            $st = strtoupper((string) ($h['status'] ?? ''));
            if (in_array($st, ['READY', 'BUSY', 'LOADING', 'ERROR'], true)) {
                return true;
            }
        }
    }
    $h = adachat_image_worker_health();
    return is_array($h) && !empty($h['ok']);
}

/**
 * 通过常驻 worker 出图；失败返回 null 以便回退 oneshot
 *
 * @param array<string, mixed> $payload
 * @return array{ok:bool, local_file?:string, error?:string, detail?:mixed, reloaded?:bool, worker_status?:string}|null
 */
function adachat_image_worker_generate(array $payload): ?array
{
    if (!function_exists('curl_init')) {
        return null;
    }
    if (!adachat_image_worker_ensure()) {
        // 再试一次强制拉起（崩溃恢复）
        if (!adachat_image_worker_ensure(12000, true)) {
            return null;
        }
    }

    $url = adachat_image_worker_base_url() . '/generate';
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if ($body === false) {
        return ['ok' => false, 'error' => 'json_encode_failed'];
    }

    $attempt = function () use ($url, $body): array {
        $ch = curl_init($url);
        if ($ch === false) {
            return ['ok' => false, 'error' => 'curl_init_failed', 'http_code' => 0];
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 0,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errno = (int) curl_errno($ch);
        $err = (string) curl_error($ch);
        curl_close($ch);

        if ($raw === false || $errno !== 0) {
            return [
                'ok' => false,
                'error' => 'worker_unreachable',
                'detail' => $err !== '' ? $err : ('errno=' . $errno),
                'http_code' => $code,
                'transient' => true,
            ];
        }
        $parsed = json_decode((string) $raw, true);
        if (!is_array($parsed)) {
            return [
                'ok' => false,
                'error' => 'worker_bad_json',
                'detail' => adachat_usub((string) $raw, 0, 400),
                'http_code' => $code,
            ];
        }
        if (!empty($parsed['success'])) {
            return [
                'ok' => true,
                'local_file' => (string) ($parsed['output_file'] ?? ''),
                'reloaded' => !empty($parsed['reloaded']),
                'worker_status' => (string) ($parsed['worker_status'] ?? ''),
                'http_code' => $code,
                'hint' => (string) ($parsed['hint'] ?? ''),
                'composition_unlocked' => !empty($parsed['composition_unlocked']),
                'face_locked' => !empty($parsed['face_locked']),
                'detail' => $parsed,
            ];
        }
        return [
            'ok' => false,
            'error' => (string) ($parsed['error'] ?? 'worker_generate_failed'),
            'install_hint' => $parsed['install_hint'] ?? ($parsed['hint'] ?? null),
            'worker_status' => (string) ($parsed['worker_status'] ?? ''),
            'http_code' => $code,
            'detail' => $parsed,
            'transient' => ($code === 0 || $code >= 500 || ($parsed['error'] ?? '') === 'worker_busy'),
        ];
    };

    $first = $attempt();
    if (!empty($first['ok'])) {
        return $first;
    }

    // 连接失败 / worker 被杀：强制拉起再试一次
    if (!empty($first['transient'])) {
        if (adachat_image_worker_ensure(15000, true)) {
            $second = $attempt();
            if (!empty($second['ok']) || empty($second['transient'])) {
                return $second;
            }
            return $second;
        }
        // spawn 失败 → 让上层回退 oneshot
        return null;
    }

    return $first;
}
