<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * ACE-Step REST 客户端（常驻 :8001）
 * ACE-Step REST client (resident :8001)
 */

require_once __DIR__ . '/paths.php';
require_once __DIR__ . '/jobs.php';
require_once __DIR__ . '/source_audio.php';
require_once __DIR__ . '/prompt_prep.php';
require_once __DIR__ . '/../utils.php';
require_once __DIR__ . '/../server_control.php';

function adachat_music_curl(
    string $method,
    string $url,
    ?array $json = null,
    int $timeout = 120
): array {
    $isLocalAce = stripos($url, '127.0.0.1') !== false || stripos($url, 'localhost') !== false;
    if ($isLocalAce && stripos(PHP_OS, 'WIN') === 0 && adachat_is_exec_available()) {
        if (function_exists('adachat_music_win_path_bootstrap')) {
            adachat_music_win_path_bootstrap();
        }
        // CLI worker（Job Object 内）：PHP curl 连不上 :8001，优先 curl.exe / PowerShell
        // CLI worker under Job Object: PHP curl cannot reach :8001 — use curl.exe / PS first
        if (PHP_SAPI === 'cli') {
            $viaExe = adachat_music_curl_via_curl_exe($method, $url, $json, $timeout);
            if (!empty($viaExe['ok'])) {
                return $viaExe;
            }
            $viaPs = adachat_music_curl_via_powershell($method, $url, $json, $timeout);
            if (!empty($viaPs['ok'])) {
                return $viaPs;
            }
        }
    }

    if (!function_exists('curl_init')) {
        if ($isLocalAce && stripos(PHP_OS, 'WIN') === 0 && adachat_is_exec_available()) {
            return adachat_music_curl_via_curl_exe($method, $url, $json, $timeout);
        }
        return ['ok' => false, 'code' => 0, 'body' => '', 'error' => 'curl_missing'];
    }
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);
    // 避免 IPv6 解析卡住；本机 API 不走系统代理
    if (defined('CURL_IPRESOLVE_V4')) {
        curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
    }
    curl_setopt($ch, CURLOPT_PROXY, '');
    if (defined('CURLOPT_NOPROXY')) {
        curl_setopt($ch, CURLOPT_NOPROXY, '127.0.0.1,localhost');
    }
    $m = strtoupper($method);
    if ($m === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Accept: application/json',
        ]);
        if ($json !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($json, JSON_UNESCAPED_UNICODE));
        }
    } elseif ($m !== 'GET') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $m);
        if ($json !== null) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Accept: application/json',
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($json, JSON_UNESCAPED_UNICODE));
        }
    }
    $body = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    $ok = $code >= 200 && $code < 300;
    if ($ok || $code > 0 || stripos(PHP_OS, 'WIN') !== 0 || !adachat_is_exec_available()) {
        return ['ok' => $ok, 'code' => $code, 'body' => $body, 'error' => $err];
    }
    // 部分后台 worker 内 PHP curl 对 127.0.0.1 偶发 code=0；用系统 curl.exe 兜底
    return adachat_music_curl_via_curl_exe($method, $url, $json, $timeout, $body, $code, $err);
}

/**
 * Windows curl.exe 兜底（worker 内 PHP curl 连不上本机 :8001 时）
 *
 * @return array{ok: bool, code: int, body: string, error: string}
 */
function adachat_music_curl_via_curl_exe(
    string $method,
    string $url,
    ?array $json,
    int $timeout,
    string $prevBody = '',
    int $prevCode = 0,
    string $prevErr = ''
): array {
    $curlExe = 'curl.exe';
    $sysRoot = (string) (getenv('SystemRoot') ?: 'C:\\Windows');
    $sysCurl = $sysRoot . '\\System32\\curl.exe';
    if (is_file($sysCurl)) {
        $curlExe = $sysCurl;
    }
    $m = strtoupper($method);
    $tmpBody = tempnam(sys_get_temp_dir(), 'adachat_curl_body_');
    if ($tmpBody === false) {
        return ['ok' => false, 'code' => $prevCode, 'body' => $prevBody, 'error' => $prevErr ?: 'tmp_failed'];
    }
    // 勿用 -w %{http_code}：经 cmd 后 % 被吞，且换行会拆掉 URL
    // Avoid -w %{http_code}: cmd eats % and newlines break the URL argv
    $args = [
        escapeshellarg($curlExe),
        '-sS',
        '--fail',
        '-m',
        (string) max(1, $timeout),
        '--connect-timeout',
        '5',
        '-H',
        escapeshellarg('Accept: application/json'),
        '-o',
        escapeshellarg($tmpBody),
    ];
    $tmpJson = '';
    if ($m === 'POST') {
        $args[] = '-X';
        $args[] = 'POST';
        $args[] = '-H';
        $args[] = escapeshellarg('Content-Type: application/json');
        if ($json !== null) {
            $tmpJson = tempnam(sys_get_temp_dir(), 'adachat_curl_');
            if ($tmpJson === false) {
                @unlink($tmpBody);
                return ['ok' => false, 'code' => $prevCode, 'body' => $prevBody, 'error' => $prevErr ?: 'tmp_failed'];
            }
            @file_put_contents($tmpJson, json_encode($json, JSON_UNESCAPED_UNICODE));
            $args[] = '--data-binary';
            $args[] = escapeshellarg('@' . $tmpJson);
        }
    } elseif ($m !== 'GET') {
        $args[] = '-X';
        $args[] = $m;
    }
    $args[] = escapeshellarg($url);

    $out = [];
    $exit = -1;
    @exec(implode(' ', $args) . ' 2>&1', $out, $exit);
    if ($tmpJson !== '' && is_file($tmpJson)) {
        @unlink($tmpJson);
    }
    $body = is_file($tmpBody) ? (string) @file_get_contents($tmpBody) : '';
    @unlink($tmpBody);
    // --fail: exit 0 ⇒ HTTP 2xx
    $code = ($exit === 0 && $body !== '') ? 200 : 0;
    if ($code <= 0 && $prevCode > 0) {
        $code = $prevCode;
        if ($body === '' && $prevBody !== '') {
            $body = $prevBody;
        }
    }
    return [
        'ok' => $code >= 200 && $code < 300,
        'code' => $code,
        'body' => $body !== '' ? $body : $prevBody,
        'error' => $code > 0 ? '' : ($prevErr !== '' ? $prevErr : ('curl_exe_exit=' . $exit . ' ' . adachat_usub(implode(' ', $out), 0, 80))),
    ];
}

/**
 * PowerShell Invoke-WebRequest 兜底（worker Job Object 内 curl.exe 也失败时）
 *
 * @return array{ok: bool, code: int, body: string, error: string}
 */
function adachat_music_curl_via_powershell(
    string $method,
    string $url,
    ?array $json,
    int $timeout
): array {
    if (stripos(PHP_OS, 'WIN') !== 0 || !adachat_is_exec_available()) {
        return ['ok' => false, 'code' => 0, 'body' => '', 'error' => 'ps_unavailable'];
    }
    $ps = function_exists('adachat_win_powershell_exe')
        ? adachat_win_powershell_exe()
        : ((string) (getenv('SystemRoot') ?: 'C:\\Windows')) . '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    if (!is_file($ps)) {
        return ['ok' => false, 'code' => 0, 'body' => '', 'error' => 'powershell_missing'];
    }

    $tmpJson = '';
    $jsonPath = '';
    if ($json !== null) {
        $tmpJson = tempnam(sys_get_temp_dir(), 'adachat_psjson_');
        if ($tmpJson === false) {
            return ['ok' => false, 'code' => 0, 'body' => '', 'error' => 'tmp_failed'];
        }
        $jsonPath = $tmpJson . '.json';
        @rename($tmpJson, $jsonPath);
        @file_put_contents($jsonPath, json_encode($json, JSON_UNESCAPED_UNICODE));
    }

    $m = strtoupper($method);
    $urlLit = str_replace("'", "''", $url);
    $jsonLit = str_replace("'", "''", $jsonPath);
    $timeoutSec = max(1, $timeout);
    if ($m === 'POST' && $jsonPath !== '') {
        $script =
            "\$body = Get-Content -LiteralPath '" . $jsonLit . "' -Raw -Encoding UTF8\r\n" .
            "\$r = Invoke-WebRequest -Uri '" . $urlLit . "' -Method POST -Body \$body " .
            "-ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec " . $timeoutSec . "\r\n" .
            "Write-Output \$r.Content\r\n";
    } elseif ($m === 'GET') {
        $script =
            "\$r = Invoke-WebRequest -Uri '" . $urlLit . "' -Method GET -UseBasicParsing -TimeoutSec " . $timeoutSec . "\r\n" .
            "Write-Output \$r.Content\r\n";
    } else {
        if ($jsonPath !== '' && is_file($jsonPath)) {
            @unlink($jsonPath);
        }
        return ['ok' => false, 'code' => 0, 'body' => '', 'error' => 'ps_method_unsupported'];
    }

    $cmd = escapeshellarg($ps) . ' -NoProfile -Command ' . escapeshellarg($script);
    $out = [];
    $code = -1;
    @exec($cmd, $out, $code);
    if ($jsonPath !== '' && is_file($jsonPath)) {
        @unlink($jsonPath);
    }
    $body = implode("\n", $out);
    if ($code === 0 && $body !== '') {
        return ['ok' => true, 'code' => 200, 'body' => $body, 'error' => ''];
    }
    return [
        'ok' => false,
        'code' => 0,
        'body' => $body,
        'error' => 'ps_http_exit=' . $code . ' ' . adachat_usub($body, 0, 120),
    ];
}

function adachat_music_acestep_health_via_ps(): bool
{
    if (stripos(PHP_OS, 'WIN') !== 0 || !adachat_is_exec_available()) {
        return false;
    }
    $ps = function_exists('adachat_win_powershell_exe')
        ? adachat_win_powershell_exe()
        : ((string) (getenv('SystemRoot') ?: 'C:\\Windows')) . '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    if (!is_file($ps)) {
        return false;
    }
    $url = adachat_music_acestep_base_url() . '/health';
    // Ada 精简 PATH 下裸 powershell.exe 会找不到；必须用绝对路径
    // Bare powershell.exe is missing under Ada's trimmed PATH — use absolute path
    $script = 'try { $r = Invoke-WebRequest -Uri '
        . "'" . str_replace("'", "''", $url) . "'"
        . ' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { exit 0 } else { exit 1 } } catch { exit 1 }';
    $cmd = escapeshellarg($ps) . ' -NoProfile -Command ' . escapeshellarg($script);
    $out = [];
    $code = 1;
    @exec($cmd, $out, $code);
    return $code === 0;
}

