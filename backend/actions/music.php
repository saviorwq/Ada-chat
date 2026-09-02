<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../music/jobs.php';
require_once __DIR__ . '/../music/stems_jobs.php';
require_once __DIR__ . '/../music/stems.php';
require_once __DIR__ . '/../music/source_audio.php';
require_once __DIR__ . '/../json.php';

function adachat_music_upload_error_message(int $code): string
{
    return match ($code) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => '文件超过 PHP 上传大小限制（请在 php.ini 提高 upload_max_filesize / post_max_size，建议 ≥128M）',
        UPLOAD_ERR_PARTIAL => '文件只上传了一部分，请重试',
        UPLOAD_ERR_NO_FILE => '未收到音频文件',
        UPLOAD_ERR_NO_TMP_DIR => '服务器缺少临时目录',
        UPLOAD_ERR_CANT_WRITE => '无法写入临时文件',
        UPLOAD_ERR_EXTENSION => '上传被 PHP 扩展拦截',
        default => '上传失败（错误码 ' . $code . '）',
    };
}

function adachat_music_receive_upload_bytes(): array
{
    // 1) multipart/form-data
    if (!empty($_FILES['file']) && is_array($_FILES['file'])) {
        $err = (int) ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($err !== UPLOAD_ERR_OK) {
            return ['ok' => false, 'error' => adachat_music_upload_error_message($err)];
        }
        $tmp = (string) ($_FILES['file']['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            return ['ok' => false, 'error' => '未收到音频文件'];
        }
        return [
            'ok' => true,
            'tmp' => $tmp,
            'name' => (string) ($_FILES['file']['name'] ?? 'source.wav'),
            'from_upload' => true,
        ];
    }

    // 2) raw body（application/octet-stream，前端 Cover 上传默认走此路径）
    $raw = file_get_contents('php://input');
    $contentLen = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if (!is_string($raw) || strlen($raw) < 64) {
        $postMax = (string) ini_get('post_max_size');
        if ($contentLen > 0) {
            return [
                'ok' => false,
                'error' => '未收到音频文件：请求约 '
                    . round($contentLen / 1048576, 1)
                    . 'MB，超过 PHP post_max_size（当前 '
                    . ($postMax !== '' ? $postMax : '未知')
                    . '）。请重启 Ada Chat 后再试，或改用 MP3。',
            ];
        }
        return [
            'ok' => false,
            'error' => '未收到音频文件（请选择 WAV/MP3 后重试）',
        ];
    }
    $nameHdr = (string) ($_SERVER['HTTP_X_FILENAME'] ?? '');
    $name = $nameHdr !== '' ? rawurldecode($nameHdr) : 'source.wav';
    $tmp = rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'msrc_up_' . bin2hex(random_bytes(8)) . '.bin';
    if (@file_put_contents($tmp, $raw) === false) {
        return ['ok' => false, 'error' => '无法写入临时源音频'];
    }
    return ['ok' => true, 'tmp' => $tmp, 'name' => $name, 'from_upload' => false];
}

function adachat_handle_music_actions(string $action): bool
{
    if ($action === 'music_upload_src') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            adachat_json(['success' => false, 'error' => '需要 POST 上传'], 405);
        }
        $recv = adachat_music_receive_upload_bytes();
        if (empty($recv['ok'])) {
            adachat_json(['success' => false, 'error' => (string) ($recv['error'] ?? 'upload_failed')], 400);
        }
        $tmp = (string) $recv['tmp'];
        $name = (string) $recv['name'];
        $stored = adachat_music_store_source_upload($tmp, $name);
        if (empty($recv['from_upload']) && is_file($tmp)) {
            @unlink($tmp);
        }
        if (empty($stored['ok'])) {
            adachat_json(['success' => false, 'error' => (string) ($stored['error'] ?? 'upload_failed')], 500);
        }
        adachat_json([
            'success' => true,
            'src_audio_id' => (string) ($stored['id'] ?? ''),
            'name' => (string) ($stored['name'] ?? $name),
            'duration_sec' => $stored['duration_sec'] ?? null,
            'size_bytes' => $stored['size_bytes'] ?? null,
            'expires_at' => $stored['expires_at'] ?? null,
            'hint' => '源音频已就绪，可发送 Cover 任务',
        ]);
    }

    if ($action === 'music_src_status') {
        $id = trim((string) ($_GET['id'] ?? $_GET['src_audio_id'] ?? ''));
        if ($id === '') {
            adachat_json(['success' => false, 'valid' => false, 'error' => '缺少 src_audio_id'], 400);
        }
        $st = adachat_music_source_status($id);
        if (empty($st['valid'])) {
            $meta = is_array($st['meta'] ?? null) ? $st['meta'] : [];
            adachat_json([
                'success' => true,
                'valid' => false,
                'expired' => true,
                'error' => '源音频不存在或已过期，请重新上传',
                'name' => (string) ($meta['name'] ?? ''),
                'expires_at' => (string) ($meta['expires_at'] ?? ''),
                'src_audio_id' => (string) ($meta['id'] ?? $id),
            ]);
        }
        $meta = is_array($st['meta'] ?? null) ? $st['meta'] : [];
        adachat_json([
            'success' => true,
            'valid' => true,
            'expired' => false,
            'src_audio_id' => (string) ($meta['id'] ?? $id),
            'name' => (string) ($meta['name'] ?? ''),
            'duration_sec' => isset($meta['duration_sec']) ? (float) $meta['duration_sec'] : null,
            'size_bytes' => isset($meta['size_bytes']) ? (int) $meta['size_bytes'] : null,
            'expires_at' => (string) ($meta['expires_at'] ?? ''),
            'created_at' => (string) ($meta['created_at'] ?? ''),
        ]);
    }

    if ($action === 'music_job_status') {
        $id = (string) ($_GET['id'] ?? $_GET['job_id'] ?? '');
        $job = adachat_music_load_job($id);
        if (!$job) {
            adachat_json(['success' => false, 'error' => '任务不存在'], 404);
        }
        // queued 超过约 25s 仍无 worker：再拉一次（修复旧版 PowerShell 嵌套假死）
        // If still queued ~25s, respawn once (fixes nested-PS spawn that never started)
        $statusNow = (string) ($job['status'] ?? '');
        if ($statusNow === 'queued') {
            $created = strtotime((string) ($job['created_at'] ?? '')) ?: 0;
            $retries = (int) ($job['spawn_retries'] ?? 0);
            if ($created > 0 && (time() - $created) >= 25 && $retries < 2) {
                require_once __DIR__ . '/../music/spawn.php';
                $job['spawn_retries'] = $retries + 1;
                $job['hint'] = '后台未启动，正在重试拉起 worker…';
                adachat_music_save_job($job);
                adachat_music_spawn_worker($id);
                $job = adachat_music_load_job($id) ?: $job;
            }
        }
        $stale = adachat_music_job_is_stale($job);
        if ($stale && in_array((string) ($job['status'] ?? ''), ['queued', 'processing'], true)) {
            $job['status'] = 'failed';
            $job['error'] = '任务超时无响应：请确认 ACE-Step API（:8001）已启动，且 PHP exec 可用';
            adachat_music_save_job($job);
        }
        $publicUrl = adachat_music_public_url_for_job($job);
        $hint = (string) ($job['hint'] ?? '');
        // ACE 英文 stage 对用户不友好
        if (strcasecmp(trim($hint), 'queued') === 0) {
            $hint = 'ACE-Step 排队生成中（时长越长越慢，请耐心等待）';
        }
        $extra = is_array($job['extra'] ?? null) ? $job['extra'] : [];
        $taskType = (string) ($extra['task_type'] ?? 'text2music');
        $srcDur = isset($extra['src_duration_sec']) ? (float) $extra['src_duration_sec'] : null;
        $etaMin = null;
        if ($taskType === 'cover' || $taskType === 'cover-nofsq') {
            $etaMin = adachat_music_cover_eta_minutes($srcDur);
        }
        adachat_json([
            'success' => true,
            'job_id' => $job['id'],
            'status' => $job['status'],
            'progress' => (int) ($job['progress'] ?? 0),
            'mode' => $job['mode'] ?? 'local',
            'audio_url' => $publicUrl,
            'error' => $job['error'] ?? '',
            'stale' => $stale,
            'hint' => $hint,
            'message' => adachat_music_status_message($job),
            'task_type' => $taskType,
            'src_duration_sec' => $srcDur,
            'eta_minutes' => $etaMin,
        ]);
    }

    if ($action === 'music_file') {
        $id = (string) ($_GET['id'] ?? '');
        $job = adachat_music_load_job($id);
        if (!$job || empty($job['local_file']) || !is_file($job['local_file'])) {
            http_response_code(404);
            echo 'Not found';
            exit;
        }
        $path = (string) $job['local_file'];
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $ctype = 'audio/wav';
        if ($ext === 'mp3') {
            $ctype = 'audio/mpeg';
        } elseif ($ext === 'flac') {
            $ctype = 'audio/flac';
        } elseif ($ext === 'ogg') {
            $ctype = 'audio/ogg';
        }
        header('Content-Type: ' . $ctype);
        header('Content-Length: ' . (string) filesize($path));
        header('Accept-Ranges: bytes');
        readfile($path);
        exit;
    }

    // 从已完成音乐任务启动 Demucs 四轨导出（DAW ZIP）
    if ($action === 'music_stems_start') {
        $musicId = (string) ($_GET['id'] ?? $_POST['id'] ?? $_GET['music_id'] ?? '');
        $music = adachat_music_load_job($musicId);
        if (!$music) {
            adachat_json(['success' => false, 'error' => '音乐任务不存在'], 404);
        }
        if ((string) ($music['status'] ?? '') !== 'completed'
            || empty($music['local_file'])
            || !is_file((string) $music['local_file'])) {
            adachat_json([
                'success' => false,
                'error' => '请先完成整曲生成后再导出多轨',
            ], 400);
        }
        if (adachat_music_stems_python() === '') {
            adachat_json([
                'success' => false,
                'error' => '未安装 Demucs',
                'hint' => '请运行 tools/demucs/setup.ps1（需 Python 3.11 + ffmpeg）',
            ], 503);
        }

        $job = adachat_music_stems_create_job([
            'music_job_id' => $musicId,
            'source_file' => (string) $music['local_file'],
            'model' => 'htdemucs',
            'device' => 'cpu',
        ]);
        $spawned = adachat_music_stems_spawn_worker((string) $job['id']);
        if (!$spawned) {
            $job['status'] = 'failed';
            $job['error'] = '无法启动分轨任务（exec 被禁用）';
            adachat_music_stems_save_job($job);
            adachat_json(['success' => false, 'error' => $job['error'], 'job_id' => $job['id']], 500);
        }
        adachat_json([
            'success' => true,
            'job_id' => $job['id'],
            'status' => 'queued',
            'poll_action' => 'music_stems_status',
            'message' => '多轨分轨已排队（Demucs → WAV ZIP）',
            'hint' => 'CPU 分轨可能需数分钟；完成后可下载 ZIP 导入 DAW',
        ]);
    }

    if ($action === 'music_stems_status') {
        $id = (string) ($_GET['id'] ?? $_GET['job_id'] ?? '');
        $job = adachat_music_stems_load_job($id);
        if (!$job) {
            adachat_json(['success' => false, 'error' => '分轨任务不存在'], 404);
        }
        $stale = adachat_music_stems_job_is_stale($job);
        if ($stale && in_array((string) ($job['status'] ?? ''), ['queued', 'processing'], true)) {
            $job['status'] = 'failed';
            $job['error'] = '分轨超时：请确认 Demucs 已安装且 PHP exec 可用';
            adachat_music_stems_save_job($job);
        }
        adachat_json([
            'success' => true,
            'job_id' => $job['id'],
            'music_job_id' => $job['music_job_id'] ?? '',
            'status' => $job['status'],
            'progress' => (int) ($job['progress'] ?? 0),
            'zip_url' => adachat_music_stems_public_url($job),
            'error' => $job['error'] ?? '',
            'stale' => $stale,
            'hint' => $job['hint'] ?? '',
            'message' => adachat_music_stems_status_message($job),
        ]);
    }

    // 查找某首音乐最近一次已完成的分轨 ZIP（避免重复 Demucs）
    if ($action === 'music_stems_latest') {
        $musicId = (string) ($_GET['music_id'] ?? $_GET['id'] ?? '');
        if ($musicId === '') {
            adachat_json(['success' => false, 'error' => '缺少 music_id'], 400);
        }
        $best = null;
        $dir = adachat_music_stems_jobs_dir();
        if (is_dir($dir)) {
            $files = glob($dir . DIRECTORY_SEPARATOR . 'stem_*.json') ?: [];
            usort($files, static function ($a, $b) {
                return filemtime($b) <=> filemtime($a);
            });
            foreach ($files as $f) {
                $data = json_decode((string) @file_get_contents($f), true);
                if (!is_array($data)) {
                    continue;
                }
                if ((string) ($data['music_job_id'] ?? '') !== $musicId) {
                    continue;
                }
                if ((string) ($data['status'] ?? '') !== 'completed') {
                    continue;
                }
                if (empty($data['zip_file']) || !is_file((string) $data['zip_file'])) {
                    continue;
                }
                $best = $data;
                break;
            }
        }
        if (!$best) {
            adachat_json(['success' => false, 'error' => 'no_stems']);
        }
        adachat_json([
            'success' => true,
            'job_id' => $best['id'] ?? '',
            'zip_url' => adachat_music_stems_public_url($best),
            'hint' => '已有分轨结果，直接下载',
        ]);
    }

    if ($action === 'music_stems_file') {
        $id = (string) ($_GET['id'] ?? '');
        $job = adachat_music_stems_load_job($id);
        if (!$job || empty($job['zip_file']) || !is_file((string) $job['zip_file'])) {
            http_response_code(404);
            echo 'Not found';
            exit;
        }
        $path = (string) $job['zip_file'];
        $name = basename($path);
        $size = (int) @filesize($path);
        // 大 ZIP（数分钟曲目可达 100MB+）：关缓冲、流式输出，避免 memory/timeout → HTTP 500
        // Large ZIP: stream without buffering to avoid memory/timeout HTTP 500
        @ini_set('memory_limit', '512M');
        @ini_set('zlib.output_compression', '0');
        @set_time_limit(0);
        while (ob_get_level() > 0) {
            @ob_end_clean();
        }
        header('Content-Type: application/zip');
        if ($size > 0) {
            header('Content-Length: ' . (string) $size);
        }
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        $fp = @fopen($path, 'rb');
        if (!is_resource($fp)) {
            http_response_code(500);
            echo 'Cannot open zip';
            exit;
        }
        // 分块输出，避免 readfile 一次性撑爆内存
        while (!feof($fp)) {
            $chunk = fread($fp, 1024 * 1024);
            if ($chunk === false) {
                break;
            }
            echo $chunk;
            if (function_exists('flush')) {
                @flush();
            }
        }
        fclose($fp);
        exit;
    }

    // 从已完成 ZIP 抽取单轨（仅人声 / 仅伴奏等）
    if ($action === 'music_stems_track') {
        $musicId = (string) ($_GET['music_id'] ?? $_GET['id'] ?? '');
        $track = strtolower(trim((string) ($_GET['track'] ?? 'vocals')));
        $map = [
            'vocals' => ['05_vocals_only.wav', '04_vocals.wav'],
            'instrumental' => ['06_instrumental.wav'],
            'drums' => ['01_drums.wav'],
            'bass' => ['02_bass.wav'],
            'other' => ['03_other.wav'],
            'mix' => ['00_mix.wav'],
        ];
        if ($musicId === '' || !isset($map[$track])) {
            http_response_code(400);
            echo 'bad_request';
            exit;
        }
        $best = null;
        $dir = adachat_music_stems_jobs_dir();
        if (is_dir($dir)) {
            $files = glob($dir . DIRECTORY_SEPARATOR . 'stem_*.json') ?: [];
            usort($files, static function ($a, $b) {
                return filemtime($b) <=> filemtime($a);
            });
            foreach ($files as $f) {
                $data = json_decode((string) @file_get_contents($f), true);
                if (!is_array($data)) {
                    continue;
                }
                if ((string) ($data['music_job_id'] ?? '') !== $musicId) {
                    continue;
                }
                if ((string) ($data['status'] ?? '') !== 'completed') {
                    continue;
                }
                if (empty($data['zip_file']) || !is_file((string) $data['zip_file'])) {
                    continue;
                }
                $best = $data;
                break;
            }
        }
        if (!$best) {
            http_response_code(404);
            echo 'no_stems';
            exit;
        }
        if (!class_exists('ZipArchive')) {
            http_response_code(500);
            echo 'zip_extension_missing';
            exit;
        }
        $zip = new ZipArchive();
        if ($zip->open((string) $best['zip_file']) !== true) {
            http_response_code(500);
            echo 'zip_open_failed';
            exit;
        }
        $entry = null;
        foreach ($map[$track] as $name) {
            if ($zip->locateName($name) !== false) {
                $entry = $name;
                break;
            }
        }
        if ($entry === null) {
            $zip->close();
            http_response_code(404);
            echo 'track_missing';
            exit;
        }
        $bin = $zip->getFromName($entry);
        $zip->close();
        if ($bin === false || $bin === '') {
            http_response_code(500);
            echo 'extract_failed';
            exit;
        }
        $dlName = 'adachat-' . preg_replace('/[^a-zA-Z0-9_\-]/', '', $musicId) . '-' . $track . '.wav';
        header('Content-Type: audio/wav');
        header('Content-Length: ' . (string) strlen($bin));
        header('Content-Disposition: attachment; filename="' . $dlName . '"');
        header('Cache-Control: no-store');
        echo $bin;
        exit;
    }

    return false;
}

function adachat_music_stems_status_message(array $job): string
{
    $status = (string) ($job['status'] ?? '');
    switch ($status) {
        case 'queued':
            return '多轨排队中…';
        case 'processing':
            $hint = trim((string) ($job['hint'] ?? ''));
            return $hint !== '' ? $hint : 'Demucs 分轨中…';
        case 'completed':
            return '多轨 ZIP 已就绪';
        case 'failed':
            return '分轨失败：' . (string) ($job['error'] ?? '');
        default:
            return $status;
    }
}

function adachat_music_status_message(array $job): string
{
    $status = (string) ($job['status'] ?? '');
    switch ($status) {
        case 'queued':
            return '排队中…';
        case 'processing':
            $hint = trim((string) ($job['hint'] ?? ''));
            return $hint !== '' ? $hint : '生成中…';
        case 'completed':
            return '音乐生成完成';
        case 'failed':
            return '生成失败：' . (string) ($job['error'] ?? '');
        default:
            return $status;
    }
}
