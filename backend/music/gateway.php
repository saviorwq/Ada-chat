<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/jobs.php';
require_once __DIR__ . '/spawn.php';
require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/acestep.php';
require_once __DIR__ . '/source_audio.php';
require_once __DIR__ . '/prompt_prep.php';
require_once __DIR__ . '/../json.php';
require_once __DIR__ . '/../providers.php';
require_once __DIR__ . '/../runtime/coord.php';

/**
 * 从用户文本拆出歌词（可选）
 * Split optional lyrics block from user prompt
 *
 * @return array{0:string,1:string} [prompt, lyrics]
 */
function adachat_music_split_prompt_lyrics(string $text): array
{
    $raw = adachat_music_strip_category_markers($text);
    if ($raw === '') {
        return ['', ''];
    }
    if (preg_match('/^(.*?)(?:\n|\r\n){1,}(?:【?\s*歌词\s*】?|lyrics\s*[:：])\s*([\s\S]+)$/iu', $raw, $m)) {
        return [trim($m[1]), trim($m[2])];
    }
    return [$raw, ''];
}

function adachat_music_gateway_submit(array $parsed, string $providerId, string $modelName, array $provider): void
{
    // 网页 PHP 默认 max_execution_time=30；等 ACE 冷启动会超时报空 500
    if (function_exists('set_time_limit')) {
        @set_time_limit(120);
    }
    @ini_set('max_execution_time', '120');

    $prompt = trim((string) ($parsed['prompt'] ?? ''));
    if ($prompt === '') {
        http_response_code(400);
        adachat_json_headers();
        echo adachat_json_encode_unicode(['error' => '音乐生成需要 prompt（风格描述；可用「歌词：」分段）']);
        return;
    }

    [$cap, $lyrics] = adachat_music_split_prompt_lyrics($prompt);
    if ($cap === '' && $lyrics !== '') {
        $cap = '一首完整歌曲';
    }
    if (!empty($parsed['input']['lyrics'])) {
        $lyrics = trim((string) $parsed['input']['lyrics']);
    }

    $taskType = strtolower(trim((string) (
        $parsed['input']['task_type']
        ?? $parsed['input']['music_task_type']
        ?? 'text2music'
    )));
    if (!in_array($taskType, ['text2music', 'cover', 'cover-nofsq'], true)) {
        $taskType = 'text2music';
    }
    if ($taskType === 'cover' || $taskType === 'cover-nofsq') {
        // Cover：提示词仅作风格 caption；歌词必须为空；强制纯器乐
        $lyrics = '';
    }

    $duration = (float) ($parsed['input']['duration'] ?? $parsed['input']['audio_duration'] ?? 30);

    $extra = [
        'lyrics' => $lyrics,
        'duration' => $duration,
        'task_type' => $taskType,
    ];
    $fmt = strtolower(trim((string) ($parsed['input']['audio_format'] ?? $parsed['input']['format'] ?? 'wav')));
    if (!in_array($fmt, ['wav', 'mp3', 'flac', 'opus', 'aac', 'wav32'], true)) {
        $fmt = 'wav';
    }
    $extra['audio_format'] = $fmt;
    if (isset($parsed['input']['guidance_scale'])) {
        $extra['guidance_scale'] = (float) $parsed['input']['guidance_scale'];
    }
    if (isset($parsed['input']['inference_steps'])) {
        $extra['inference_steps'] = (int) $parsed['input']['inference_steps'];
    } else {
        // 未传步数时：base 默认 55，turbo 默认 8
        $m = $modelName !== '' ? $modelName : adachat_music_default_dit_model();
        $extra['inference_steps'] = stripos($m, 'turbo') !== false ? 8 : 55;
    }
    if (isset($parsed['input']['bpm']) && is_numeric($parsed['input']['bpm'])) {
        $extra['bpm'] = (int) $parsed['input']['bpm'];
    }
    // UI「仅音乐」：强制纯器乐 + 自动追加无人声提示词
    $instOnly = $parsed['input']['instrumental_only']
        ?? $parsed['input']['instrumentalOnly']
        ?? $parsed['input']['music_only']
        ?? null;
    if ($instOnly !== null) {
        $extra['instrumental_only'] = !empty($instOnly);
    }
    if ($taskType === 'cover' || $taskType === 'cover-nofsq') {
        $extra['instrumental_only'] = true;
    }
    if (isset($parsed['input']['infer_method'])) {
        $im = strtolower(trim((string) $parsed['input']['infer_method']));
        if (in_array($im, ['ode', 'sde'], true)) {
            $extra['infer_method'] = $im;
        }
    }
    if (isset($parsed['input']['lm_temperature']) && is_numeric($parsed['input']['lm_temperature'])) {
        $extra['lm_temperature'] = (float) $parsed['input']['lm_temperature'];
    }
    if (isset($parsed['input']['audio_cover_strength']) && is_numeric($parsed['input']['audio_cover_strength'])) {
        $extra['audio_cover_strength'] = (float) $parsed['input']['audio_cover_strength'];
    }
    $srcId = trim((string) ($parsed['input']['src_audio_id'] ?? $parsed['input']['music_src_id'] ?? ''));
    if ($srcId !== '') {
        $resolved = adachat_music_resolve_source_id($srcId);
        if ($resolved) {
            $extra['src_audio_id'] = $resolved['id'];
            $extra['src_audio_path'] = $resolved['path'];
            $extra['src_audio_name'] = $resolved['name'];
            if (isset($resolved['duration_sec']) && $resolved['duration_sec'] > 0) {
                $extra['src_duration_sec'] = (float) $resolved['duration_sec'];
            }
        }
    }
    if (($taskType === 'cover' || $taskType === 'cover-nofsq') && empty($extra['src_audio_path'])) {
        http_response_code(400);
        adachat_json_headers();
        echo adachat_json_encode_unicode(['error' => 'Cover 模式需要先上传源音频（如 Suno 导出的 WAV）']);
        return;
    }

    $job = adachat_music_create_job([
        'provider_id' => $providerId,
        'model' => $modelName !== '' ? $modelName : adachat_music_default_dit_model(),
        'prompt' => $cap,
        'mode' => 'local',
        'extra' => $extra,
    ]);

    $prepare = adachat_runtime_prepare('music');
    $runtimePrepare = [
        'ok' => (bool) ($prepare['ok'] ?? false),
        'skipped' => (bool) ($prepare['skipped'] ?? false),
        'llama_stop_ok' => !empty($prepare['llama']['ok']),
        'image_unloaded' => !empty($prepare['image_unload']['unloaded'])
            || !empty($prepare['image_unload']['ok']),
        'at' => date('c'),
    ];
    $job['runtime_prepare'] = $runtimePrepare;
    adachat_music_save_job($job);

    // 入队前等 ACE：冷启动可达 ~45s；已 set_time_limit(120)
    $aceWait = adachat_music_acestep_wait_for_gateway(55000);
    $job['acestep_preflight'] = $aceWait;
    if (empty($aceWait['ok'])) {
        $job['status'] = 'failed';
        $job['progress'] = 100;
        $err = (string) ($aceWait['error'] ?? 'ACE-Step API 未就绪');
        if (!empty($aceWait['hint'])) {
            $err .= ' | ' . (string) $aceWait['hint'];
        }
        $job['error'] = $err;
        adachat_music_save_job($job);
        @adachat_runtime_release('music');
        http_response_code(503);
        adachat_json_headers();
        echo adachat_json_encode_unicode([
            'error' => $err,
            'job_id' => $job['id'],
            'acestep_preflight' => $aceWait,
        ]);
        return;
    }
    $job['acestep_ready'] = true;
    $job['acestep_ready_at'] = date('c');
    adachat_music_save_job($job);

    // 入队前再验一次（避免网关通过后 API 立刻退出）
    if (!adachat_music_acestep_health_strict()) {
        $job['status'] = 'failed';
        $job['progress'] = 100;
        $job['error'] = 'ACE-Step 在入队前失去连接 | 请先双击 D:\\ACE-Step\\启动ACE-Step-API.bat 再发任务';
        adachat_music_save_job($job);
        @adachat_runtime_release('music');
        http_response_code(503);
        adachat_json_headers();
        echo adachat_json_encode_unicode([
            'error' => $job['error'],
            'job_id' => $job['id'],
            'probe' => adachat_music_acestep_probe(),
        ]);
        return;
    }

    $spawned = adachat_music_spawn_worker((string) $job['id']);
    if (!$spawned) {
        $job['status'] = 'failed';
        $execOk = function_exists('adachat_is_exec_available') && adachat_is_exec_available();
        $job['error'] = $execOk
            ? '无法启动后台音乐任务（worker 拉起失败）。请重试；若反复失败请双击 D:\\ACE-Step\\启动ACE-Step-API.bat 后再发'
            : '无法启动后台音乐任务（PHP exec 被禁用）';
        adachat_music_save_job($job);
        @adachat_runtime_release('music');
        http_response_code(500);
        adachat_json_headers();
        echo adachat_json_encode_unicode(['error' => $job['error'], 'job_id' => $job['id']]);
        return;
    }

    adachat_json_headers();
    echo adachat_json_encode_unicode([
        'job_id' => $job['id'],
        'status' => 'queued',
        'mode' => 'local',
        'message' => '本地音乐生成任务已排队（ACE-Step）',
        'poll_action' => 'music_job_status',
        'runtime_prepare' => $runtimePrepare,
        'acestep_ready' => true,
        'hint' => !empty($aceWait['already'])
            ? 'ACE-Step 已连接；Cover 长曲生成约 20 分钟，请勿点「释放显存」'
            : 'ACE-Step 已启动；生成可能需数分钟',
    ]);
}
