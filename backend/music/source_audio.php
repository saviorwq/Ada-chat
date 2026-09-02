<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/paths.php';

/**
 * Cover 源音频：必须落在系统 temp 目录，ACE API 才接受绝对路径
 * Cover source audio must live under system temp for ACE path validation
 */

function adachat_music_sources_meta_dir(): string
{
    $dir = AI_DATA_DIR . DIRECTORY_SEPARATOR . 'music_sources';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

function adachat_music_source_meta_file(string $sourceId): string
{
    $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '', $sourceId);
    return adachat_music_sources_meta_dir() . DIRECTORY_SEPARATOR . $safe . '.json';
}

/** Cover 源音频 temp 有效期（秒） */
function adachat_music_source_ttl_seconds(): int
{
    return 86400;
}

/**
 * @return array<string, mixed>|null
 */
function adachat_music_load_source_meta(string $sourceId): ?array
{
    $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '', $sourceId);
    if ($safe === '') {
        return null;
    }
    $file = adachat_music_source_meta_file($safe);
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode((string) file_get_contents($file), true);
    return is_array($data) ? $data : null;
}

/**
 * @return array{valid: bool, expired: bool, meta?: array<string, mixed>}
 */
function adachat_music_source_status(string $sourceId): array
{
    $meta = adachat_music_load_source_meta($sourceId);
    if (!$meta || empty($meta['path']) || !is_file((string) $meta['path'])) {
        return ['valid' => false, 'expired' => true];
    }
    $expiresAt = (string) ($meta['expires_at'] ?? '');
    if ($expiresAt !== '') {
        $expTs = strtotime($expiresAt) ?: 0;
        if ($expTs > 0 && time() > $expTs) {
            return ['valid' => false, 'expired' => true, 'meta' => $meta];
        }
    }
    return ['valid' => true, 'expired' => false, 'meta' => $meta];
}

function adachat_music_probe_audio_duration(string $path): ?float
{
    if (!is_file($path)) {
        return null;
    }
    if (function_exists('adachat_is_exec_available') && adachat_is_exec_available()) {
        foreach (['ffprobe', 'ffprobe.exe'] as $bin) {
            $cmd = escapeshellarg($bin)
                . ' -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 '
                . escapeshellarg($path)
                . ' 2>nul';
            $out = @shell_exec($cmd);
            if (is_string($out) && is_numeric(trim($out))) {
                $sec = (float) trim($out);
                if ($sec > 0) {
                    return round($sec, 1);
                }
            }
        }
    }
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    if ($ext === 'wav') {
        return adachat_music_probe_wav_duration($path);
    }
    return null;
}

function adachat_music_probe_wav_duration(string $path): ?float
{
    $fh = @fopen($path, 'rb');
    if (!$fh) {
        return null;
    }
    $header = fread($fh, 12);
    if ($header === false || strlen($header) < 12) {
        fclose($fh);
        return null;
    }
    if (substr($header, 0, 4) !== 'RIFF' || substr($header, 8, 4) !== 'WAVE') {
        fclose($fh);
        return null;
    }
    $sampleRate = 0;
    $byteRate = 0;
    $dataSize = 0;
    while (!feof($fh)) {
        $chunkHdr = fread($fh, 8);
        if ($chunkHdr === false || strlen($chunkHdr) < 8) {
            break;
        }
        $chunkId = substr($chunkHdr, 0, 4);
        $chunkSize = unpack('V', substr($chunkHdr, 4, 4))[1] ?? 0;
        if ($chunkId === 'fmt ' && $chunkSize >= 16) {
            $fmt = fread($fh, $chunkSize);
            if (is_string($fmt) && strlen($fmt) >= 16) {
                $sampleRate = unpack('V', substr($fmt, 4, 4))[1] ?? 0;
                $byteRate = unpack('V', substr($fmt, 8, 4))[1] ?? 0;
            } else {
                fseek($fh, $chunkSize, SEEK_CUR);
            }
        } elseif ($chunkId === 'data') {
            $dataSize = $chunkSize;
            break;
        } else {
            fseek($fh, $chunkSize, SEEK_CUR);
        }
    }
    fclose($fh);
    if ($byteRate > 0 && $dataSize > 0) {
        return round($dataSize / $byteRate, 1);
    }
    if ($sampleRate > 0 && $dataSize > 0) {
        return round($dataSize / ($sampleRate * 4), 1);
    }
    return null;
}

/** Cover 任务 ETA（分钟，经验值：A770 Base ~6min/60s） */
function adachat_music_cover_eta_minutes(?float $durationSec): int
{
    if ($durationSec === null || $durationSec <= 0) {
        return 8;
    }
    return max(2, (int) ceil($durationSec / 10));
}

/**
 * @return array{ok:bool, id?:string, path?:string, error?:string, name?:string, duration_sec?:float, size_bytes?:int, expires_at?:string}
 */
function adachat_music_store_source_upload(string $tmpPath, string $origName = ''): array
{
    if (!is_file($tmpPath) || filesize($tmpPath) < 64) {
        return ['ok' => false, 'error' => '源音频文件无效或过小'];
    }
    $ext = strtolower(pathinfo($origName ?: $tmpPath, PATHINFO_EXTENSION));
    if (!in_array($ext, ['wav', 'mp3', 'flac', 'ogg', 'm4a', 'aac', 'opus'], true)) {
        // 仍尝试按 wav 存，ACE 侧会再解码
        $ext = $ext !== '' ? $ext : 'wav';
    }
    $id = 'msrc_' . bin2hex(random_bytes(8));
    $dest = rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . $id . '.' . $ext;
    if (!@copy($tmpPath, $dest)) {
        return ['ok' => false, 'error' => '无法写入临时源音频（请检查磁盘权限）'];
    }
    $duration = adachat_music_probe_audio_duration($dest);
    $createdAt = date('c');
    $expiresAt = date('c', time() + adachat_music_source_ttl_seconds());
    $meta = [
        'id' => $id,
        'path' => $dest,
        'name' => $origName !== '' ? $origName : basename($dest),
        'created_at' => $createdAt,
        'expires_at' => $expiresAt,
        'duration_sec' => $duration,
        'size_bytes' => (int) filesize($dest),
    ];
    @file_put_contents(
        adachat_music_source_meta_file($id),
        json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
    );
    return [
        'ok' => true,
        'id' => $id,
        'path' => $dest,
        'name' => $meta['name'],
        'duration_sec' => $duration,
        'size_bytes' => $meta['size_bytes'],
        'expires_at' => $expiresAt,
    ];
}

/**
 * @return array{id:string,path:string,name:string,duration_sec:?float,expires_at:string,size_bytes:?int}|null
 */
function adachat_music_resolve_source_id(string $sourceId): ?array
{
    $st = adachat_music_source_status($sourceId);
    if (empty($st['valid']) || empty($st['meta']) || !is_array($st['meta'])) {
        return null;
    }
    $data = $st['meta'];
    if (empty($data['path']) || !is_file((string) $data['path'])) {
        return null;
    }
    return [
        'id' => (string) ($data['id'] ?? $sourceId),
        'path' => (string) $data['path'],
        'name' => (string) ($data['name'] ?? $sourceId),
        'duration_sec' => isset($data['duration_sec']) ? (float) $data['duration_sec'] : null,
        'expires_at' => (string) ($data['expires_at'] ?? ''),
        'size_bytes' => isset($data['size_bytes']) ? (int) $data['size_bytes'] : null,
    ];
}