function adachat_music_acestep_tcp_up(int $port = 0): bool
{
    if ($port <= 0) {
        $base = adachat_music_acestep_base_url();
        $port = 8001;
        if (preg_match('#:(\d+)(/|$)#', $base, $m)) {
            $port = (int) $m[1];
        }
    }
    $errno = 0;
    $errstr = '';
    $fp = @fsockopen('127.0.0.1', $port, $errno, $errstr, 2.0);
    if (is_resource($fp)) {
        fclose($fp);
        return true;
    }
    // worker 内偶发 fsockopen 假阴性：用 PowerShell 查 Listen
    if (stripos(PHP_OS, 'WIN') === 0 && adachat_is_exec_available()) {
        $ps = function_exists('adachat_win_powershell_exe')
            ? adachat_win_powershell_exe()
            : ((string) (getenv('SystemRoot') ?: 'C:\\Windows')) . '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
        if (is_file($ps)) {
            $script = 'if (Get-NetTCPConnection -LocalPort ' . (int) $port
                . ' -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }';
            $cmd = escapeshellarg($ps) . ' -NoProfile -Command ' . escapeshellarg($script);
            $out = [];
            $code = 1;
            @exec($cmd, $out, $code);
            if ($code === 0) {
                return true;
            }
        }
    }
    return false;
}

/**
 * @return array{curl_ok:bool,curl_code:int,tcp:bool,health:bool,curl_err?:string}
 */
function adachat_music_acestep_probe(): array
{
    $url = adachat_music_acestep_base_url() . '/health';
    $res = adachat_music_curl('GET', $url, null, 5);
    $tcp = adachat_music_acestep_tcp_up();
    return [
        'curl_ok' => !empty($res['ok']),
        'curl_code' => (int) ($res['code'] ?? 0),
        'curl_err' => (string) ($res['error'] ?? ''),
        'tcp' => $tcp,
        'health' => adachat_music_acestep_health(),
    ];
}

function adachat_music_acestep_health_strict(): bool
{
    $url = adachat_music_acestep_base_url() . '/health';
    $res = adachat_music_curl('GET', $url, null, 5);
    if (empty($res['ok'])) {
        return false;
    }
    $body = (string) ($res['body'] ?? '');
    return $body !== ''
        && stripos($body, '"status"') !== false
        && stripos($body, 'ok') !== false;
}

function adachat_music_acestep_health(): bool
{
    // CLI worker：优先 PowerShell（Ada Job Object 内 PHP curl/fsock 常假阴性）
    // CLI worker: prefer PowerShell (PHP curl/fsock often false-negative under Ada Job Object)
    if (PHP_SAPI === 'cli' && adachat_music_acestep_health_via_ps()) {
        return true;
    }
    $base = adachat_music_acestep_base_url();
    $url = $base . '/health';
    $res = adachat_music_curl('GET', $url, null, 5);
    if (!empty($res['ok'])) {
        return true;
    }
    // CLI/受限环境下 curl 偶发失败：file_get_contents 兜底
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 5,
            'ignore_errors' => true,
            'header' => "Accept: application/json\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $ctx);
    if (is_string($body) && $body !== ''
        && stripos($body, '"status"') !== false
        && stripos($body, 'ok') !== false) {
        return true;
    }
    if (adachat_music_acestep_health_via_ps()) {
        return true;
    }
    return adachat_music_acestep_tcp_up();
}

/**
 * Ada 精简 PATH 常缺 System32（schtasks/wscript 会 “not recognized”）
 * Ada's trimmed PATH often lacks System32 (schtasks/wscript become “not recognized”)
 */
function adachat_music_win_path_bootstrap(): void
{
    if (stripos(PHP_OS, 'WIN') !== 0) {
        return;
    }
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    $sysRoot = (string) (getenv('SystemRoot') ?: 'C:\\Windows');
    $extra = [
        $sysRoot . '\\System32',
        $sysRoot,
        $sysRoot . '\\System32\\Wbem',
        $sysRoot . '\\System32\\WindowsPowerShell\\v1.0',
    ];
    $cur = (string) (getenv('PATH') ?: '');
    $parts = array_values(array_filter(array_merge($extra, $cur !== '' ? explode(';', $cur) : [])));
    $newPath = implode(';', $parts);
    putenv('PATH=' . $newPath);
    $_ENV['PATH'] = $newPath;
    if (function_exists('apache_setenv')) {
        @apache_setenv('PATH', $newPath);
    }
}

function adachat_music_win_schtasks_exe(): string
{
    $sysRoot = (string) (getenv('SystemRoot') ?: 'C:\\Windows');
    $p = $sysRoot . '\\System32\\schtasks.exe';
    return is_file($p) ? $p : 'schtasks.exe';
}

function adachat_music_win_wscript_exe(): string
{
    $sysRoot = (string) (getenv('SystemRoot') ?: 'C:\\Windows');
    $p = $sysRoot . '\\System32\\wscript.exe';
    return is_file($p) ? $p : 'wscript.exe';
}

/**
 * Windows：通过计划任务脱离 Job Object 拉起 spawn_api_for_ada.ps1
 * Ada PHP/worker 的 popen/wscript 子进程常被作业对象连带结束（verified=0、无 ps1 spawn begin）
 * Task Scheduler runs outside the PHP Job Object (fixes verified=0 / missing ps1 logs)
 *
 * @return array{ok: bool, error?: string, via?: string, already?: bool, code?: int, verified?: bool}
 */
function adachat_music_acestep_spawn_via_win_detached(): array
{
    adachat_music_win_path_bootstrap();
    if (!adachat_is_exec_available() || stripos(PHP_OS, 'WIN') !== 0) {
        return ['ok' => false, 'error' => 'windows_exec_required'];
    }
    if (adachat_music_acestep_health()) {
        return ['ok' => true, 'already' => true, 'via' => 'win_detached'];
    }
    if (adachat_music_acestep_tcp_up()) {
        return ['ok' => true, 'already' => true, 'via' => 'tcp_wait'];
    }

    $root = adachat_music_acestep_root();
    $spawnPs1 = $root . DIRECTORY_SEPARATOR . 'spawn_api_for_ada.ps1';
    if (!is_file($spawnPs1)) {
        return ['ok' => false, 'error' => 'spawn_ps1_missing'];
    }
    $ps = adachat_win_powershell_exe();
    if (!is_file($ps)) {
        return ['ok' => false, 'error' => 'powershell_missing'];
    }

    $logDir = $root . DIRECTORY_SEPARATOR . 'logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $spawnLog = $logDir . DIRECTORY_SEPARATOR . 'ada_spawn.log';

    // .cmd 给 schtasks /TR，避免复杂引号
    $cmdFile = $logDir . DIRECTORY_SEPARATOR . '_ada_schtasks_spawn.cmd';
    $cmdBody =
        "@echo off\r\n" .
        "set PATH=%SystemRoot%\\System32;%SystemRoot%;%PATH%\r\n" .
        "\"" . str_replace('"', '', $ps) . "\" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden " .
        "-File \"" . str_replace('"', '', $spawnPs1) . "\" " .
        "-Root \"" . str_replace('"', '', $root) . "\"\r\n";
    if (@file_put_contents($cmdFile, $cmdBody) === false) {
        return ['ok' => false, 'error' => 'cmd_write_failed'];
    }

    // 兼容旧 VBS 路径（人工排查用）
    $vbs = $logDir . DIRECTORY_SEPARATOR . '_ada_spawn_vbs.vbs';
    $vbsLit = static function (string $s): string {
        return str_replace('"', '""', $s);
    };
    $vbsBody =
        "Set sh = CreateObject(\"WScript.Shell\")\r\n" .
        "cmd = Chr(34) & \"" . $vbsLit($ps) . "\" & Chr(34) & _\r\n" .
        "  \" -NoProfile -ExecutionPolicy Bypass -File \" & Chr(34) & \"" . $vbsLit($spawnPs1) . "\" & Chr(34) & _\r\n" .
        "  \" -Root \" & Chr(34) & \"" . $vbsLit($root) . "\" & Chr(34)\r\n" .
        "sh.Run cmd, 0, False\r\n";
    @file_put_contents($vbs, $vbsBody);

    $logOffset = is_file($spawnLog) ? (int) @filesize($spawnLog) : 0;
    @file_put_contents(
        $spawnLog,
        date('c') . " spawning ACE via schtasks\n",
        FILE_APPEND
    );

    $schtasks = adachat_music_win_schtasks_exe();
    $taskName = 'AdaChatAceStepSpawn';
    $out = [];
    $code = -1;
    @exec('"' . str_replace('"', '', $schtasks) . '" /Delete /TN "' . $taskName . '" /F 2>NUL', $out, $code);
    $tr = '"' . str_replace('"', '', $cmdFile) . '"';
    $createCmd =
        '"' . str_replace('"', '', $schtasks) . '" /Create /TN "' . $taskName . '" /TR ' . escapeshellarg($tr)
        . ' /SC ONCE /ST 00:00 /SD 2099/01/01 /F /RL LIMITED';
    $out = [];
    $code = -1;
    @exec($createCmd . ' 2>&1', $out, $code);
    $created = ($code === 0);
    if (!$created) {
        @file_put_contents(
            $spawnLog,
            date('c') . ' schtasks create failed code=' . $code
                . ' out=' . adachat_usub(implode(' ', $out), 0, 200) . "\n",
            FILE_APPEND
        );
    }

    $launched = false;
    if ($created) {
        $out = [];
        $code = -1;
        @exec('"' . str_replace('"', '', $schtasks) . '" /Run /TN "' . $taskName . '" 2>&1', $out, $code);
        $launched = ($code === 0);
        @file_put_contents(
            $spawnLog,
            date('c') . ' schtasks run code=' . $code
                . ' out=' . adachat_usub(implode(' ', $out), 0, 120) . "\n",
            FILE_APPEND
        );
    }

    // 回退1：绝对路径 powershell Start-Process（UseShellExecute 脱离作业对象）
    if (!$launched) {
        $launchPs1 = $logDir . DIRECTORY_SEPARATOR . '_ada_startprocess_spawn.ps1';
        $lit = static fn(string $s): string => str_replace("'", "''", $s);
        $psBody =
            "Start-Process -FilePath '" . $lit($cmdFile) . "' -WindowStyle Hidden\r\n";
        @file_put_contents($launchPs1, $psBody);
        $cmdPs =
            '"' . str_replace('"', '', $ps) . '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'
            . str_replace('"', '', $launchPs1) . '"';
        $out = [];
        $code = -1;
        @exec($cmdPs . ' 2>&1', $out, $code);
        $launched = ($code === 0);
        @file_put_contents(
            $spawnLog,
            date('c') . ' spawn fallback Start-Process ok=' . ($launched ? '1' : '0')
                . ' code=' . $code . "\n",
            FILE_APPEND
        );
    }

    // 回退2：绝对路径 wscript
    if (!$launched) {
        $wscript = adachat_music_win_wscript_exe();
        $q = static fn(string $s): string => str_replace('"', '', $s);
        $cmd = '"' . $q($wscript) . '" //nologo "' . $q($vbs) . '"';
        $handle = @popen($cmd, 'r');
        $launched = is_resource($handle);
        if ($launched) {
            @pclose($handle);
        }
        @file_put_contents(
            $spawnLog,
            date('c') . ' spawn fallback wscript ok=' . ($launched ? '1' : '0') . "\n",
            FILE_APPEND
        );
    }

    $verified = false;
    if ($launched) {
        $deadline = microtime(true) + 20.0;
        while (microtime(true) < $deadline) {
            usleep(400000);
            if (adachat_music_acestep_tcp_up() || adachat_music_acestep_health()) {
                $verified = true;
                break;
            }
            $raw = (string) @file_get_contents($spawnLog);
            $delta = $logOffset > 0 && strlen($raw) > $logOffset
                ? substr($raw, $logOffset)
                : $raw;
            if (
                str_contains($delta, 'ps1 spawn begin')
                || str_contains($delta, 'started pid=')
                || str_contains($delta, 'already healthy')
            ) {
                $verified = true;
                break;
            }
        }
    }

    @file_put_contents(
        $spawnLog,
        date('c') . ' spawn via=schtasks_or_fallback ok=' . ($launched ? '1' : '0')
            . ' verified=' . ($verified ? '1' : '0') . "\n",
        FILE_APPEND
    );

    if ($launched) {
        return [
            'ok' => true,
            'via' => 'schtasks_or_fallback',
            'code' => 0,
            'verified' => $verified,
        ];
    }

    return [
        'ok' => false,
        'via' => 'schtasks_or_fallback',
        'code' => -1,
        'error' => 'spawn_detached_failed',
    ];
}

