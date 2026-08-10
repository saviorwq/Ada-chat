<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * api.php 后端入口：插件后端路由内联于此；Ada Chat 自带的 CYOA 存储见 cyoa_storage.php
 * api.php backend: plugin routing stays here; CYOA (Ada Chat) storage in cyoa_storage.php
 */

require_once __DIR__ . '/cyoa_storage.php';

/**
 * Resolve plugin backend by requested id without hardcoded version mapping.
 * Returns [canonicalPluginId, pluginDir, backendFile] or [null, null, null].
 *
 * @return array{0:?string,1:?string,2:?string}
 */
function adachat_api_resolve_plugin_backend(string $requestedId, string $workspaceRoot): array
{
    $safeId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $requestedId);
    if (!is_string($safeId) || $safeId === '') {
        return [null, null, null];
    }

    $pluginsRoot = rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'plugins' . DIRECTORY_SEPARATOR;

    $byFolder = static function (string $folderName) use ($pluginsRoot): array {
        $dir = $pluginsRoot . $folderName . DIRECTORY_SEPARATOR;
        $backend = $dir . 'backend.php';
        if (!is_dir($dir) || !file_exists($backend)) {
            return [null, null, null];
        }

        $manifestPath = $dir . 'manifest.json';
        $canonicalId = $folderName;
        if (file_exists($manifestPath)) {
            $manifest = json_decode((string) file_get_contents($manifestPath), true);
            $manifestId = is_array($manifest) ? trim((string) ($manifest['id'] ?? '')) : '';
            if ($manifestId !== '') {
                $canonicalId = $manifestId;
            }
        }
        return [$canonicalId, $dir, $backend];
    };

    // 1) Direct folder route: api.php?plugin=<folder>&action=...
    [$canonicalId, $pluginDir, $backendFile] = $byFolder($safeId);
    if ($pluginDir !== null) {
        return [$canonicalId, $pluginDir, $backendFile];
    }

    // 2) Manifest id route: api.php?plugin=<manifest.id>&action=...
    $entries = @scandir($pluginsRoot);
    if (is_array($entries)) {
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $dir = $pluginsRoot . $entry . DIRECTORY_SEPARATOR;
            if (!is_dir($dir)) {
                continue;
            }
            $backend = $dir . 'backend.php';
            if (!file_exists($backend)) {
                continue;
            }

            $manifestPath = $dir . 'manifest.json';
            if (!file_exists($manifestPath)) {
                continue;
            }
            $manifest = json_decode((string) file_get_contents($manifestPath), true);
            if (!is_array($manifest)) {
                continue;
            }
            $manifestId = trim((string) ($manifest['id'] ?? ''));
            if ($manifestId !== '' && $manifestId === $safeId) {
                return [$manifestId, $dir, $backend];
            }
        }
    }

    // 3) Version suffix fallback: foo_v221 / foo_2_2_1 -> foo
    $normalizedId = preg_replace('/(?:[_\-]?v?\d+(?:[._\-]\d+)*)$/i', '', $safeId);
    $normalizedId = trim((string) $normalizedId);
    if ($normalizedId !== '' && $normalizedId !== $safeId) {
        return $byFolder($normalizedId);
    }

    return [null, null, null];
}

/**
 * Handle plugin backend routing if `plugin` param present.
 * Exits on handled.
 */
function adachat_api_maybe_route_plugin_backend(string $workspaceRoot): void
{
    $pluginId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_GET['plugin'] ?? '');
    if (!is_string($pluginId) || $pluginId === '') {
        return;
    }

    [$resolvedPluginId, $pluginDir, $backendFile] = adachat_api_resolve_plugin_backend($pluginId, $workspaceRoot);
    if ($pluginDir === null || $backendFile === null) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => '插件后端不存在'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!defined('PLUGIN_REQUESTED_ID')) {
        define('PLUGIN_REQUESTED_ID', $pluginId);
    }
    if (!defined('PLUGIN_ID')) {
        define('PLUGIN_ID', $resolvedPluginId ?: $pluginId);
    }
    if (!defined('PLUGIN_DIR')) {
        define('PLUGIN_DIR', $pluginDir);
    }
    if (!defined('PLUGIN_ACTION')) {
        define('PLUGIN_ACTION', $_GET['action'] ?? '');
    }

    require $backendFile;
    exit;
}
