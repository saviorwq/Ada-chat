<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 本地模型推理网关（直连 GGUF / Safetensors）
 * Local model inference gateway (direct GGUF / Safetensors)
 */

require_once __DIR__ . '/exec.php';
require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/worker.php';
require_once __DIR__ . '/../json.php';
require_once __DIR__ . '/../utils.php';

function adachat_local_inference_stdout_is_error(string $buf): bool
{
    $t = ltrim($buf);
    return strpos($t, '{"error"') === 0 || strpos($t, '{"error":') !== false;
}

function adachat_local_inference_stdout_is_stream(string $buf): bool
{
    return strpos($buf, 'data:') !== false;
}

/**
 * 仅转发合法 SSE 行，丢弃 llama-cpp 可能写入 stdout 的二进制/杂讯
 */
function adachat_local_inference_emit_sse_buffer(string $buffer, bool $streamMode): string
{
    if ($buffer === '') {
        return '';
    }
    $lines = preg_split('/\r\n|\r|\n/', $buffer);
    if (!is_array($lines)) {
        return $buffer;
    }
    $tail = array_pop($lines);
    foreach ($lines as $line) {
        $trim = trim((string) $line);
        if ($trim === '') {
            continue;
        }
        if (strpos($trim, 'data:') === 0) {
            echo $trim . "\n\n";
            if ($streamMode) {
                flush();
            }
            continue;
        }
        // 忽略非 SSE 行（二进制/日志）
    }
    return is_string($tail) ? $tail : '';
}

function adachat_local_inference_extract_error_message(string $raw): string
{
    $parsed = adachat_parse_json_from_mixed_output($raw);
    if (!is_array($parsed)) {
        return '';
    }
    if (isset($parsed['error']) && is_array($parsed['error'])) {
        return trim((string) ($parsed['error']['message'] ?? ''));
    }
    if (isset($parsed['error']) && is_string($parsed['error'])) {
        return trim($parsed['error']);
    }
    return '';
}

function adachat_local_inference_emit_sse_error(string $message, bool $streamMode): void
{
    $msg = trim($message);
    if ($msg === '') {
        $msg = '本地推理失败';
    }
    echo 'data: ' . adachat_json_encode_unicode([
        'error' => ['message' => $msg, 'type' => 'local_inference_error'],
    ]) . "\n\ndata: [DONE]\n\n";
    if ($streamMode) {
        flush();
    }
}

/**
 * 将 Python 输出的 JSON 错误转为 SSE，避免被 emit_sse_buffer 丢弃
 */
function adachat_local_inference_try_emit_stdout_error(string $stdoutBuf, bool $streamMode): bool
{
    if (!adachat_local_inference_stdout_is_error($stdoutBuf)) {
        return false;
    }
    $msg = adachat_local_inference_extract_error_message($stdoutBuf);
    adachat_local_inference_emit_sse_error($msg !== '' ? $msg : $stdoutBuf, $streamMode);
    return true;
}