/**
 * Windows：popen 异步拉起官方 bat（popen 在 worker 内常假成功，仅作兜底）
 *
 * @return array{ok: bool, error?: string, via?: string, bat?: string, already?: bool}
 */
function adachat_music_acestep_spawn_via_official_bat(): array
{
    if (!adachat_is_exec_available() || stripos(PHP_OS, 'WIN') !== 0) {
        return ['ok' => false, 'error' => 'windows_exec_required'];
    }
    if (adachat_music_acestep_health()) {
        return ['ok' => true, 'already' => true, 'via' => 'official_bat'];
    }
    if (adachat_music_acestep_tcp_up()) {
        return ['ok' => true, 'already' => true, 'via' => 'tcp_wait'];
    }

    $bat = adachat_music_acestep_api_bat();
    if (!is_file($bat)) {
        return ['ok' => false, 'error' => 'official_bat_missing'];
    }

    $root = adachat_music_acestep_root();
    $logDir = $root . DIRECTORY_SEPARATOR . 'logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $spawnLog = $logDir . DIRECTORY_SEPARATOR . 'ada_spawn.log';
    @file_put_contents(
        $spawnLog,
        date('c') . ' spawning official bat via popen: ' . $bat . "\n",
        FILE_APPEND
    );

    $q = static fn(string $s): string => str_replace('"', '', $s);
    $cmd = 'cmd.exe /c start "" /B "' . $q($bat) . '"';
    $handle = @popen($cmd, 'r');
    $launched = is_resource($handle);
    if ($launched) {
        @pclose($handle);
    }
    @file_put_contents(
        $spawnLog,
        date('c') . ' official_bat popen ok=' . ($launched ? '1' : '0') . "\n",
        FILE_APPEND
    );

    return [
        'ok' => $launched,
        'via' => 'official_bat',
        'bat' => $bat,
        'error' => $launched ? null : 'official_bat_popen_failed',
    ];
}

/**
 * Windows：用 .cmd + popen(start /B) 直接拉起 python（worker 内常假成功；仅作最后兜底）
 *
 * @return array{ok: bool, error?: string, via?: string, bat?: string}
 */
function adachat_music_acestep_spawn_via_cmd_bat(): array
{
    if (!adachat_is_exec_available() || stripos(PHP_OS, 'WIN') !== 0) {
        return ['ok' => false, 'error' => 'windows_exec_required'];
    }

    $root = adachat_music_acestep_root();
    $logDir = $root . DIRECTORY_SEPARATOR . 'logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $spawnLog = $logDir . DIRECTORY_SEPARATOR . 'ada_spawn.log';

    if (adachat_music_acestep_health()) {
        @file_put_contents($spawnLog, date('c') . " cmd_bat skip: already healthy\n", FILE_APPEND);
        return ['ok' => true, 'already' => true, 'via' => 'cmd_bat'];
    }
    if (adachat_music_acestep_tcp_up()) {
        @file_put_contents($spawnLog, date('c') . " cmd_bat skip: port 8001 open (wait /health)\n", FILE_APPEND);
        return ['ok' => true, 'already' => true, 'via' => 'tcp_wait'];
    }

    $py = $root . DIRECTORY_SEPARATOR . 'venv_xpu' . DIRECTORY_SEPARATOR . 'Scripts' . DIRECTORY_SEPARATOR . 'python.exe';
    $script = $root . DIRECTORY_SEPARATOR . 'acestep' . DIRECTORY_SEPARATOR . 'api_server.py';
    if (!is_file($py) || !is_file($script)) {
        return ['ok' => false, 'error' => 'python_or_script_missing'];
    }

    $errLog = $logDir . DIRECTORY_SEPARATOR . 'api_stderr.txt';
    $outLog = $logDir . DIRECTORY_SEPARATOR . 'api_stdout.txt';
    $bat = $logDir . DIRECTORY_SEPARATOR . '_ada_start_api.cmd';

    $q = static fn(string $s): string => str_replace('"', '', $s);
    $lines = [
        '@echo off',
        'cd /d "' . $q($root) . '"',
        'set PYTHONPATH=' . $q($root),
        'set ACESTEP_NO_INIT=true',
        'set CHECK_UPDATE=false',
        'set PYTORCH_DEVICE=xpu',
        'set SYCL_CACHE_PERSISTENT=1',
        'set TOKENIZERS_PARALLELISM=false',
        'set ACESTEP_USE_FLASH_ATTENTION=false',
        'set ACESTEP_OFFLOAD_TO_CPU=true',
        'set ACESTEP_OFFLOAD_DIT_TO_CPU=true',
        'set ACESTEP_CONFIG_PATH=acestep-v15-base',
        'set PATH=C:\\Windows\\system32;C:\\Windows;' . $q($root) . '\\venv_xpu\\Scripts;'
            . 'C:\\Program Files (x86)\\Intel\\oneAPI\\2026.0\\bin;'
            . 'C:\\Program Files (x86)\\Intel\\oneAPI\\compiler\\latest\\bin;%PATH%',
        'start "" /B "' . $q($py) . '" -u "' . $q($script) . '" --host 127.0.0.1 --port 8001 '
            . '>>"' . $q($outLog) . '" 2>>"' . $q($errLog) . '"',
    ];
    if (@file_put_contents($bat, implode("\r\n", $lines) . "\r\n") === false) {
        return ['ok' => false, 'error' => 'cmd_write_failed'];
    }

    @file_put_contents($spawnLog, date('c') . " spawning _ada_start_api.cmd via popen\n", FILE_APPEND);
    $cmd = 'cmd.exe /c start "" /B "' . $q($bat) . '"';
    $handle = @popen($cmd, 'r');
    $launched = is_resource($handle);
    if ($launched) {
        @pclose($handle);
    }
    @file_put_contents(
        $spawnLog,
        date('c') . ' cmd_bat popen ok=' . ($launched ? '1' : '0') . "\n",
        FILE_APPEND
    );

    return [
        'ok' => $launched,
        'via' => 'cmd_bat',
        'bat' => $bat,
        'error' => $launched ? null : 'cmd_bat_popen_failed',
    ];
}

/**
 * 异步拉起 spawn_api_for_ada.ps1（勿在 worker 内 sync exec powershell）
 *
 * @return array{ok: bool, error?: string, via?: string}
 */
function adachat_music_acestep_spawn_via_official_ps1(): array
{
    if (!adachat_is_exec_available() || stripos(PHP_OS, 'WIN') !== 0) {
        return ['ok' => false, 'error' => 'windows_exec_required'];
    }
    $root = adachat_music_acestep_root();
    $ps1 = $root . DIRECTORY_SEPARATOR . 'spawn_api_for_ada.ps1';
    if (!is_file($ps1)) {
        return ['ok' => false, 'error' => 'spawn_ps1_missing'];
    }
    $ps = function_exists('adachat_win_powershell_exe')
        ? adachat_win_powershell_exe()
        : ((string) (getenv('SystemRoot') ?: 'C:\\Windows')) . '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    if (!is_file($ps)) {
        return ['ok' => false, 'error' => 'powershell_missing'];
    }
    $logDir = $root . DIRECTORY_SEPARATOR . 'logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $spawnLog = $logDir . DIRECTORY_SEPARATOR . 'ada_spawn.log';
    @file_put_contents($spawnLog, date('c') . " spawning spawn_api_for_ada.ps1 (async popen)\n", FILE_APPEND);

    $q = static fn(string $s): string => str_replace('"', '', $s);
    $cmd = 'cmd.exe /c start "" /B "' . $q($ps) . '" -NoProfile -ExecutionPolicy Bypass -File "'
        . $q($ps1) . '" -Root "' . $q($root) . '"';
    $handle = @popen($cmd, 'r');
    $launched = is_resource($handle);
    if ($launched) {
        @pclose($handle);
    }
    @file_put_contents(
        $spawnLog,
        date('c') . ' spawn_api popen ok=' . ($launched ? '1' : '0') . "\n",
        FILE_APPEND
    );

    return [
        'ok' => $launched,
        'via' => 'spawn_api_for_ada.ps1',
        'error' => $launched ? null : 'spawn_ps1_popen_failed',
    ];
}

