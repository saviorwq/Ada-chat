<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 本地推理常驻 worker（模型缓存）
 * Persistent local-inference worker (model cache)
 */

require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/../rag_exec.php';
require_once __DIR__ . '/../server_control.php';

function adachat_local_worker_port(): int
{
    $raw = trim((string) (getenv('ADACHAT_LOCAL_WORKER_PORT') ?: ''));
    $port = $raw !== '' ? (int) $raw : 18765;
    return $port > 0 ? $port : 18765;
}

function adachat_local_worker_base_url(): string
{
    return 'http://127.0.0.1:' . adachat_local_worker_port();
}

function adachat_local_worker_health(): ?array
{
    $url = adachat_local_worker_base_url() . '/health';
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

function adachat_local_worker_spawn(): bool
{
    if (!adachat_is_exec_available()) {
        return false;
    }
    $script = adachat_local_inference_script_path();
    if (!is_file($script)) {
        return false;
    }
    $port = adachat_local_worker_port();
    $pyList = adachat_get_python_commands();
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

    if (stripos(PHP_OS, 'WIN') === 0) {
        $cmd = 'start "" /B ' . $cmdCore;
        @pclose(@popen($cmd, 'r'));
        return true;
    }
    @exec($cmdCore . ' > /dev/null 2>&1 &');
    return true;
}

/**
 * 确保 worker 可用；必要时拉起并短等健康检查
 * Ensure worker is up; spawn and briefly wait for health if needed
 *
 * @param bool $forceRespawn 即使健康也重新拉起（崩溃恢复）/ Respawn even if healthy
 */
function adachat_local_worker_ensure(int $waitMs = 2500, bool $forceRespawn = false): bool
{
    if (!$forceRespawn && adachat_local_worker_health()) {
        return true;
    }
    // spawn 失败（无 exec/python/脚本）时立即返回，避免空等 waitMs
    // Fail fast when spawn is impossible (no exec/python/script)
    if (!adachat_local_worker_spawn()) {
        return false;
    }
    $deadline = microtime(true) + max(0.5, $waitMs / 1000);
    while (microtime(true) < $deadline) {
        usleep(200000);
        if (adachat_local_worker_health()) {
            return true;
        }
    }
    return adachat_local_worker_health() !== null;
}

/**
 * @param array<string, mixed> $payload
 * @return array{ok:bool,code:int,errno:int,bytes:int}
 */
function adachat_local_worker_proxy_chat_once(array $payload, bool $stream): array
{
    $url = adachat_local_worker_base_url() . '/chat';
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if ($body === false) {
        return ['ok' => false, 'code' => 0, 'errno' => 0, 'bytes' => 0];
    }
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'code' => 0, 'errno' => 0, 'bytes' => 0];
    }

    $ch = curl_init($url);
    if ($ch === false) {
        return ['ok' => false, 'code' => 0, 'errno' => 0, 'bytes' => 0];
    }
    $bytes = 0;
    $headers = ['Content-Type: application/json'];
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_HEADER => false,
        CURLOPT_TIMEOUT => 0,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_WRITEFUNCTION => static function ($ch, string $data) use ($stream, &$bytes): int {
            $bytes += strlen($data);
            echo $data;
            if ($stream) {
                flush();
            }
            return strlen($data);
        },
    ]);

    $ok = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $errno = (int) curl_errno($ch);
    curl_close($ch);
    $success = $ok !== false && $code >= 200 && $code < 500;
    return ['ok' => $success, 'code' => $code, 'errno' => $errno, 'bytes' => $bytes];
}

/**
 * 通过常驻 worker 流式转发聊天；连接失败且尚未写出响应时自动拉起并重试一次
 * Stream via worker; respawn+retry only if no bytes were written yet
 *
 * @param array<string, mixed> $payload
 */
function adachat_local_worker_proxy_chat(array $payload, bool $stream): bool
{
    if (!adachat_local_worker_ensure()) {
        return false;
    }

    $first = adachat_local_worker_proxy_chat_once($payload, $stream);
    if ($first['ok']) {
        return true;
    }

    // 仅在尚未向客户端写出任何字节时重试，避免重复半截流
    // Retry only when nothing was written (avoid duplicated partial streams)
    $code = (int) ($first['code'] ?? 0);
    $errno = (int) ($first['errno'] ?? 0);
    $bytes = (int) ($first['bytes'] ?? 0);
    $transient = $bytes === 0 && ($errno !== 0 || $code === 0 || $code >= 500);
    if (!$transient) {
        return false;
    }
    if (!adachat_local_worker_ensure(4000, true)) {
        return false;
    }
    $second = adachat_local_worker_proxy_chat_once($payload, $stream);
    return !empty($second['ok']);
}
