<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 流式执行（模块化）
 * Stream gateway execution (module)
 */

/**
 * @param resource $ch curl handle
 * @return array{clientDisconnected: bool, streamHttpCode: int, isError: bool, errorBuffer: string, fullContent: string, curlError: string|null}
 */
function adachat_gateway_exec_stream($ch): array
{
    $streamHttpCode = 0;
    $errorBuffer = '';
    $isError = false;
    $fullContent = '';
    $clientDisconnected = false;

    curl_setopt($ch, CURLOPT_HEADER, false);
    // 预填充阶段尚无字节时也要检测浏览器断开，否则上游 GPU 会空转到超时
    // Detect client abort during prompt prefill (no WRITEFUNCTION yet)
    curl_setopt($ch, CURLOPT_NOPROGRESS, false);
    curl_setopt(
        $ch,
        CURLOPT_XFERINFOFUNCTION,
        static function ($ch, $dlTotal, $dlNow, $ulTotal, $ulNow) use (&$clientDisconnected) {
            if (connection_aborted()) {
                $clientDisconnected = true;
                return 1; // non-zero → abort transfer
            }
            return 0;
        }
    );
    curl_setopt(
        $ch,
        CURLOPT_WRITEFUNCTION,
        function ($ch, $data) use (&$streamHttpCode, &$errorBuffer, &$isError, &$fullContent, &$clientDisconnected) {
            if (connection_aborted()) {
                $clientDisconnected = true;
                return 0;
            }

            if ($streamHttpCode === 0) {
                $streamHttpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
                if ($streamHttpCode >= 400) {
                    $isError = true;
                }
            }

            if ($isError) {
                $errorBuffer .= $data;
            } else {
                echo $data;
                if (ob_get_level()) {
                    ob_flush();
                }
                flush();

                foreach (explode("\n", (string) $data) as $line) {
                    $line = trim((string) $line);
                    if (strpos($line, 'data: ') === 0) {
                        $json = substr($line, 6);
                        if ($json !== '[DONE]') {
                            $parsed = json_decode($json, true);
                            $delta = $parsed['choices'][0]['delta']['content'] ?? '';
                            if ($delta !== '') {
                                $fullContent .= (string) $delta;
                            }
                        }
                    }
                }
            }
            return strlen((string) $data);
        }
    );

    curl_exec($ch);

    $curlError = null;
    if (!$clientDisconnected && curl_errno($ch)) {
        $curlError = (string) curl_error($ch);
    }

    return [
        'clientDisconnected' => $clientDisconnected,
        'streamHttpCode' => $streamHttpCode,
        'isError' => $isError,
        'errorBuffer' => $errorBuffer,
        'fullContent' => $fullContent,
        'curlError' => $curlError,
    ];
}