/**
 * 按可靠性顺序尝试拉起 ACE-Step（popen 异步，勿 sync exec PowerShell）
 *
 * @return array{ok: bool, via?: string, error?: string, already?: bool}
 */
function adachat_music_acestep_spawn_best_effort(): array
{
    if (adachat_music_acestep_health()) {
        return ['ok' => true, 'already' => true, 'via' => 'healthy'];
    }
    if (adachat_music_acestep_tcp_up()) {
        return ['ok' => true, 'already' => true, 'via' => 'tcp_wait'];
    }

    $root = adachat_music_acestep_root();
    $logDir = $root . DIRECTORY_SEPARATOR . 'logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $spawnLog = $logDir . DIRECTORY_SEPARATOR . 'ada_spawn.log';

    $try = static function (callable $fn, string $label) use ($spawnLog): ?array {
        $ret = $fn();
        if (!empty($ret['already'])) {
            @file_put_contents(
                $spawnLog,
                date('c') . " spawn skip ({$label}): " . (string) ($ret['via'] ?? 'already') . "\n",
                FILE_APPEND
            );
            return $ret;
        }
        if (!empty($ret['ok'])) {
            @file_put_contents($spawnLog, date('c') . " spawn launched via {$label}\n", FILE_APPEND);
            return $ret;
        }
        @file_put_contents(
            $spawnLog,
            date('c') . " spawn {$label} failed err=" . (string) ($ret['error'] ?? '') . "\n",
            FILE_APPEND
        );
        return null;
    };

    $detached = $try(
        static fn(): array => adachat_music_acestep_spawn_via_win_detached(),
        'win_detached'
    );
    if ($detached !== null && (!empty($detached['already']) || !empty($detached['ok']))) {
        return $detached;
    }

    $official = $try(
        static fn(): array => adachat_music_acestep_spawn_via_official_bat(),
        'official_bat'
    );
    if ($official !== null && (!empty($official['already']) || !empty($official['ok']))) {
        return $official;
    }

    $ps1 = $try(
        static fn(): array => adachat_music_acestep_spawn_via_official_ps1(),
        'spawn_api_ps1'
    );
    if ($ps1 !== null && (!empty($ps1['already']) || !empty($ps1['ok']))) {
        return $ps1;
    }

    $cmdBat = $try(
        static fn(): array => adachat_music_acestep_spawn_via_cmd_bat(),
        'cmd_bat'
    );
    if ($cmdBat !== null && (!empty($cmdBat['already']) || !empty($cmdBat['ok']))) {
        return $cmdBat;
    }

    return ['ok' => false, 'error' => 'all_spawn_methods_failed'];
}

/**
 * 写临时 PS1：直接 Start-Process 启动 ACE-Step Python（不嵌套 -File 传参）
 * Temp PS1 launches ACE-Step python directly — avoids nested -File ArgumentList breakage
 *
 * @return array{ok:bool, error?:string, tmp?:string, verified?:bool}
 */
function adachat_music_acestep_spawn_python_detached(): array
{
    if (!adachat_is_exec_available() || stripos(PHP_OS, 'WIN') !== 0) {
        return ['ok' => false, 'error' => 'windows_exec_required'];
    }
    $ps = function_exists('adachat_win_powershell_exe')
        ? adachat_win_powershell_exe()
        : ((string) (getenv('SystemRoot') ?: 'C:\\Windows')) . '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    if (!is_file($ps)) {
        return ['ok' => false, 'error' => 'powershell_missing'];
    }

    $root = adachat_music_acestep_root();
    $py = $root . DIRECTORY_SEPARATOR . 'venv_xpu' . DIRECTORY_SEPARATOR . 'Scripts' . DIRECTORY_SEPARATOR . 'python.exe';
    $script = $root . DIRECTORY_SEPARATOR . 'acestep' . DIRECTORY_SEPARATOR . 'api_server.py';
    $logDir = $root . DIRECTORY_SEPARATOR . 'logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    if (!is_file($py) || !is_file($script)) {
        return ['ok' => false, 'error' => 'python_or_script_missing'];
    }

    $lit = static function (string $s): string {
        return str_replace("'", "''", $s);
    };

    // 放到 ACE logs 下，避免 Temp + worker popen 静默丢脚本
    $tmpPs1 = $logDir . DIRECTORY_SEPARATOR . '_ada_launch_once.ps1';
    $spawnLog = $logDir . DIRECTORY_SEPARATOR . 'ada_spawn.log';
    $errLog = $logDir . DIRECTORY_SEPARATOR . 'api_stderr.txt';
    $outLog = $logDir . DIRECTORY_SEPARATOR . 'api_stdout.txt';
    $marker = 'launch_token_' . bin2hex(random_bytes(4));
    $markerNeedle = 'launcher begin marker=' . $marker;

    $body =
        "\$ErrorActionPreference = 'Continue'\r\n" .
        "\$root = '" . $lit($root) . "'\r\n" .
        "\$py = '" . $lit($py) . "'\r\n" .
        "\$script = '" . $lit($script) . "'\r\n" .
        "\$spawnLog = '" . $lit($spawnLog) . "'\r\n" .
        "\$errLog = '" . $lit($errLog) . "'\r\n" .
        "\$outLog = '" . $lit($outLog) . "'\r\n" .
        "function L([string]\$m) { Add-Content -Path \$spawnLog -Value ((Get-Date -Format o) + ' ' + \$m) }\r\n" .
        "L 'launcher begin marker=" . $marker . "'\r\n" .
        "try {\r\n" .
        "  \$r = Invoke-WebRequest -Uri 'http://127.0.0.1:8001/health' -UseBasicParsing -TimeoutSec 3\r\n" .
        "  if (\$r.StatusCode -ge 200 -and \$r.StatusCode -lt 300) { L 'already healthy, skip'; exit 0 }\r\n" .
        "} catch {}\r\n" .
        "\$pathExtra = @('C:\\Windows\\system32','C:\\Windows', (Join-Path \$root 'venv_xpu\\Scripts'),\r\n" .
        "  'C:\\Program Files (x86)\\Intel\\oneAPI\\2026.0\\bin',\r\n" .
        "  'C:\\Program Files (x86)\\Intel\\oneAPI\\compiler\\latest\\bin') | Where-Object { \$_ -and (Test-Path \$_) }\r\n" .
        "\$env:Path = (\$pathExtra + @(\$env:Path)) -join ';'\r\n" .
        "\$env:PYTHONPATH = \$root\r\n" .
        "\$env:ACESTEP_NO_INIT = 'true'\r\n" .
        "\$env:CHECK_UPDATE = 'false'\r\n" .
        "\$env:PYTORCH_DEVICE = 'xpu'\r\n" .
        "\$env:SYCL_CACHE_PERSISTENT = '1'\r\n" .
        "\$env:TOKENIZERS_PARALLELISM = 'false'\r\n" .
        "\$env:ACESTEP_USE_FLASH_ATTENTION = 'false'\r\n" .
        "\$env:ACESTEP_OFFLOAD_TO_CPU = 'true'\r\n" .
        "\$env:ACESTEP_OFFLOAD_DIT_TO_CPU = 'true'\r\n" .
        "\$env:ACESTEP_CONFIG_PATH = 'acestep-v15-base'\r\n" .
        "if (-not \$env:SYSTEMROOT) { \$env:SYSTEMROOT = 'C:\\Windows' }\r\n" .
        "\$argList = @('-u', \$script, '--host', '127.0.0.1', '--port', '8001')\r\n" .
        "try {\r\n" .
        "  \$p = Start-Process -FilePath \$py -ArgumentList \$argList -WorkingDirectory \$root `\r\n" .
        "    -WindowStyle Hidden -PassThru -RedirectStandardOutput \$outLog -RedirectStandardError \$errLog\r\n" .
        "  L ('started pid=' + \$p.Id)\r\n" .
        "} catch {\r\n" .
        "  L ('start failed: ' + \$_.Exception.Message)\r\n" .
        "  exit 1\r\n" .
        "}\r\n" .
        "exit 0\r\n";

    if (@file_put_contents($tmpPs1, $body) === false) {
        return ['ok' => false, 'error' => 'tmp_write_failed'];
    }

    $psQ = '"' . str_replace('"', '', $ps) . '"';
    $fileQ = '"' . str_replace('"', '', $tmpPs1) . '"';
    // worker 内同步执行 PS1（勿用 start /B，嵌套后台会假死不启动）
    $cmd = $psQ . ' -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ' . $fileQ;
    $out = [];
    $code = 0;
    @exec($cmd . ' 2>&1', $out, $code);

    // 校验脚本确实跑起来了（勿用裸 marker 子串，避免误匹配 PHP 日志行 marker=…）
    $verified = false;
    $tail = (string) @file_get_contents($spawnLog);
    if (str_contains($tail, $markerNeedle) || str_contains($tail, 'already healthy, skip')) {
        $verified = true;
    }
    if (!$verified && adachat_music_acestep_health()) {
        $verified = true;
    }

    if (!$verified) {
        // 回退：Start-Process 包一层（仍同步等 wrap 结束）
        $wrap = $logDir . DIRECTORY_SEPARATOR . '_ada_launch_wrap.ps1';
        $wrapBody =
            "Start-Process -FilePath '" . $lit($ps) . "' -ArgumentList @(" .
            "'-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden'," .
            "'-File','" . $lit($tmpPs1) . "'" .
            ") -WindowStyle Hidden -Wait\r\n";
        @file_put_contents($wrap, $wrapBody);
        $wrapCmd = $psQ . ' -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'
            . str_replace('"', '', $wrap) . '"';
        @exec($wrapCmd, $out, $code);
        $tail = (string) @file_get_contents($spawnLog);
        if (str_contains($tail, $markerNeedle) || adachat_music_acestep_health()) {
            $verified = true;
        }
    }

    return [
        'ok' => (bool) $verified,
        'tmp' => $tmpPs1,
        'cmd' => $cmd,
        'verified' => $verified,
        'marker' => $marker,
        'error' => $verified ? null : 'inline_launcher_not_verified',
    ];
}

/**
 * 等待 /health 就绪；必要时拉起 API
 *
 * @param array{allow_spawn?:bool, allow_kill?:bool} $opts
 *        allow_kill=false：禁止「僵死端口 stop+respawn」（网关已预检时避免误杀常驻 ACE）
 */
