<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * RAG 向量桥执行工具（模块化）
 * RAG vector-bridge execution helpers (module)
 *
 * 依赖：
 * - backend/server_control.php: adachat_is_exec_available()
 * - backend/utils.php: adachat_usub()
 * - backend/rag_paths.php: adachat_rag_vector_*()
 */

/**
 * @return array<int, array{exe: string, extra: array<int, string>}>
 */
function adachat_get_python_commands(): array
{
    $out = [];
    $seen = [];
    $push = function (string $exe, array $extra = []) use (&$out, &$seen): void {
        $key = strtolower($exe . '|' . implode(' ', $extra));
        if (isset($seen[$key])) {
            return;
        }
        $seen[$key] = true;
        $out[] = ['exe' => $exe, 'extra' => $extra];
    };

    // 1) 显式环境变量（最高优先级）
    foreach (['ADACHAT_PYTHON_BIN', 'RAG_PYTHON_BIN'] as $envKey) {
        $envPython = trim((string) getenv($envKey));
        if ($envPython !== '' && file_exists($envPython)) {
            $push($envPython, []);
        }
    }

    // 2) 已知绝对路径（避免 py -3 把 -3 传给 python.exe 导致 Unknown option: -3）
    // 优先系统 Python314（本机已装 torch/diffusers）；Local pythoncore 常缺图像依赖
    $absCandidates = [
        'C:\\Python314\\python.exe',
        'C:\\Python313\\python.exe',
        'C:\\Python312\\python.exe',
        'C:\\Users\\Administrator\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe',
        'C:\\Users\\Administrator\\AppData\\Local\\Python\\bin\\python.exe',
        '/usr/bin/python3',
        '/usr/local/bin/python3',
        '/opt/python/bin/python3',
    ];
    $userProfile = (string) ($_SERVER['USERPROFILE'] ?? getenv('USERPROFILE') ?? '');
    if ($userProfile !== '') {
        $absCandidates[] = $userProfile . '\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe';
        $absCandidates[] = $userProfile . '\\AppData\\Local\\Python\\bin\\python.exe';
        $globPy = glob($userProfile . '\\AppData\\Local\\Programs\\Python\\Python*\\python.exe') ?: [];
        foreach ($globPy as $gp) {
            $absCandidates[] = $gp;
        }
    }
    foreach ($absCandidates as $p) {
        if ($p !== '' && file_exists($p)) {
            $push($p, []);
        }
    }

    // 3) PATH 中的 python
    $push('python', []);
    $push('python3', []);
    $push('py', []);

    // 4) py -3 仅作兜底（-3 是 py 启动器参数，不能传给 python.exe）
    if (stripos(PHP_OS, 'WIN') === 0) {
        $push('py', ['-3']);
    }

    return $out;
}

/**
 * @param array{exe: string, extra: array<int, string>} $pySpec
 * @param array<string, string|int|null> $args
 */
function adachat_build_command_line(
    array $pySpec,
    string $script,
    string $subcommand,
    array $args = [],
    bool $mergeStderr = true
): string {
    $parts = [escapeshellarg((string) $pySpec['exe'])];
    foreach (($pySpec['extra'] ?? []) as $e) {
        $parts[] = escapeshellarg((string) $e);
    }
    $parts[] = escapeshellarg($script);
    $parts[] = escapeshellarg($subcommand);
    foreach ($args as $k => $v) {
        if ($v === null || $v === '') {
            continue;
        }
        $parts[] = escapeshellarg((string) $k);
        $parts[] = escapeshellarg((string) $v);
    }
    $cmd = implode(' ', $parts);
    if ($mergeStderr) {
        $cmd .= ' 2>&1';
    }
    return $cmd;
}

/**
 * @return array<string, mixed>|null
 */
function adachat_parse_json_from_mixed_output(string $raw): ?array
{
    $txt = trim($raw);
    if ($txt === '') {
        return null;
    }
    $parsed = json_decode($txt, true);
    if (is_array($parsed)) {
        return $parsed;
    }

    // Fallback: parse the last non-empty line as JSON.
    $lines = preg_split('/\r\n|\r|\n/', $txt);
    if (!is_array($lines)) {
        return null;
    }
    for ($i = count($lines) - 1; $i >= 0; $i--) {
        $line = trim((string) $lines[$i]);
        if ($line === '') {
            continue;
        }
        $cand = json_decode($line, true);
        if (is_array($cand)) {
            return $cand;
        }
    }
    return null;
}

/**
 * @param array<string, string|int|null> $args
 * @return array{ok: bool, data?: array<string, mixed>, error?: string, detail?: array<string, mixed>}
 */
function adachat_run_rag_vector_bridge(string $subcommand, array $args = []): array
{
    $script = adachat_rag_vector_script_path();
    if (!file_exists($script)) {
        return ['ok' => false, 'error' => 'vector_bridge_missing'];
    }
    if (!adachat_is_exec_available()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }

    $defaultArgs = [
        '--store' => adachat_rag_vector_store_path(),
        '--db-dir' => adachat_rag_vector_db_dir(),
        '--collection' => 'adachat_rag',
    ];
    $merged = array_merge($defaultArgs, $args);

    $attempts = [];
    foreach (adachat_get_python_commands() as $py) {
        $cmd = adachat_build_command_line($py, $script, $subcommand, $merged);
        $lines = [];
        $code = 1;
        @exec($cmd, $lines, $code);
        $raw = trim(implode("\n", $lines));
        $attempts[] = [
            'cmd' => $cmd,
            'exit_code' => $code,
            'output' => adachat_usub($raw, 0, 500),
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
        'error' => 'vector_bridge_exec_failed',
        'detail' => ['attempts' => $attempts],
    ];
}

