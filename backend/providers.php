<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 供应商配置读写（模块化）
 * Provider storage helpers (module)
 *
 * 依赖：ai_config.php 中的 AI_DATA_DIR / AI_PROVIDERS_FILE 常量
 */

/**
 * @return array<int, array<string, mixed>>
 */
function adachat_get_providers(): array
{
    if (!file_exists(AI_PROVIDERS_FILE)) {
        @file_put_contents(AI_PROVIDERS_FILE, json_encode([], JSON_UNESCAPED_UNICODE), LOCK_EX);
    }
    if (!file_exists(AI_PROVIDERS_FILE)) {
        return [];
    }
    $fp = @fopen(AI_PROVIDERS_FILE, 'r');
    if (!$fp) {
        return [];
    }
    $raw = '';
    if (@flock($fp, LOCK_SH)) {
        $raw = (string) stream_get_contents($fp);
        @flock($fp, LOCK_UN);
    } else {
        $raw = (string) stream_get_contents($fp);
    }
    @fclose($fp);

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * @param array<int, array<string, mixed>> $providers
 */
function adachat_save_providers(array $providers): void
{
    if (!is_dir(AI_DATA_DIR)) {
        @mkdir(AI_DATA_DIR, 0755, true);
    }
    $payload = json_encode($providers, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        $payload = '[]';
    }
    @file_put_contents(AI_PROVIDERS_FILE, $payload, LOCK_EX);
}

/**
 * @return array<string, mixed>|null
 */
function adachat_find_provider(string $id): ?array
{
    $providers = adachat_get_providers();
    foreach ($providers as $p) {
        if (is_array($p) && isset($p['id']) && (string) $p['id'] === $id) {
            return $p;
        }
    }
    return null;
}

/**
 * 主界面下拉用：仅返回必要字段，避免巨大 all_models 导致 JSON 编码失败
 * @return array<int, array<string, mixed>>
 */
function adachat_providers_public_list(): array
{
    $out = [];
    foreach (adachat_get_providers() as $p) {
        if (!is_array($p) || empty($p['id'])) {
            continue;
        }
        $out[] = [
            'id' => (string) $p['id'],
            'name' => (string) ($p['name'] ?? $p['id']),
            'deployment_type' => (string) ($p['deployment_type'] ?? 'cloud'),
            'inference_engine' => (string) ($p['inference_engine'] ?? ''),
        ];
    }
    return $out;
}