function adachat_local_inference_proc_env(): array
{
    $env = [];
    foreach (array_merge($_ENV, $_SERVER) as $key => $value) {
        if (!is_string($key) || !is_string($value)) {
            continue;
        }
        if (strpos($key, 'HTTP_') === 0) {
            continue;
        }
        $env[$key] = $value;
    }
    $env['PYTHONIOENCODING'] = 'utf-8';
    $env['PYTHONUTF8'] = '1';
    // 允许读取用户目录下的 pip --user 包装，避免托盘/服务进程找不到 llama-cpp-python
    // Allow user-site packages so tray/service PHP can see pip --user installs
    unset($env['PYTHONNOUSERSITE']);

    // 托盘/精简环境可能缺少用户配置目录，补齐后 Python 才能找到 Roaming site-packages
    // Tray/minimal envs may lack profile vars; restore so Python can find Roaming site-packages
    $userProfile = '';
    foreach (['USERPROFILE', 'HOME'] as $k) {
        $v = trim((string) ($env[$k] ?? getenv($k) ?: ''));
        if ($v !== '' && is_dir($v)) {
            $userProfile = $v;
            break;
        }
    }
    if ($userProfile === '') {
        $guess = 'C:\\Users\\Administrator';
        if (is_dir($guess)) {
            $userProfile = $guess;
        }
    }
    if ($userProfile !== '') {
        $env['USERPROFILE'] = $userProfile;
        $env['HOME'] = $userProfile;
        if (empty($env['APPDATA']) || !is_dir((string) $env['APPDATA'])) {
            $env['APPDATA'] = $userProfile . '\\AppData\\Roaming';
        }
        if (empty($env['LOCALAPPDATA']) || !is_dir((string) $env['LOCALAPPDATA'])) {
            $env['LOCALAPPDATA'] = $userProfile . '\\AppData\\Local';
        }
    }

    // proc_open 传入 env 会整表替换；Windows 缺 SystemRoot/PATH 时可能导致原生 DLL 加载失败
    // proc_open replaces the whole env; missing SystemRoot/PATH can break native DLL loads
    if (empty($env['SystemRoot']) && empty($env['SYSTEMROOT'])) {
        $sr = getenv('SystemRoot') ?: (getenv('SYSTEMROOT') ?: 'C:\\Windows');
        $env['SystemRoot'] = $sr;
        $env['SYSTEMROOT'] = $sr;
    }
    $pathNow = (string) ($env['PATH'] ?? $env['Path'] ?? '');
    if (trim($pathNow) === '') {
        $pathNow = (string) (getenv('PATH') ?: getenv('Path') ?: '');
    }
    $pathBits = [
        'C:\\Users\\Administrator\\AppData\\Local\\Python\\pythoncore-3.14-64',
        'C:\\Users\\Administrator\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts',
        'C:\\Python314',
        'C:\\Python314\\Scripts',
        'C:\\Windows\\System32',
        'C:\\Windows',
    ];
    $env['PATH'] = implode(';', $pathBits)
        . ($pathNow !== '' ? (';' . $pathNow) : '');
    $env['Path'] = $env['PATH'];

    // 把已确认的用户 site 注入 PYTHONPATH，彻底绕过 site 禁用问题
    // Inject known user site into PYTHONPATH to bypass disabled user-site
    $userSite = $userProfile !== ''
        ? ($userProfile . '\\AppData\\Roaming\\Python\\Python314\\site-packages')
        : '';
    $localSite = 'C:\\Users\\Administrator\\AppData\\Local\\Python\\pythoncore-3.14-64\\Lib\\site-packages';
    $extra = [];
    foreach ([$localSite, $userSite] as $p) {
        if ($p !== '' && is_dir($p)) {
            $extra[] = $p;
        }
    }
    if ($extra) {
        $existing = trim((string) ($env['PYTHONPATH'] ?? ''));
        $env['PYTHONPATH'] = implode(PATH_SEPARATOR, $extra)
            . ($existing !== '' ? (PATH_SEPARATOR . $existing) : '');
    }

    return $env;
}

/**
 * 本地依赖预检；失败时已输出 JSON 并返回 false
 */
function adachat_local_inference_preflight_or_respond(): bool
{
    $ret = adachat_run_local_inference_bridge('doctor', []);
    if (empty($ret['ok'])) {
        http_response_code(503);
        adachat_json_headers();
        echo adachat_json_encode_unicode([
            'error' => '本地推理环境不可用',
            'detail' => $ret['error'] ?? 'doctor_failed',
            'install_hint' => 'pip install -r requirements-local-inference.txt',
            'docs' => 'docs/local-inference.md',
        ]);
        return false;
    }

    $data = is_array($ret['data'] ?? null) ? $ret['data'] : [];
    $llama = !empty($data['llama_cpp']);
    $jinja = !empty($data['jinja2']);
    $transformers = !empty($data['transformers']);
    if ($llama && !$jinja) {
        http_response_code(503);
        adachat_json_headers();
        echo adachat_json_encode_unicode([
            'error' => '缺少 jinja2（llama-cpp-python 依赖）',
            'install_hint' => 'pip install jinja2  或  pip install -r requirements-local-inference.txt',
            'docs' => 'docs/local-inference.md',
        ]);
        return false;
    }
    if (!$llama && !$transformers) {
        http_response_code(503);
        adachat_json_headers();
        echo adachat_json_encode_unicode([
            'error' => '未检测到本地推理库（llama-cpp-python 或 torch+transformers）',
            'install_hint' => 'pip install -r requirements-local-inference.txt',
            'optional_video' => 'pip install -r requirements-local-video.txt',
            'docs' => 'docs/local-inference.md',
        ]);
        return false;
    }

    return true;
}

