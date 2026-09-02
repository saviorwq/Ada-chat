<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 后台处理单个音乐任务（CLI: php run_worker.php <job_id>）
 */
$workspaceRoot = dirname(__DIR__, 2);
require_once $workspaceRoot . DIRECTORY_SEPARATOR . 'ai_config.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'http.php';

require_once __DIR__ . '/jobs.php';
require_once __DIR__ . '/acestep.php';
require_once __DIR__ . '/../providers.php';

@ini_set('max_execution_time', '0');
@set_time_limit(0);

// Ada 精简 PATH 下补齐 System32，否则 schtasks/wscript 找不到
if (function_exists('adachat_music_win_path_bootstrap')) {
    adachat_music_win_path_bootstrap();
} elseif (stripos(PHP_OS, 'WIN') === 0) {
    $sysRoot = (string) (getenv('SystemRoot') ?: 'C:\\Windows');
    $path = $sysRoot . '\\System32;' . $sysRoot . ';' . (string) (getenv('PATH') ?: '');
    putenv('PATH=' . $path);
}

$jobId = $argv[1] ?? '';
if ($jobId === '') {
    fwrite(STDERR, "missing job id\n");
    exit(1);
}

// 尽早写 alive 标记，供网关/schtasks 确认 worker 已脱离启动
$aliveMarker = adachat_music_jobs_dir() . DIRECTORY_SEPARATOR
    . '_worker_' . preg_replace('/[^a-zA-Z0-9_\-]/', '', $jobId) . '.alive';
@file_put_contents($aliveMarker, date('c') . " pid=" . getmypid() . "\n");

$job = adachat_music_load_job($jobId);
if (!$job) {
    fwrite(STDERR, "job not found\n");
    exit(1);
}

$job['status'] = 'processing';
$job['progress'] = 5;
$job['hint'] = '正在连接 / 启动 ACE-Step（约 127.0.0.1:8001）…';
adachat_music_save_job($job);

$result = adachat_music_process_acestep_job($job);

// reload for acestep_task_id updates
$job = adachat_music_load_job($jobId) ?: $job;

if (!empty($result['ok'])) {
    $job['status'] = 'completed';
    $job['progress'] = 100;
    $job['local_file'] = (string) ($result['local_file'] ?? '');
    $job['audio_url'] = '';
    $job['error'] = '';
    $job['hint'] = '音乐生成完成';
} else {
    $job['status'] = 'failed';
    $job['progress'] = 100;
    $err = (string) ($result['error'] ?? 'unknown_error');
    if (!empty($result['hint'])) {
        $err .= ' | ' . $result['hint'];
    }
    $job['error'] = $err;
}

adachat_music_save_job($job);
try {
    require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'runtime' . DIRECTORY_SEPARATOR . 'coord.php';
    adachat_runtime_release('music');
} catch (Throwable $e) {
    // ignore
}
exit($job['status'] === 'completed' ? 0 : 1);