function adachat_music_ensure_acestep(int $waitMs = 180000, array $opts = []): array
{
    $allowSpawn = !array_key_exists('allow_spawn', $opts) || !empty($opts['allow_spawn']);
    $allowKill = !array_key_exists('allow_kill', $opts) || !empty($opts['allow_kill']);

    $root = adachat_music_acestep_root();
    $logDir = $root . DIRECTORY_SEPARATOR . 'logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $spawnLog = $logDir . DIRECTORY_SEPARATOR . 'ada_spawn.log';

    if (adachat_music_acestep_health()) {
        @file_put_contents($spawnLog, date('c') . " ensure: already healthy\n", FILE_APPEND);
        return ['ok' => true, 'already' => true];
    }

    $portOpen = adachat_music_acestep_tcp_up();
    if ($portOpen) {
        @file_put_contents(
            $spawnLog,
            date('c') . " ensure: port 8001 open, waiting for /health (no duplicate spawn)\n",
            FILE_APPEND
        );
    }

    if (!adachat_is_exec_available()) {
        if ($portOpen) {
            // 端口已开但 health 未就绪：仍轮询，不立刻失败
        } else {
            return [
                'ok' => false,
                'error' => 'ACE-Step API 未运行，且无法自动启动（exec 禁用）',
                'hint' => '请双击 D:\\ACE-Step\\启动ACE-Step-API.bat',
            ];
        }
    }

    $spawnAttempted = false;
    if ($allowSpawn && !$portOpen && adachat_is_exec_available() && stripos(PHP_OS, 'WIN') === 0) {
        $spawnAttempted = true;
        adachat_music_acestep_spawn_best_effort();
    } elseif ($allowSpawn && !$portOpen && adachat_is_exec_available() && stripos(PHP_OS, 'WIN') !== 0) {
        $ps1 = $root . DIRECTORY_SEPARATOR . 'spawn_api_for_ada.ps1';
        @file_put_contents($spawnLog, date('c') . " spawning ps1\n", FILE_APPEND);
        @exec(escapeshellarg($ps1) . ' > /dev/null 2>&1 &');
    }

    $deadline = microtime(true) + ($waitMs / 1000.0);
    $waitStarted = microtime(true);
    $lastSpawnTail = '';
    $fallbackSpawnAt = 0.0;
    $staleCleared = false;
    while (microtime(true) < $deadline) {
        usleep(1000000);
        if (adachat_music_acestep_health()) {
            $waited = (int) round(microtime(true) - $waitStarted);
            @file_put_contents(
                $spawnLog,
                date('c') . " health ok (waited {$waited}s)\n",
                FILE_APPEND
            );
            return ['ok' => true, 'spawned' => !$portOpen, 'waited_sec' => $waited];
        }
        if (!$portOpen && adachat_music_acestep_tcp_up()) {
            $portOpen = true;
            @file_put_contents(
                $spawnLog,
                date('c') . " port 8001 now open, still waiting /health...\n",
                FILE_APPEND
            );
        }
        // 端口被占但 /health 一直失败（僵死/绑端口冲突残留）→ 清端口再拉起
        // 网关已预检时 allow_kill=false，避免误杀仍在加载的常驻 ACE
        if (
            $allowSpawn
            && $allowKill
            && !$staleCleared
            && (microtime(true) - $waitStarted) >= 20.0
            && adachat_music_acestep_tcp_up()
            && !adachat_music_acestep_health()
            && adachat_is_exec_available()
            && stripos(PHP_OS, 'WIN') === 0
        ) {
            $staleCleared = true;
            @file_put_contents(
                $spawnLog,
                date('c') . " ensure: port stale (no /health 20s), stop+respawn\n",
                FILE_APPEND
            );
            adachat_music_acestep_stop();
            $portOpen = false;
            usleep(800000);
            adachat_music_acestep_spawn_via_win_detached();
            $spawnAttempted = true;
        }
        // popen 假成功：45s 仍无端口则再试一次
        if (
            $allowSpawn
            && $spawnAttempted
            && $fallbackSpawnAt <= 0.0
            && (microtime(true) - $waitStarted) >= 45.0
            && !adachat_music_acestep_tcp_up()
            && adachat_is_exec_available()
            && stripos(PHP_OS, 'WIN') === 0
        ) {
            $fallbackSpawnAt = microtime(true);
            @file_put_contents(
                $spawnLog,
                date('c') . " ensure: no port after 45s, retry spawn (win_detached)\n",
                FILE_APPEND
            );
            adachat_music_acestep_spawn_via_win_detached();
        }
        $spawnTail = (string) @file_get_contents($spawnLog);
        if ($spawnTail !== $lastSpawnTail) {
            $lastSpawnTail = $spawnTail;
            // 只匹配日志末尾的退出行，避免历史全文误触发
            if (preg_match('/process exited code=\d+\s*$/m', $spawnTail) === 1) {
                @file_put_contents(
                    $spawnLog,
                    date('c') . " ensure: spawn process exited, will retry if time left\n",
                    FILE_APPEND
                );
                if (
                    $fallbackSpawnAt <= 0.0
                    && adachat_is_exec_available()
                    && stripos(PHP_OS, 'WIN') === 0
                ) {
                    $fallbackSpawnAt = microtime(true);
                    adachat_music_acestep_spawn_best_effort();
                }
            }
        }
    }

    $tail = '';
    foreach (['api_stderr.txt', 'api_server_xpu.log', 'ada_spawn.log'] as $name) {
        $p = $logDir . DIRECTORY_SEPARATOR . $name;
        if (!is_file($p)) {
            continue;
        }
        $raw = (string) @file_get_contents($p);
        $tail .= "\n## {$name}\n" . adachat_usub($raw, max(0, strlen($raw) - 600), 600);
    }
    $probe = adachat_music_acestep_probe();
    @file_put_contents(
        $spawnLog,
        date('c') . ' ensure failed probe curl=' . ($probe['curl_ok'] ? '1' : '0')
            . ' code=' . (int) ($probe['curl_code'] ?? 0)
            . ' tcp=' . ($probe['tcp'] ? '1' : '0') . "\n",
        FILE_APPEND
    );

    $hint = '请双击 D:\\ACE-Step\\启动ACE-Step-API.bat，确认 /health 为 ok 后再发任务；勿在发任务前点「释放显存」';

    return [
        'ok' => false,
        'error' => '已尝试启动 ACE-Step，但 /health 仍不可用',
        'hint' => $hint . ($tail !== '' ? ("\n---\n" . $tail) : ''),
        'probe' => $probe,
    ];
}

/**
 * 网关入队前：等待或拉起 ACE（阻塞，避免 worker 空等）
 * 冷启动实测约 30–50 秒；网页侧已 set_time_limit(120)
 *
 * @return array{ok:bool, already?:bool, waited_sec?:int, error?:string, hint?:string, probe?:array}
 */
function adachat_music_acestep_wait_for_gateway(int $waitMs = 55000): array
{
    // 冷启动：spawn ~10s + uvicorn/XPU ~15s ≈ 25–50s；上限 60s
    $waitMs = max(5000, min(60000, $waitMs));
    $probe = adachat_music_acestep_probe();
    if (adachat_music_acestep_health_strict()) {
        return ['ok' => true, 'already' => true, 'probe' => $probe];
    }

    $root = adachat_music_acestep_root();
    $logDir = $root . DIRECTORY_SEPARATOR . 'logs';
    $spawnLog = $logDir . DIRECTORY_SEPARATOR . 'ada_spawn.log';
    @file_put_contents(
        $spawnLog,
        date('c') . ' gateway: wait_for_gateway begin probe='
            . json_encode($probe, JSON_UNESCAPED_UNICODE) . "\n",
        FILE_APPEND
    );

    $spawned = false;
    if (adachat_is_exec_available() && stripos(PHP_OS, 'WIN') === 0) {
        $spawnRet = adachat_music_acestep_spawn_via_win_detached();
        $spawned = !empty($spawnRet['ok']) || !empty($spawnRet['verified']);
    } else {
        $spawnRet = adachat_music_acestep_spawn_best_effort();
        $spawned = !empty($spawnRet['ok']);
    }

    $deadline = microtime(true) + max(5.0, $waitMs / 1000.0);
    $started = microtime(true);
    $extended = false;
    while (microtime(true) < $deadline) {
        usleep(500000);
        if (adachat_music_acestep_health_strict()) {
            $waited = (int) round(microtime(true) - $started);
            $probe = adachat_music_acestep_probe();
            @file_put_contents(
                $spawnLog,
                date('c') . " gateway: ready after {$waited}s\n",
                FILE_APPEND
            );
            return ['ok' => true, 'waited_sec' => $waited, 'probe' => $probe, 'spawned' => $spawned];
        }
        // 已拉起且端口已开：再多等一轮（冷启动常卡在 health 前几秒）
        if (
            !$extended
            && $spawned
            && adachat_music_acestep_tcp_up()
            && (microtime(true) - $started) >= ($waitMs / 1000.0) - 2.0
        ) {
            $extended = true;
            $deadline = microtime(true) + 25.0;
            @file_put_contents(
                $spawnLog,
                date('c') . " gateway: port up, extend wait +25s for /health\n",
                FILE_APPEND
            );
        }
    }

    $probe = adachat_music_acestep_probe();
    $hint = $spawned
        ? '已尝试自动启动 ACE-Step，但 /health 仍未就绪。请再发一次任务，或双击 D:\\ACE-Step\\启动ACE-Step-API.bat 后重试；勿点「释放显存」'
        : '请先双击 D:\\ACE-Step\\启动ACE-Step-API.bat，等 15–20 秒确认 http://127.0.0.1:8001/health 为 ok，再发 Cover（勿在发送前点「释放显存」）';
    return [
        'ok' => false,
        'error' => 'ACE-Step API 未就绪',
        'hint' => $hint,
        'probe' => $probe,
        'spawned' => $spawned,
    ];
}

/**
 * 按需加载/切换 DiT（POST /v1/init），使 release_task 的 model=base 真正生效
 * @return array{ok:bool, error?:string, loaded?:string}
 */
