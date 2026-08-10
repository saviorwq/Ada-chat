<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 本地推理 Python 桥执行
 * Local inference Python bridge execution
 */

require_once __DIR__ . '/../rag_exec.php';
require_once __DIR__ . '/paths.php';

/**
 * @param array<string, string|int|float|null> $args
 * @return array{ok: bool, data?: array<string, mixed>, error?: string, detail?: array<string, mixed>}
 */
function adachat_run_local_inference_bridge(string $subcommand, array $args = []): array
{
    $script = adachat_local_inference_script_path();
    if (!file_exists($script)) {
        return ['ok' => false, 'error' => 'local_inference_bridge_missing'];
    }
    if (!adachat_is_exec_available()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }

    // 与 chat 的 proc_open 环境对齐，避免 doctor 正常但 chat 找不到包装
    // Align with chat proc_open env so doctor/chat don't diverge
    if (function_exists('adachat_local_inference_proc_env')) {
        foreach (adachat_local_inference_proc_env() as $k => $v) {
            if (!is_string($k) || !is_string($v)) {
                continue;
            }
            @putenv($k . '=' . $v);
            $_ENV[$k] = $v;
        }
    } else {
        @putenv('PYTHONNOUSERSITE');
        $localSite = 'C:\\Users\\Administrator\\AppData\\Local\\Python\\pythoncore-3.14-64\\Lib\\site-packages';
        $userSite = 'C:\\Users\\Administrator\\AppData\\Roaming\\Python\\Python314\\site-packages';
        $parts = [];
        foreach ([$localSite, $userSite] as $p) {
            if (is_dir($p)) {
                $parts[] = $p;
            }
        }
        if ($parts) {
            $pp = implode(PATH_SEPARATOR, $parts);
            $old = (string) (getenv('PYTHONPATH') ?: '');
            @putenv('PYTHONPATH=' . $pp . ($old !== '' ? (PATH_SEPARATOR . $old) : ''));
        }
    }

    $attempts = [];
    foreach (adachat_get_python_commands() as $py) {
        $cmd = adachat_build_command_line($py, $script, $subcommand, $args);
        $lines = [];
        $code = 1;
        @exec($cmd, $lines, $code);
        $raw = trim(implode("\n", $lines));
        $attempts[] = [
            'cmd' => $cmd,
            'exit_code' => $code,
            'output' => adachat_usub($raw, 0, 800),
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
        'error' => 'local_inference_bridge_exec_failed',
        'detail' => ['attempts' => $attempts],
    ];
}
