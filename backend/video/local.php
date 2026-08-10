<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../utils.php';
require_once __DIR__ . '/../rag_exec.php';
require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/jobs.php';

function adachat_video_process_local_job(array $job, array $provider): array
{
    $script = adachat_video_inference_script_path();
    if (!is_file($script)) {
        return ['ok' => false, 'error' => 'video_inference_bridge.py 缺失'];
    }
    adachat_video_ensure_dirs();
    $outFile = adachat_video_output_dir() . DIRECTORY_SEPARATOR . preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $job['id']) . '.mp4';

    $payload = [
        'job_id' => $job['id'],
        'model_id' => (string) ($job['model'] ?? ''),
        'prompt' => (string) ($job['prompt'] ?? ''),
        'models_dir' => adachat_video_local_models_dir($provider),
        'output_file' => $outFile,
        'image_size' => (string) ($job['extra']['image_size'] ?? '1280x720'),
    ];
    $tmp = tempnam(sys_get_temp_dir(), 'adachat_vid_');
    if ($tmp === false) {
        return ['ok' => false, 'error' => '无法创建临时文件'];
    }
    $reqFile = $tmp . '.json';
    @rename($tmp, $reqFile);
    file_put_contents($reqFile, json_encode($payload, JSON_UNESCAPED_UNICODE));

    $attempts = [];
    foreach (adachat_get_python_commands() as $py) {
        $cmd = adachat_build_command_line($py, $script, 'generate', ['--request-file' => $reqFile]);
        $lines = [];
        $code = 1;
        @exec($cmd, $lines, $code);
        @unlink($reqFile);
        $raw = trim(implode("\n", $lines));
        $attempts[] = ['exit' => $code, 'out' => adachat_usub($raw, 0, 500)];
        if ($code !== 0) {
            continue;
        }
        $parsed = adachat_parse_json_from_mixed_output($raw);
        if (!is_array($parsed)) {
            continue;
        }
        if (!empty($parsed['success']) && is_file($outFile)) {
            return ['ok' => true, 'local_file' => $outFile];
        }
        return ['ok' => false, 'error' => (string) ($parsed['error'] ?? '本地生成失败')];
    }

    return ['ok' => false, 'error' => 'local_video_exec_failed', 'detail' => $attempts];
}