function adachat_local_inference_reject_unsupported_task(string $task, array $provider): void
{
    unset($provider);
    $labels = [
        'image' => '文生图 / 图生图',
        'video' => '视频生成',
    ];
    $label = $labels[$task] ?? $task;

    http_response_code(400);
    adachat_json_headers();
    echo adachat_json_encode_unicode([
        'error' => "本地直连模式不支持「{$label}」任务",
        'hint' => '请改用云端供应商并填写 API Key，或将推理方式改为 HTTP 兼容 API。'
            . ' 本地 Diffusers 文生图（v1.5）：创建 ai_data/features/local_image_enabled 并安装 requirements-local-image.txt，详见 docs/v1.5-local-image-runtime.md。'
            . ' 视频请使用 🎬 视频分类：云端 Wan API 为默认，本地需 safetensors 权重。',
        'routing' => 'blocked_local',
        'task' => $task,
    ]);
}

function adachat_local_inference_scan_models(array $provider): array
{
    $modelsDir = adachat_local_provider_models_dir($provider);
    if (!is_dir($modelsDir)) {
        @mkdir($modelsDir, 0755, true);
    }

    $ret = adachat_run_local_inference_bridge('scan', [
        '--models-dir' => $modelsDir,
    ]);
    if (empty($ret['ok'])) {
        return [
            'success' => false,
            'error' => $ret['error'] ?? 'scan_failed',
            'detail' => $ret['detail'] ?? null,
        ];
    }

    $data = is_array($ret['data'] ?? null) ? $ret['data'] : [];
    $models = is_array($data['models'] ?? null) ? $data['models'] : [];

    return [
        'success' => true,
        'models' => $models,
        'models_dir' => $modelsDir,
    ];
}

/**
 * @param array<string, mixed> $parsed gateway parse result from adachat_gateway_parse_input()
 */