function adachat_music_acestep_ensure_dit_model(string $model): array
{
    $model = trim($model);
    if ($model === '') {
        return ['ok' => true, 'loaded' => ''];
    }
    if (!adachat_music_acestep_dit_ready($model)) {
        return [
            'ok' => false,
            'error' => "模型未下载：$model（请下载到 checkpoints/$model）",
        ];
    }
    $base = adachat_music_acestep_base_url();
    $res = adachat_music_curl('POST', $base . '/v1/init', [
        'model' => $model,
        'init_llm' => false,
    ], 300);
    if (!empty($res['ok'])) {
        $data = json_decode((string) ($res['body'] ?? ''), true);
        $loaded = '';
        if (is_array($data)) {
            $loaded = (string) ($data['data']['loaded_model'] ?? $data['loaded_model'] ?? $model);
        }
        return ['ok' => true, 'loaded' => $loaded !== '' ? $loaded : $model];
    }
    // 部分部署无 /v1 前缀
    $res2 = adachat_music_curl('POST', $base . '/init', [
        'model' => $model,
        'init_llm' => false,
    ], 300);
    if (!empty($res2['ok'])) {
        return ['ok' => true, 'loaded' => $model];
    }
    return [
        'ok' => false,
        'error' => '无法加载模型 ' . $model . '：HTTP '
            . (int) ($res['code'] ?? 0) . '/' . (int) ($res2['code'] ?? 0)
            . ' ' . adachat_usub((string) (($res['body'] ?: $res2['body']) ?: ($res['error'] ?? '')), 0, 300),
    ];
}

/**
 * @return array{ok:bool, task_id?:string, error?:string, raw?:string}
 */
function adachat_music_acestep_release_task(array $payload): array
{
    $base = adachat_music_acestep_base_url();
    $last = ['ok' => false, 'code' => 0, 'body' => '', 'error' => ''];
    // Job Object / 冷启动偶发连不上：重试几次
    for ($i = 0; $i < 5; $i++) {
        if ($i > 0) {
            usleep(800000 * $i);
        }
        $res = adachat_music_curl('POST', $base . '/release_task', $payload, 60);
        $last = $res;
        if (!empty($res['ok'])) {
            break;
        }
        $code = (int) ($res['code'] ?? 0);
        $err = (string) ($res['error'] ?? '');
        // 仅对连不上重试；业务 4xx 不重试
        if ($code > 0 && $code < 500) {
            break;
        }
        if ($code === 0 && (stripos($err, 'connect') !== false || stripos($err, 'Failed') !== false)) {
            continue;
        }
        if ($code === 0 || $code >= 500) {
            continue;
        }
        break;
    }
    $res = $last;
    if (!$res['ok']) {
        return [
            'ok' => false,
            'error' => 'release_task HTTP ' . $res['code'] . ': ' . adachat_usub($res['body'] ?: $res['error'], 0, 400),
            'raw' => $res['body'],
        ];
    }
    $data = json_decode($res['body'], true);
    if (!is_array($data)) {
        return ['ok' => false, 'error' => 'release_task 响应非 JSON', 'raw' => $res['body']];
    }
    // wrap_response: { data: { task_id, status }, code }
    $inner = is_array($data['data'] ?? null) ? $data['data'] : $data;
    $taskId = (string) ($inner['task_id'] ?? $data['task_id'] ?? '');
    if ($taskId === '') {
        return [
            'ok' => false,
            'error' => '未获得 task_id: ' . adachat_usub($res['body'], 0, 300),
            'raw' => $res['body'],
        ];
    }
    return ['ok' => true, 'task_id' => $taskId];
}

/**
 * @return array{ok:bool, status?:int, progress?:float, file?:string, error?:string, stage?:string}
 */
function adachat_music_acestep_query(string $taskId): array
{
    $base = adachat_music_acestep_base_url();
    $res = adachat_music_curl('POST', $base . '/query_result', [
        'task_id_list' => [$taskId],
    ], 60);
    if (!$res['ok']) {
        return [
            'ok' => false,
            'error' => 'query_result HTTP ' . $res['code'] . ': ' . adachat_usub($res['body'] ?: $res['error'], 0, 300),
        ];
    }
    $data = json_decode($res['body'], true);
    if (!is_array($data)) {
        return ['ok' => false, 'error' => 'query_result 非 JSON'];
    }
    $list = $data['data'] ?? null;
    if (!is_array($list)) {
        $list = is_array($data) && isset($data[0]) ? $data : [];
    }
    $item = is_array($list[0] ?? null) ? $list[0] : null;
    if (!$item) {
        return ['ok' => false, 'error' => 'query_result 空结果'];
    }
    $status = (int) ($item['status'] ?? -1);
    $file = '';
    $progress = 0.0;
    $stage = '';
    $err = '';
    $resultRaw = $item['result'] ?? null;
    $decoded = null;
    if (is_string($resultRaw) && $resultRaw !== '') {
        $decoded = json_decode($resultRaw, true);
    } elseif (is_array($resultRaw)) {
        $decoded = $resultRaw;
    }
    if (is_array($decoded) && isset($decoded[0]) && is_array($decoded[0])) {
        $row = $decoded[0];
        $file = (string) ($row['file'] ?? '');
        $progress = (float) ($row['progress'] ?? 0);
        $stage = (string) ($row['stage'] ?? '');
        $err = (string) ($row['error'] ?? '');
        if ($file === '' && !empty($row['path'])) {
            $file = (string) $row['path'];
        }
        // 嵌套 result 内 status=1 也视为完成
        if ($status !== 1 && (int) ($row['status'] ?? -1) === 1 && $file !== '') {
            $status = 1;
        }
    } else {
        $progress = (float) ($item['progress'] ?? 0);
        $stage = (string) ($item['stage'] ?? '');
        $err = (string) ($item['error'] ?? '');
    }
    $progressText = trim((string) ($item['progress_text'] ?? ''));
    // 避免把整段 LLM/CFG 日志塞进聊天气泡
    if ($progressText !== '' && (strlen($progressText) > 160 || str_contains($progressText, '<|im_start|>'))) {
        $lines = preg_split('/\R/u', $progressText) ?: [];
        $brief = '';
        foreach (array_reverse($lines) as $line) {
            $line = trim((string) $line);
            if ($line === '' || str_starts_with($line, '<|')) {
                continue;
            }
            $brief = $line;
            break;
        }
        $progressText = $brief !== '' ? adachat_usub($brief, 0, 140) : '';
    }
    return [
        'ok' => true,
        'status' => $status,
        'progress' => $progress,
        'file' => $file,
        'stage' => $stage,
        'error' => $err,
        'progress_text' => $progressText,
    ];
}

/**
 * 解析 ACE-Step 返回的 file 字段为本地路径或可下载 URL
 * Parse ACE-Step file field into local path and/or download URL
 *
 * @return array{local?:string, url?:string}
 */
function adachat_music_acestep_resolve_audio_ref(string $remotePath): array
{
    $remotePath = trim($remotePath);
    if ($remotePath === '') {
        return [];
    }
    $base = adachat_music_acestep_base_url();

    // 已是 /v1/audio?path=...
    if (str_starts_with($remotePath, '/v1/audio')) {
        $full = $base . $remotePath;
        $q = parse_url($remotePath, PHP_URL_QUERY);
        $params = [];
        if (is_string($q) && $q !== '') {
            parse_str($q, $params);
        }
        $local = isset($params['path']) ? rawurldecode((string) $params['path']) : '';
        $out = ['url' => $full];
        if ($local !== '') {
            $out['local'] = $local;
        }
        return $out;
    }

    // http(s) 完整 URL
    if (preg_match('#^https?://#i', $remotePath)) {
        $out = ['url' => $remotePath];
        $q = parse_url($remotePath, PHP_URL_QUERY);
        $params = [];
        if (is_string($q) && $q !== '') {
            parse_str($q, $params);
        }
        if (!empty($params['path'])) {
            $out['local'] = rawurldecode((string) $params['path']);
        }
        return $out;
    }

    // 普通本地路径
    return ['local' => $remotePath, 'url' => $base . '/v1/audio?path=' . rawurlencode($remotePath)];
}

/**
 * 下载 ACE-Step 音频到本地输出目录
 * @return array{ok:bool, local_file?:string, error?:string}
 */
function adachat_music_acestep_download(string $remotePath, string $destFile): array
{
    $ref = adachat_music_acestep_resolve_audio_ref($remotePath);
    $local = (string) ($ref['local'] ?? '');
    // 本机同盘：直接复制（避免 /v1/audio 鉴权 403 / 路径二次编码）
    if ($local !== '' && is_file($local)) {
        if (!@copy($local, $destFile)) {
            return ['ok' => false, 'error' => '复制音频失败'];
        }
        return ['ok' => true, 'local_file' => $destFile];
    }
    if ($remotePath !== '' && is_file($remotePath)) {
        if (!@copy($remotePath, $destFile)) {
            return ['ok' => false, 'error' => '复制音频失败'];
        }
        return ['ok' => true, 'local_file' => $destFile];
    }

    $url = (string) ($ref['url'] ?? '');
    if ($url === '') {
        return ['ok' => false, 'error' => '无有效音频路径'];
    }
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 300);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 30);
    curl_setopt($ch, CURLOPT_PROXY, '');
    if (defined('CURL_IPRESOLVE_V4')) {
        curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
    }
    $bin = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($code < 200 || $code >= 300 || !is_string($bin) || $bin === '') {
        return [
            'ok' => false,
            'error' => '下载音频失败 HTTP ' . $code . ($err !== '' ? ': ' . $err : '')
                . ($local !== '' ? ' (local=' . $local . ')' : ''),
        ];
    }
    if (@file_put_contents($destFile, $bin) === false) {
        return ['ok' => false, 'error' => '写入音频失败'];
    }
    return ['ok' => true, 'local_file' => $destFile];
}

/**
 * 将 ACE stage 收敛为可读中文阶段（加载 / 排队 / 生成 / 解码）
 * Normalize ACE stage into clear Chinese phase labels
 */
function adachat_music_normalize_stage_hint(string $stage, int $duration = 60): string
{
    $raw = trim($stage);
    if ($raw === '') {
        return '';
    }
    $low = strtolower($raw);
    if ($low === 'queued' || str_contains($low, 'queue')) {
        return '排队等待（'
            . max(10, $duration)
            . ' 秒曲；若久停请释放显存并重启 ACE API）…';
    }
    if (
        str_contains($low, 'load')
        || str_contains($low, 'init')
        || str_contains($raw, '加载')
        || (str_contains($raw, '模型') && !str_contains($raw, '生成'))
    ) {
        return '正在加载模型…';
    }
    if (
        str_contains($low, 'decod')
        || str_contains($low, 'vae')
        || str_contains($raw, '解码')
    ) {
        return '正在解码音频…';
    }
    if (
        str_contains($low, 'generat')
        || str_contains($low, 'phase')
        || str_contains($low, 'diffusion')
        || str_contains($low, 'cot')
        || str_contains($low, 'infer')
        || str_contains($raw, '生成')
    ) {
        return '正在生成旋律…';
    }
    if (strlen($raw) > 120 || str_contains($raw, '<|im_start|>')) {
        return '正在生成…';
    }
    return $raw;
}

