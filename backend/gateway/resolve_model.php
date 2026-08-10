<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 模型与 Provider 解析（模块化）
 * Resolve modelParam (providerId::modelName) + provider config (module)
 *
 * 依赖：
 * - backend/providers.php: adachat_find_provider()
 */

require_once __DIR__ . '/../providers.php';

/**
 * @return array{ok: bool, status?: int, error?: string, providerId?: string, modelName?: string, provider?: array, apiKey?: string}
 */
function adachat_gateway_resolve_model_and_provider(string $modelParam): array
{
    if ($modelParam === '') {
        return ['ok' => false, 'status' => 400, 'error' => 'Missing model'];
    }
    if (strpos($modelParam, '::') === false) {
        return ['ok' => false, 'status' => 400, 'error' => 'Invalid model format, expected providerId::modelName'];
    }

    list($providerId, $modelName) = explode('::', $modelParam, 2);
    $providerId = (string) $providerId;
    $modelName = (string) $modelName;

    $provider = adachat_find_provider($providerId);
    if (!$provider) {
        return ['ok' => false, 'status' => 404, 'error' => 'Provider not found'];
    }

    $apiKey = trim((string) ($provider['api_key'] ?? ''));

    return [
        'ok' => true,
        'providerId' => $providerId,
        'modelName' => $modelName,
        'provider' => $provider,
        'apiKey' => $apiKey,
    ];
}