function adachat_local_inference_handle_chat(
    array $parsed,
    string $providerId,
    string $modelName,
    array $provider
): void {
    $modelsDir = adachat_local_provider_models_dir($provider);
    if (!is_dir($modelsDir)) {
        @mkdir($modelsDir, 0755, true);
    }

    // 本地无云端额度：未手动指定时给足生成长度（思考模型需额外额度写正文）
    // Local has no cloud quota: generous default (thinking models need headroom for the answer)
    $maxTokens = 8192;
    if (is_numeric($parsed['inputMaxTokens'] ?? null)) {
        $maxTokens = max(256, (int) $parsed['inputMaxTokens']);
    }
    $payload = [
        'models_dir' => $modelsDir,
        'model_id' => $modelName,
        'messages' => $parsed['messages'] ?? [],
        'stream' => !empty($parsed['stream']),
        'temperature' => is_numeric($parsed['temperature'] ?? null) ? (float) $parsed['temperature'] : 0.7,
        'max_tokens' => $maxTokens,
        'no_quota' => true,
    ];

    $tmp = tempnam(sys_get_temp_dir(), 'adachat_local_');
    if ($tmp === false) {
        http_response_code(500);
        adachat_json_headers();
        echo adachat_json_encode_unicode(['error' => '无法创建临时请求文件']);
        return;
    }
    $reqFile = $tmp . '.json';
    @rename($tmp, $reqFile);
    file_put_contents($reqFile, json_encode($payload, JSON_UNESCAPED_UNICODE));

    $script = adachat_local_inference_script_path();
    if (!file_exists($script)) {
        @unlink($reqFile);
        http_response_code(500);
        adachat_json_headers();
        echo adachat_json_encode_unicode(['error' => 'local_inference_bridge.py 缺失']);
        return;
    }

    $stream = !empty($parsed['stream']);
    // 本地 GGUF 首次加载可能超过 30s，必须解除 PHP 执行时间限制
    @ini_set('max_execution_time', '0');
    @set_time_limit(0);

    $responseBodyStarted = false;
    if ($stream) {
        header('Content-Type: text/event-stream; charset=utf-8');
        header('X-Accel-Buffering: no');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-AdaChat-Local-Inference: direct');
        while (ob_get_level()) {
            ob_end_clean();
        }
        echo ": local-inference-started\n\n";
        flush();
        $responseBodyStarted = true;
    } else {
        adachat_json_headers();
        header('X-AdaChat-Local-Inference: direct');
    }

    // 优先走常驻 worker（模型缓存）；失败再回退到一次性进程
    // Prefer persistent worker (model cache); fall back to one-shot process
    if (adachat_local_worker_proxy_chat($payload, $stream)) {
        @unlink($reqFile);
        return;
    }

    $ran = false;
    $lastFailDetail = '';
    $errorAlreadyEmitted = false;
    foreach (adachat_get_python_commands() as $py) {
        $cmd = adachat_build_command_line($py, $script, 'chat', [
            '--models-dir' => $modelsDir,
            '--request-file' => $reqFile,
        ], false);

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $proc = @proc_open($cmd, $descriptors, $pipes, null, adachat_local_inference_proc_env());
        if (!is_resource($proc)) {
            continue;
        }
        fclose($pipes[0]);
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);

        $stderr = '';
        $stdoutBuf = '';
        $streamingStarted = false;
        $sseLineRemain = '';
        $lastKeepalive = time();
        while (true) {
            if (connection_aborted()) {
                proc_terminate($proc);
                break;
            }
            if (
                $stream
                && !$streamingStarted
                && (time() - $lastKeepalive) >= 5
            ) {
                echo ": loading\n\n";
                flush();
                $lastKeepalive = time();
                $responseBodyStarted = true;
            }
            $chunk = fread($pipes[1], 8192);
            if ($chunk !== false && $chunk !== '') {
                $stdoutBuf .= $chunk;
                $sseLineRemain .= $chunk;
                $sseLineRemain = adachat_local_inference_emit_sse_buffer($sseLineRemain, (bool) $stream);
                if (!$streamingStarted && adachat_local_inference_stdout_is_stream($stdoutBuf)) {
                    $streamingStarted = true;
                    $responseBodyStarted = true;
                }
                if (
                    $stream
                    && !$errorAlreadyEmitted
                    && adachat_local_inference_try_emit_stdout_error($stdoutBuf, true)
                ) {
                    $errorAlreadyEmitted = true;
                    $streamingStarted = true;
                    $responseBodyStarted = true;
                    proc_terminate($proc);
                    break;
                }
            }
            $err = fread($pipes[2], 4096);
            if ($err !== false && $err !== '') {
                $stderr .= $err;
            }
            $status = proc_get_status($proc);
            if (!$status['running']) {
                $rest = stream_get_contents($pipes[1]);
                if (is_string($rest) && $rest !== '') {
                    $stdoutBuf .= $rest;
                    $sseLineRemain .= $rest;
                    $sseLineRemain = adachat_local_inference_emit_sse_buffer($sseLineRemain, (bool) $stream);
                    if (!$streamingStarted && adachat_local_inference_stdout_is_stream($stdoutBuf)) {
                        $streamingStarted = true;
                    }
                }
                if ($sseLineRemain !== '') {
                    $sseLineRemain = adachat_local_inference_emit_sse_buffer($sseLineRemain . "\n", (bool) $stream);
                }
                if (
                    $stream
                    && !$errorAlreadyEmitted
                    && adachat_local_inference_try_emit_stdout_error($stdoutBuf, true)
                ) {
                    $errorAlreadyEmitted = true;
                    $streamingStarted = true;
                    $responseBodyStarted = true;
                }
                break;
            }
            usleep(10000);
        }

        fclose($pipes[1]);
        fclose($pipes[2]);
        $exit = proc_close($proc);

        if ($exit === 0) {
            if (!$streamingStarted && $stdoutBuf !== '' && !adachat_local_inference_stdout_is_error($stdoutBuf)) {
                echo $stdoutBuf;
                flush();
                $responseBodyStarted = true;
            }
            $ran = true;
            break;
        }

        $lastFailDetail = trim($stderr . "\n" . $stdoutBuf);
        if ($streamingStarted || $errorAlreadyEmitted) {
            $ran = true;
            break;
        }
        // 当前 Python 候选失败且未输出有效内容 → 尝试下一个
    }

    @unlink($reqFile);

    if (!$ran) {
        $msg = adachat_local_inference_extract_error_message($lastFailDetail);
        if ($stream && $responseBodyStarted) {
            if (!$errorAlreadyEmitted && !connection_aborted()) {
                adachat_local_inference_emit_sse_error(
                    $msg !== '' ? $msg : '本地推理失败',
                    true
                );
            }
        } else {
            if (!$responseBodyStarted) {
                http_response_code(500);
            }
            if (!$stream) {
                echo adachat_json_encode_unicode([
                    'error' => $msg !== '' ? $msg : '本地推理失败',
                    'detail' => adachat_usub($lastFailDetail, 0, 500) ?: '无法启动 Python 本地推理进程',
                ]);
            }
        }
    }
}
