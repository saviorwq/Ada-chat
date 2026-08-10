<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 网关入口（模块化）
 * Gateway entry (module)
 */

require_once __DIR__ . '/../http.php';
require_once __DIR__ . '/../json.php';
require_once __DIR__ . '/input.php';
require_once __DIR__ . '/resolve_model.php';
require_once __DIR__ . '/dispatch_task.php';
require_once __DIR__ . '/client.php';
require_once __DIR__ . '/runtime_budget.php';
require_once __DIR__ . '/response_exec.php';
require_once __DIR__ . '/../local_inference/gateway.php';
require_once __DIR__ . '/../local_inference/paths.php';
require_once __DIR__ . '/../video/gateway.php';
require_once __DIR__ . '/router.php';

function adachat_gateway_entry(): void
{
    if (!is_dir(AI_DATA_DIR)) {
        mkdir(AI_DATA_DIR, 0755, true);
    }

    $parsed = adachat_gateway_parse_input();
    $task = (string) ($parsed['task'] ?? 'chat');
    $modelParam = $parsed['modelParam'];

    $resolved = adachat_gateway_resolve_model_and_provider((string) $modelParam);
    if (empty($resolved['ok'])) {
        http_response_code((int) ($resolved['status'] ?? 400));
        adachat_json_headers();
        echo adachat_json_encode_unicode(['error' => (string) ($resolved['error'] ?? 'Invalid model')]);
        return;
    }

    $provider = $resolved['provider'] ?? null;
    $route = adachat_gateway_route_inference((string) $task, is_array($provider) ? $provider : null);

    adachat_gateway_execute_routed($route, $parsed, $resolved, (string) $modelParam);
}

