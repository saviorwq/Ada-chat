<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

require_once __DIR__ . '/../utils.php';
require_once __DIR__ . '/../rag_exec.php';
require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/jobs.php';

/**
 * 扫描本地文生图模型（Diffusers 目录 / 单文件 checkpoint）
 * Scan local text-to-image models (Diffusers dirs / single-file checkpoints)
 *
 * @return array{success: bool, models?: array<int, array<string, mixed>>, models_dir?: string, error?: string, detail?: mixed}
 */
function adachat_image_scan_models(array $provider): array
{
    $script = adachat_image_inference_script_path();
    if (!is_file($script)) {
        return ['success' => false, 'error' => 'image_inference_bridge.py 缺失'];
    }
    $modelsDir = adachat_image_local_models_dir($provider);
    if (!is_dir($modelsDir)) {
        return [
            'success' => true,
            'models' => [],
            'models_dir' => $modelsDir,
        ];
    }

    $attempts = [];
    foreach (adachat_get_python_commands() as $py) {
        $cmd = adachat_build_command_line($py, $script, 'scan', [
            '--models-dir' => $modelsDir,
        ]);
        $lines = [];
        $code = 1;
        @exec($cmd, $lines, $code);
        $raw = trim(implode("\n", $lines));
        $attempts[] = ['exit' => $code, 'out' => adachat_usub($raw, 0, 400)];
        if ($code !== 0) {
            continue;
        }
        $parsed = adachat_parse_json_from_mixed_output($raw);
        if (!is_array($parsed) || empty($parsed['success'])) {
            continue;
        }
        $models = is_array($parsed['models'] ?? null) ? $parsed['models'] : [];
        $normalized = [];
        foreach ($models as $m) {
            if (!is_array($m)) {
                continue;
            }
            $mid = (string) ($m['id'] ?? '');
            if ($mid === '') {
                continue;
            }
            $normalized[] = [
                'id' => $mid,
                'type' => 'image',
                'format' => (string) ($m['format'] ?? ''),
                'family' => (string) ($m['family'] ?? ''),
                'path' => (string) ($m['path'] ?? ''),
            ];
        }
        return [
            'success' => true,
            'models' => $normalized,
            'models_dir' => $modelsDir,
        ];
    }

    return [
        'success' => false,
        'error' => 'image_scan_failed',
        'detail' => $attempts,
        'models_dir' => $modelsDir,
    ];
}

function adachat_image_python_commands(): array
{
    // 文生图只用已知装好 torch+xpu 的解释器，避免后面无 diffusers 的 Python 覆盖真实错误
    // Image gen: prefer the known torch+xpu interpreter only
    $preferred = [];
    $seen = [];
    $push = function (string $exe) use (&$preferred, &$seen): void {
        $exe = trim($exe);
        if ($exe === '' || isset($seen[strtolower($exe)])) {
            return;
        }
        if ($exe !== 'python' && $exe !== 'python3' && $exe !== 'py' && !is_file($exe)) {
            return;
        }
        $seen[strtolower($exe)] = true;
        $preferred[] = ['exe' => $exe, 'extra' => []];
    };
    $push('C:\\Python314\\python.exe');
    foreach (adachat_get_python_commands() as $spec) {
        if (!is_array($spec)) {
            continue;
        }
        $push((string) ($spec['exe'] ?? ''));
    }
    return $preferred !== [] ? $preferred : adachat_get_python_commands();
}