/**
 * 处理单个音乐 job：ensure API → release → poll → download
 * @return array{ok:bool, local_file?:string, error?:string}
 */
function adachat_music_process_acestep_job(array $job): array
{
    adachat_music_ensure_dirs();
    $extra = is_array($job['extra'] ?? null) ? $job['extra'] : [];
    $taskType = (string) ($extra['task_type'] ?? 'text2music');
    $srcDur = isset($extra['src_duration_sec']) ? (float) $extra['src_duration_sec'] : 0.0;
    $ensureWaitMs = 240000;
    if (($taskType === 'cover' || $taskType === 'cover-nofsq') && $srcDur >= 120) {
        $ensureWaitMs = 300000;
    }
    // 网关已预检：无条件信任（worker 在 Job Object 内 PHP 常连不上 :8001，属假阴性）
    // Gateway already verified — trust unconditionally (worker PHP often cannot reach :8001)
    $gatewayReady = !empty($job['acestep_ready']);
    $rootLog = adachat_music_acestep_root() . DIRECTORY_SEPARATOR . 'logs' . DIRECTORY_SEPARATOR . 'ada_spawn.log';
    adachat_music_win_path_bootstrap();
    if ($gatewayReady) {
        $ensure = ['ok' => true, 'already' => true, 'via' => 'gateway_ready_trust'];
        @file_put_contents(
            $rootLog,
            date('c') . " worker: trust gateway acestep_ready (no PHP re-probe)\n",
            FILE_APPEND
        );
    } else {
        // 无预检时：优先 PowerShell 探测，避免 PHP curl/fsock 假阴性
        $alive = adachat_music_acestep_health()
            || adachat_music_acestep_health_via_ps()
            || adachat_music_acestep_tcp_up();
        if ($alive) {
            $ensure = ['ok' => true, 'already' => true, 'via' => 'health_or_ps'];
        } else {
            adachat_music_acestep_spawn_via_win_detached();
            $deadline = microtime(true) + 120.0;
            $ensure = ['ok' => false];
            while (microtime(true) < $deadline) {
                usleep(1000000);
                if (
                    adachat_music_acestep_health()
                    || adachat_music_acestep_health_via_ps()
                    || adachat_music_acestep_tcp_up()
                ) {
                    $ensure = ['ok' => true, 'spawned' => true];
                    break;
                }
            }
            if (empty($ensure['ok'])) {
                $ensure = [
                    'ok' => false,
                    'error' => '已尝试启动 ACE-Step，但 /health 仍不可用',
                    'hint' => '请双击 D:\\ACE-Step\\启动ACE-Step-API.bat，确认 /health 为 ok 后再发任务；勿在发任务前点「释放显存」',
                ];
            }
        }
    }
    if (empty($ensure['ok'])) {
        return [
            'ok' => false,
            'error' => (string) ($ensure['error'] ?? 'acestep_unavailable'),
            'hint' => (string) ($ensure['hint'] ?? ''),
        ];
    }

    $prompt = trim((string) ($job['prompt'] ?? ''));
    $lyrics = trim((string) ($job['extra']['lyrics'] ?? ''));
    $duration = (float) ($job['extra']['duration'] ?? 30);
    if ($duration < 10) {
        $duration = 10;
    }
    if ($duration > 300) {
        $duration = 300;
    }
    $model = trim((string) ($job['model'] ?? ''));
    if ($model === '' || stripos($model, 'ace') === false) {
        $model = adachat_music_default_dit_model();
    }
    // 去掉 provider:: 前缀
    if (strpos($model, '::') !== false) {
        $parts = explode('::', $model);
        $model = (string) end($parts);
    }
    if (!adachat_music_acestep_dit_ready($model)) {
        $fallback = adachat_music_default_dit_model();
        if ($fallback !== $model && adachat_music_acestep_dit_ready($fallback)) {
            $model = $fallback;
        } elseif (adachat_music_acestep_dit_ready('acestep-v15-turbo')) {
            $model = 'acestep-v15-turbo';
        } else {
            return [
                'ok' => false,
                'error' => "找不到可用 DiT 权重（需要 checkpoints/$model）",
                'hint' => '请下载 acestep-v15-base 或 acestep-v15-turbo',
            ];
        }
    }

    $job['hint'] = "正在加载模型 $model …";
    $job['progress'] = 8;
    adachat_music_save_job($job);
    $init = adachat_music_acestep_ensure_dit_model($model);
    if (empty($init['ok'])) {
        // init 失败时仍尝试 release_task（部分版本按 model 字段懒加载）
        // Init failed: still try release_task (some builds lazy-load via model=)
        $initErr = trim((string) ($init['error'] ?? 'init_failed'));
        $job['hint'] = '模型 init 未确认，继续提交任务…（' . adachat_usub($initErr, 0, 120) . '）';
        adachat_music_save_job($job);
    }

    // XPU 上 thinking + 默认 batch_size=2 极慢且易卡在 Phase 2；强制单曲、关闭 thinking
    // On XPU, thinking + default batch_size=2 is very slow and can stall in Phase 2
    $isTurbo = stripos($model, 'turbo') !== false;
    $steps = (int) ($job['extra']['inference_steps'] ?? ($isTurbo ? 8 : 55));
    if ($isTurbo) {
        // turbo: 官方推荐 1–20，默认 8；过高易失真且更慢
        $steps = max(4, min(20, $steps > 0 ? $steps : 8));
    } else {
        // base: 国风 BGM 建议约 40–70，避免默认过高
        $steps = max(16, min(100, $steps > 0 ? $steps : 55));
    }
    $cfg = (float) ($job['extra']['guidance_scale'] ?? 3.0);
    if ($cfg < 1.0) {
        $cfg = 3.0;
    }
    if ($cfg > 12.0) {
        $cfg = 12.0;
    }
    $audioFormat = strtolower(trim((string) ($job['extra']['audio_format'] ?? 'wav')));
    if (!in_array($audioFormat, ['wav', 'mp3', 'flac', 'opus', 'aac', 'wav32'], true)) {
        $audioFormat = 'wav';
    }

    // 节奏/结构强化 / Conditioning prep
    $taskType = strtolower(trim((string) ($job['extra']['task_type'] ?? 'text2music')));
    if (!in_array($taskType, ['text2music', 'cover', 'cover-nofsq'], true)) {
        $taskType = 'text2music';
    }
    $jobExtra = is_array($job['extra'] ?? null) ? $job['extra'] : [];
    if ($taskType === 'cover' || $taskType === 'cover-nofsq') {
        $prepared = adachat_music_prepare_ace_cover_caption($prompt, $jobExtra);
    } else {
        $prepared = adachat_music_prepare_ace_conditioning($prompt, $lyrics, $jobExtra);
    }
    $prompt = (string) $prepared['caption'];
    $lyrics = (string) $prepared['lyrics'];
    $bpm = (int) $prepared['bpm'];
    $timeSig = (string) $prepared['time_signature'];
    $instrumental = !empty($prepared['instrumental']);

    $inferMethod = strtolower(trim((string) ($job['extra']['infer_method'] ?? 'ode')));
    if (!in_array($inferMethod, ['ode', 'sde'], true)) {
        $inferMethod = 'ode';
    }
    $lmTemp = isset($job['extra']['lm_temperature']) && is_numeric($job['extra']['lm_temperature'])
        ? (float) $job['extra']['lm_temperature']
        : ($instrumental ? 0.85 : 0.7);
    $lmTemp = max(0.5, min(1.5, $lmTemp));

    $coverStrength = (float) ($job['extra']['audio_cover_strength'] ?? 0.78);
    $coverStrength = max(0.1, min(1.0, $coverStrength));

    $payload = [
        'prompt' => $prompt,
        'lyrics' => $lyrics,
        'thinking' => false,
        'batch_size' => 1,
        'task_type' => $taskType,
        'model' => $model,
        'inference_steps' => $steps,
        'guidance_scale' => $cfg,
        'audio_format' => $audioFormat,
        'use_random_seed' => true,
        'bpm' => $bpm,
        'time_signature' => $timeSig,
        'key_scale' => '',
        'infer_method' => $inferMethod,
        'lm_temperature' => $lmTemp,
        'constrained_decoding' => true,
        'use_cot_caption' => false,
        'use_cot_language' => false,
        'vocal_language' => preg_match('/[\x{4e00}-\x{9fff}]/u', $prompt . $lyrics) ? 'zh' : 'en',
    ];
    if ($taskType === 'cover' || $taskType === 'cover-nofsq') {
        $srcPath = (string) ($job['extra']['src_audio_path'] ?? '');
        if ($srcPath === '' || !is_file($srcPath)) {
            return ['ok' => false, 'error' => 'Cover 源音频不存在或已过期，请重新上传'];
        }
        $payload['src_audio_path'] = $srcPath;
        $payload['audio_cover_strength'] = $coverStrength;
        // Cover 时长由源音频决定，不传 audio_duration
    } else {
        $payload['audio_duration'] = $duration;
    }
    $job['prompt'] = $prompt;
    $job['model'] = $model;
    $job['extra']['lyrics'] = $lyrics;
    $job['extra']['inference_steps'] = $steps;
    $job['extra']['guidance_scale'] = $cfg;
    $job['extra']['audio_format'] = $audioFormat;
    $job['extra']['bpm'] = $bpm;
    $job['extra']['time_signature'] = $timeSig;
    $job['extra']['infer_method'] = $inferMethod;
    $job['extra']['lm_temperature'] = $lmTemp;
    $job['extra']['task_type'] = $taskType;
    if ($taskType === 'cover' || $taskType === 'cover-nofsq') {
        $job['extra']['audio_cover_strength'] = $coverStrength;
        $srcDur = isset($job['extra']['src_duration_sec'])
            ? (float) $job['extra']['src_duration_sec']
            : null;
        if ($srcPath !== '' && ($srcDur === null || $srcDur <= 0)) {
            $probed = adachat_music_probe_audio_duration($srcPath);
            if ($probed !== null && $probed > 0) {
                $srcDur = $probed;
                $job['extra']['src_duration_sec'] = $srcDur;
            }
        }
        $etaMin = adachat_music_cover_eta_minutes($srcDur);
        $durLabel = $srcDur !== null && $srcDur > 0
            ? (string) (int) round($srcDur) . ' 秒'
            : '源曲';
        $job['hint'] = 'Cover 按' . $durLabel . '生成中，预计约 ' . $etaMin
            . ' 分钟（强度 ' . $coverStrength . ' · BPM ' . $bpm . '）…';
    } else {
        $job['hint'] = '提交生成（BPM ' . $bpm . ' · 4/4 · ' . strtoupper($inferMethod)
            . ' · LM ' . $lmTemp
            . ($instrumental ? ' · 纯器乐' : ' · 人声')
            . '）…';
    }
    adachat_music_save_job($job);

    $jobId = (string) ($job['id'] ?? '');
    $released = adachat_music_acestep_release_task($payload);
    if (empty($released['ok'])) {
        $err = (string) ($released['error'] ?? 'release_failed');
        if (stripos($err, 'Kernel is incompatible') !== false) {
            return [
                'ok' => false,
                'error' => $err,
                'hint' => 'Intel XPU 与 Base/CFG 的注意力内核不兼容：请重启 ACE-Step API（已强制 eager attention），或临时改用 Turbo',
            ];
        }
        return ['ok' => false, 'error' => $err];
    }
    $taskId = (string) $released['task_id'];
    $job['acestep_task_id'] = $taskId;
    $job['status'] = 'processing';
    $job['progress'] = 15;
    adachat_music_save_job($job);

    // Cover 长曲：按源音频时长放宽超时（上限约 50 分钟）
    $deadlineBase = ($taskType === 'cover' || $taskType === 'cover-nofsq') ? 3000 : 2400;
    $deadline = time() + $deadlineBase + (int) max(0, $duration) * 15;
    $lastFile = '';
    $stallSince = time();
    $lastStageKey = '';
    $queuedOnlySec = 0;
    $decodeStallLimit = 1200; // Decoding audio 在 XPU 上可较久；勿过早判死
    $queuedStallLimit = 360; // 纯 queued 且进度为 0：多半是上一曲卡死/API 半死
    while (time() < $deadline) {
        sleep(3);
        $q = adachat_music_acestep_query($taskId);
        if (empty($q['ok'])) {
            continue;
        }
        $st = (int) ($q['status'] ?? -1);
        $prog = (float) ($q['progress'] ?? 0);
        if ($prog > 0) {
            $job['progress'] = max(15, min(95, (int) round($prog * 100)));
        }
        // 勿在 progress=0 时虚增百分比（会伪装成“快完成了”）
        // Do not fake-increment when ACE reports 0 progress
        $stageRaw = !empty($q['stage']) ? trim((string) $q['stage']) : '';
        if ($stageRaw !== '') {
            $job['hint'] = adachat_music_normalize_stage_hint($stageRaw, (int) $duration);
            if (strcasecmp($stageRaw, 'queued') === 0) {
                $queuedOnlySec += 3;
            } else {
                $queuedOnlySec = 0;
            }
        } elseif (!empty($q['progress_text'])) {
            $job['hint'] = adachat_music_normalize_stage_hint(
                (string) $q['progress_text'],
                (int) $duration
            );
            $queuedOnlySec = 0;
        }
        $stageKey = strtolower($stageRaw) . '|' . $st . '|' . sprintf('%.4f', $prog);
        if ($stageKey !== $lastStageKey) {
            $lastStageKey = $stageKey;
            $stallSince = time();
        } elseif ($st === 0) {
            $stallFor = time() - $stallSince;
            $isDecode = stripos((string) ($job['hint'] ?? ''), 'Decod') !== false
                || stripos((string) ($job['hint'] ?? ''), '解码') !== false;
            $limit = $isDecode ? $decodeStallLimit : (($queuedOnlySec >= 30 && $prog <= 0) ? $queuedStallLimit : 900);
            if ($stallFor > $limit) {
                $hintRestart = '请重启 ACE-Step API 后重试；60 秒曲需开启 DiT 卸载（ACESTEP_OFFLOAD_DIT_TO_CPU=true）';
                if ($queuedOnlySec >= 30 && $prog <= 0) {
                    return [
                        'ok' => false,
                        'error' => 'ACE-Step 长时间停在排队且无进度，可能上一任务卡在 VAE 解码；' . $hintRestart,
                    ];
                }
                return [
                    'ok' => false,
                    'error' => 'ACE-Step 进度超过 '
                        . (int) round($limit / 60)
                        . ' 分钟无变化，可能已卡住；'
                        . $hintRestart,
                ];
            }
        }
        adachat_music_save_job($job);

        if ($st === 1) {
            $lastFile = (string) ($q['file'] ?? '');
            break;
        }
        if ($st === 2) {
            $err = (string) ($q['error'] ?? 'ACE-Step 生成失败');
            if (stripos($err, 'Kernel is incompatible') !== false) {
                return [
                    'ok' => false,
                    'error' => $err !== '' ? $err : 'ACE-Step status=failed',
                    'hint' => '若仍见 Kernel incompatible：确认已重启 ACE-Step（APG 已对 XPU 做 CPU norm 回退）；或临时改用 Turbo',
                ];
            }
            return ['ok' => false, 'error' => $err !== '' ? $err : 'ACE-Step status=failed'];
        }
    }

    if ($lastFile === '') {
        return [
            'ok' => false,
            'error' => 'ACE-Step 超时未返回音频（任务可能仍在跑；可重启 API 后用更短提示/60 秒重试）',
        ];
    }

    $ext = strtolower(pathinfo($lastFile, PATHINFO_EXTENSION));
    if ($ext === '' || strlen($ext) > 5) {
        $ext = 'wav';
    }
    $dest = adachat_music_output_dir() . DIRECTORY_SEPARATOR
        . preg_replace('/[^a-zA-Z0-9_\-]/', '', $jobId) . '.' . $ext;
    $dl = adachat_music_acestep_download($lastFile, $dest);
    if (empty($dl['ok'])) {
        return ['ok' => false, 'error' => (string) ($dl['error'] ?? 'download_failed')];
    }
    return ['ok' => true, 'local_file' => (string) $dl['local_file']];
}

