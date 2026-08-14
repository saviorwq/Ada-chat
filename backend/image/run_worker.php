<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 后台处理单个文生图任务（CLI: php run_worker.php <job_id>）
 */
$workspaceRoot = dirname(__DIR__, 2);
require_once $workspaceRoot . DIRECTORY_SEPARATOR . 'ai_config.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'http.php';

require_once __DIR__ . '/jobs.php';
require_once __DIR__ . '/local.php';
require_once __DIR__ . '/../providers.php';

@ini_set('max_execution_time', '0');
@set_time_limit(0);
@ignore_user_abort(true);

// Windows：补齐 PATH，避免 start /B 子进程缺 PATH 导致 torch KeyError('PATH')
if (stripos(PHP_OS, 'WIN') === 0) {
    $path = (string) (getenv('PATH') ?: getenv('Path') ?: '');
    $needles = [
        'C:\\Windows\\system32',
        'C:\\Windows',
        'C:\\Python314',
        'C:\\Python314\\Scripts',
    ];
    foreach ($needles as $n) {
        if ($n !== '' && stripos($path, $n) === false && is_dir($n)) {
            $path = $n . ($path !== '' ? ';' . $path : '');
        }
    }
    if ($path !== '') {
        @putenv('PATH=' . $path);
        @putenv('Path=' . $path);
        $_ENV['PATH'] = $path;
        $_SERVER['PATH'] = $path;
    }
}

$jobId = $argv[1] ?? '';
if ($jobId === '') {
    fwrite(STDERR, "missing job id\n");
    exit(1);
}

$job = adachat_image_load_job($jobId);
if (!$job) {
    fwrite(STDERR, "job not found\n");
    exit(1);
}

$job['status'] = 'processing';
$job['progress'] = 10;
adachat_image_save_job($job);

$provider = adachat_find_provider((string) ($job['provider_id'] ?? ''));
if (!$provider) {
    $job['status'] = 'failed';
    $job['error'] = '供应商不存在';
    adachat_image_save_job($job);
    try {
        require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'runtime' . DIRECTORY_SEPARATOR . 'coord.php';
        adachat_runtime_release('image');
    } catch (Throwable $e) {
    }
    exit(1);
}

$result = adachat_image_process_local_job($job, $provider);

if (!empty($result['ok'])) {
    $job['status'] = 'completed';
    $job['progress'] = 100;
    $job['local_file'] = (string) ($result['local_file'] ?? '');
    $job['error'] = '';
    if (!empty($result['via'])) {
        $job['via'] = (string) $result['via'];
    }
    if (array_key_exists('reloaded', $result)) {
        $job['reloaded'] = !empty($result['reloaded']);
    }
    if (!empty($result['worker_status'])) {
        $job['worker_status'] = (string) $result['worker_status'];
    }
    if (!empty($result['hint'])) {
        $job['hint'] = (string) $result['hint'];
    }
    if (!empty($result['composition_unlocked'])) {
        $job['composition_unlocked'] = true;
    }
    if (!empty($result['face_locked'])) {
        $job['face_locked'] = true;
    }
} else {
    $job['status'] = 'failed';
    $job['progress'] = 100;
    $job['error'] = (string) ($result['error'] ?? 'unknown_error');
    if (!empty($result['install_hint'])) {
        $job['error'] .= ' | ' . (string) $result['install_hint'];
    } elseif (!empty($result['hint'])) {
        $job['error'] .= ' | ' . (string) $result['hint'];
    }
    if (!empty($result['detail']) && is_array($result['detail'])) {
        $job['error_detail'] = $result['detail'];
    }
}

adachat_image_save_job($job);
// best-effort：任务结束后尝试恢复 Vulkan LLM
try {
    require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'runtime' . DIRECTORY_SEPARATOR . 'coord.php';
    adachat_runtime_release('image');
} catch (Throwable $e) {
    // ignore — 不改变 job 终态
}
exit($job['status'] === 'completed' ? 0 : 1);