function adachat_image_process_local_job(array $job, array $provider): array
{
    $script = adachat_image_inference_script_path();
    if (!is_file($script)) {
        return ['ok' => false, 'error' => 'image_inference_bridge.py 缺失'];
    }
    require_once __DIR__ . '/worker.php';

    adachat_image_ensure_dirs();
    $safeId = preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $job['id']);
    $outFile = adachat_image_output_dir() . DIRECTORY_SEPARATOR . $safeId . '.png';

    $payload = [
        'job_id' => $job['id'],
        'model_id' => (string) ($job['model'] ?? ''),
        'prompt' => (string) ($job['prompt'] ?? ''),
        'negative_prompt' => (string) ($job['extra']['negative_prompt'] ?? ''),
        'models_dir' => adachat_image_local_models_dir($provider),
        'output_file' => $outFile,
        'image_size' => (string) ($job['extra']['image_size'] ?? ''),
        'steps' => (int) ($job['extra']['steps'] ?? 28),
        'guidance_scale' => (float) ($job['extra']['guidance_scale'] ?? 7.0),
        'seed' => $job['extra']['seed'] ?? null,
    ];

    // 优先常驻 Image Worker（加载一次、后续复用）
    $viaWorker = adachat_image_worker_generate($payload);
    if (is_array($viaWorker)) {
        if (!empty($viaWorker['ok']) && is_file($outFile)) {
            return [
                'ok' => true,
                'local_file' => $outFile,
                'via' => 'resident_worker',
                'reloaded' => !empty($viaWorker['reloaded']),
                'worker_status' => (string) ($viaWorker['worker_status'] ?? ''),
            ];
        }
        // worker 返回了明确业务错误（非 transient 空）→ 不要 silent oneshot 掩盖
        if (
            isset($viaWorker['ok'])
            && empty($viaWorker['ok'])
            && empty($viaWorker['transient'])
            && (string) ($viaWorker['error'] ?? '') !== ''
            && (string) ($viaWorker['error'] ?? '') !== 'worker_unreachable'
        ) {
            return [
                'ok' => false,
                'error' => (string) $viaWorker['error'],
                'install_hint' => $viaWorker['install_hint'] ?? null,
                'via' => 'resident_worker',
                'worker_status' => (string) ($viaWorker['worker_status'] ?? ''),
                'detail' => $viaWorker['detail'] ?? null,
            ];
        }
        // unreachable → fall through to oneshot
    }

    $tmp = tempnam(sys_get_temp_dir(), 'adachat_img_');
    if ($tmp === false) {
        return ['ok' => false, 'error' => '无法创建临时文件'];
    }
    $reqFile = $tmp . '.json';
    @rename($tmp, $reqFile);
    file_put_contents($reqFile, json_encode($payload, JSON_UNESCAPED_UNICODE));

    @putenv('PYTHONUTF8=1');
    @putenv('PYTHONIOENCODING=utf-8');

    $attempts = [];
    $firstHardError = null;
    $lastMissing = null;
    foreach (adachat_image_python_commands() as $py) {
        $cmd = adachat_build_command_line($py, $script, 'generate', ['--request-file' => $reqFile]);
        $lines = [];
        $code = 1;
        @exec($cmd, $lines, $code);
        $raw = trim(implode("\n", $lines));
        $attempts[] = [
            'exe' => (string) ($py['exe'] ?? ''),
            'exit' => $code,
            'out' => adachat_usub($raw, 0, 1200),
        ];
        $parsed = adachat_parse_json_from_mixed_output($raw);
        if (!is_array($parsed) && $raw !== '') {
            if (preg_match('/\{.*\}/s', $raw, $m)) {
                $parsed = json_decode($m[0], true);
            }
        }
        if (is_array($parsed)) {
            if (!empty($parsed['success']) && is_file($outFile)) {
                @unlink($reqFile);
                return ['ok' => true, 'local_file' => $outFile, 'via' => 'oneshot'];
            }
            $err = (string) ($parsed['error'] ?? '');
            $missingDeps =
                $err !== ''
                && (
                    str_contains($err, '缺少依赖')
                    || (str_contains($err, 'diffusers') && str_contains($err, '缺少'))
                    || (
                        !empty($parsed['install_hint'])
                        && (str_contains($err, '缺少') || str_contains(strtolower($err), 'missing'))
                    )
                );
            if ($err !== '' && !$missingDeps) {
                if (str_contains($err, '10106')) {
                    $err =
                        $err .
                        ' | Intel XPU/驱动初始化失败：请关闭其它占用 Arc 的进程后重试；并确认 PATH 含 Intel oneAPI（如 C:\\Program Files (x86)\\Intel\\oneAPI\\2026.0\\bin）';
                }
                @unlink($reqFile);
                return [
                    'ok' => false,
                    'error' => $err,
                    'install_hint' => $parsed['install_hint'] ?? ($parsed['hint'] ?? null),
                    'detail' => $attempts,
                    'via' => 'oneshot',
                ];
            }
            if ($missingDeps) {
                $lastMissing = $parsed;
                continue;
            }
            if ($err !== '' && $firstHardError === null) {
                $firstHardError = $parsed;
            }
            continue;
        }
        if ($code === 0 && is_file($outFile)) {
            @unlink($reqFile);
            return ['ok' => true, 'local_file' => $outFile, 'via' => 'oneshot'];
        }
    }
    @unlink($reqFile);

    if (is_array($firstHardError) && !empty($firstHardError['error'])) {
        return [
            'ok' => false,
            'error' => (string) $firstHardError['error'],
            'install_hint' => $firstHardError['install_hint'] ?? ($firstHardError['hint'] ?? null),
            'detail' => $attempts,
            'via' => 'oneshot',
        ];
    }
    if (is_array($lastMissing) && !empty($lastMissing['error'])) {
        return [
            'ok' => false,
            'error' => (string) $lastMissing['error'],
            'install_hint' => $lastMissing['install_hint'] ?? ($lastMissing['hint'] ?? null),
            'detail' => $attempts,
            'via' => 'oneshot',
        ];
    }

    $firstOut = (string) ($attempts[0]['out'] ?? '');
    return [
        'ok' => false,
        'error' => 'local_image_exec_failed',
        'detail' => $attempts,
        'via' => 'oneshot',
        'hint' =>
            $firstOut !== ''
                ? ('首个解释器输出: ' . adachat_usub($firstOut, 0, 300))
                : '请确认 C:\\Python314\\python.exe 可用，并已安装 requirements-local-image.txt（torch+xpu）',
    ];
}
