<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 网关执行与输出（模块化）
 * Gateway execution + response output (module)
 *
 * 依赖：
 * - backend/gateway/stream_exec.php: adachat_gateway_exec_stream()
 * - backend/gateway/non_stream_exec.php: adachat_gateway_exec_non_stream()
 * - backend/cost/kv_cache_pipeline.php: adachat_cost_store_kv_cache()
 */

require_once __DIR__ . '/stream_exec.php';
require_once __DIR__ . '/non_stream_exec.php';
require_once __DIR__ . '/../cost/kv_cache_pipeline.php';
require_once __DIR__ . '/../json.php';

function adachat_gateway_exec_and_respond(
    $ch,
    bool $stream,
    string $task,
    $originalMessages,
    string $modelName
): void {
    $shouldCacheResponse = ($task === 'chat');

    ignore_user_abort(false);

    if ($stream) {
        header('Content-Type: text/event-stream');
        header('X-Accel-Buffering: no');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        while (ob_get_level()) ob_end_clean();

        $streamRet = adachat_gateway_exec_stream($ch);
        $clientDisconnected = (bool) ($streamRet['clientDisconnected'] ?? false);
        $streamHttpCode = (int) ($streamRet['streamHttpCode'] ?? 0);
        $isError = (bool) ($streamRet['isError'] ?? false);
        $errorBuffer = (string) ($streamRet['errorBuffer'] ?? '');
        $fullContent = (string) ($streamRet['fullContent'] ?? '');
        $curlError = $streamRet['curlError'] ?? null;

        if ($clientDisconnected) {
            $shouldCacheResponse = false;
        } elseif (is_string($curlError) && $curlError !== '') {
            $sseError = adachat_json_encode_unicode(['choices' => [['delta' => ['content' => "\n[连接错误] " . $curlError]]]]);
            echo "data: {$sseError}\n\ndata: [DONE]\n\n";
        } elseif ($isError) {
            $errMsg = "上游API错误 (HTTP {$streamHttpCode})";
            $errData = json_decode($errorBuffer, true);
            if ($errData) {
                if (isset($errData['error']['message'])) {
                    $errMsg = $errData['error']['message'];
                } elseif (isset($errData['error']) && is_string($errData['error'])) {
                    $errMsg = $errData['error'];
                }
            }
            $sseError = adachat_json_encode_unicode(['choices' => [['delta' => ['content' => "[错误] {$errMsg}"]]]]);
            echo "data: {$sseError}\n\ndata: [DONE]\n\n";
            $shouldCacheResponse = false;
        }
        if (ob_get_level()) ob_flush();
        flush();

        if ($shouldCacheResponse && $fullContent !== '') {
            adachat_cost_store_kv_cache($originalMessages, (string) $modelName, (string) $fullContent);
        }
        return;
    }

    $ret = adachat_gateway_exec_non_stream($ch);
    if (!$ret['ok']) {
        adachat_json_headers();
        echo adachat_json_encode_unicode(['error' => (string) ($ret['error'] ?? 'curl_error')]);
        return;
    }

    http_response_code((int) $ret['httpCode']);
    adachat_json_headers();
    $response = (string) $ret['response'];
    echo $response;

    if ($shouldCacheResponse && (int) $ret['httpCode'] === 200) {
        $respData = json_decode($response, true);
        $respContent = $respData['choices'][0]['message']['content'] ?? '';
        if ($respContent !== '') {
            adachat_cost_store_kv_cache($originalMessages, (string) $modelName, (string) $respContent);
        }
    }
}