/**
 * 停止 ACE-Step API（释显存）。无 unload 接口时只能结束进程。
 * Stop ACE-Step API to free VRAM (no unload endpoint — kill process).
 *
 * @return array{ok:bool, killed?:int, method?:string, error?:string}
 */
function adachat_music_acestep_stop(): array
{
    if (!adachat_is_exec_available()) {
        return ['ok' => false, 'error' => 'exec_disabled'];
    }
    $killed = 0;
    $base = adachat_music_acestep_base_url();
    $port = 8001;
    if (preg_match('#:(\d+)(/|$)#', $base, $m)) {
        $port = (int) $m[1];
    }

    if (stripos(PHP_OS, 'WIN') === 0) {
        $ps = function_exists('adachat_win_powershell_exe')
            ? adachat_win_powershell_exe()
            : ((string) (getenv('SystemRoot') ?: 'C:\\Windows')) . '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
        if (is_file($ps)) {
            $tmp = tempnam(sys_get_temp_dir(), 'adachat_ace_');
            if ($tmp !== false) {
                $tmpPs1 = $tmp . '.ps1';
                @rename($tmp, $tmpPs1);
                $psBody =
                    "\$names = @('python.exe','pythonw.exe')\r\n" .
                    "foreach (\$name in \$names) {\r\n" .
                    "  Get-CimInstance Win32_Process -Filter (\"name='\$name'\") -ErrorAction SilentlyContinue | ForEach-Object {\r\n" .
                    "    \$c = [string]\$_.CommandLine\r\n" .
                    "    if (\$c -and (\$c -like '*acestep*api_server.py*' -or \$c -like '*\\\\acestep\\\\api_server.py*' -or \$c -like '*/acestep/api_server.py*')) {\r\n" .
                    "      Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue\r\n" .
                    "      Write-Output \$_.ProcessId\r\n" .
                    "    }\r\n" .
                    "  }\r\n" .
                    "}\r\n" .
                    "Get-NetTCPConnection -LocalPort " . (int) $port . " -State Listen -ErrorAction SilentlyContinue | ForEach-Object {\r\n" .
                    "  \$procId = [int]\$_.OwningProcess\r\n" .
                    "  if (\$procId -gt 0) {\r\n" .
                    "    Stop-Process -Id \$procId -Force -ErrorAction SilentlyContinue\r\n" .
                    "    Write-Output \$procId\r\n" .
                    "  }\r\n" .
                    "}\r\n" .
                    "Remove-Item -LiteralPath '" .
                    str_replace("'", "''", $tmpPs1) .
                    "' -Force -ErrorAction SilentlyContinue\r\n";
                if (@file_put_contents($tmpPs1, $psBody) !== false) {
                    $fileArg = '"' . str_replace('"', '', $tmpPs1) . '"';
                    $cmd =
                        '"' .
                        str_replace('"', '', $ps) .
                        '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ' .
                        $fileArg;
                    $out = [];
                    $code = -1;
                    @exec($cmd . ' 2>&1', $out, $code);
                    foreach ($out as $line) {
                        if (preg_match('/^\s*(\d+)\s*$/', (string) $line, $mm)) {
                            $killed++;
                        }
                    }
                }
            }
        }
        // 兜底：netstat 杀端口
        $lines = [];
        @exec('netstat -ano | findstr ":' . (int) $port . '" | findstr LISTENING', $lines);
        foreach ($lines as $line) {
            if (preg_match('/\s+(\d+)\s*$/', (string) $line, $mm)) {
                $pid = (int) $mm[1];
                if ($pid > 0) {
                    @exec('taskkill /F /T /PID ' . $pid . ' 2>NUL');
                    $killed++;
                }
            }
        }
        if (function_exists('usleep')) {
            @usleep(500000);
        }
        return ['ok' => true, 'killed' => $killed, 'method' => 'ps1+port'];
    }

    @exec('pkill -f acestep/api_server.py 2>/dev/null');
    @exec('fuser -k ' . (int) $port . '/tcp 2>/dev/null');
    return ['ok' => true, 'killed' => $killed, 'method' => 'pkill'];
}

