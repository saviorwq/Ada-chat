<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Action 路径运行时（模块化）
 * Action runtime helpers (module)
 *
 * 依赖：
 * - backend/utils.php: adachat_usub()
 */

require_once __DIR__ . '/../utils.php';
require_once __DIR__ . '/../json.php';

function adachat_actions_bootstrap_json_fatal(): void
{
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=UTF-8');
    }

    // Ensure fatal errors in action path still return JSON.
    @ob_start();
    register_shutdown_function(function () {
        $err = error_get_last();
        if (!$err) return;
        $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
        if (!in_array($err['type'] ?? 0, $fatalTypes, true)) return;

        $buf = '';
        if (ob_get_level() > 0) {
            $buf = (string) ob_get_contents();
            @ob_clean();
        }
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=UTF-8');
        }
        echo adachat_json_encode_unicode([
            'success' => false,
            'error' => 'php_fatal',
            'message' => (string) ($err['message'] ?? ''),
            'file' => basename((string) ($err['file'] ?? '')),
            'line' => (int) ($err['line'] ?? 0),
            'buffer' => adachat_usub(trim($buf), 0, 600),
        ]);
    });
}

