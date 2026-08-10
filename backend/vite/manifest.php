<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Vite 生产构建清单读取（dist/.vite/manifest.json）
 * Vite production manifest reader for PHP pages (AI.php, vchat.php, etc.)
 */

/**
 * @return array<string, mixed>|null
 */
function adachat_vite_manifest(): ?array
{
    $path = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'dist' . DIRECTORY_SEPARATOR . '.vite' . DIRECTORY_SEPARATOR . 'manifest.json';
    if (!is_file($path)) {
        return null;
    }
    $raw = @file_get_contents($path);
    if ($raw === false) {
        return null;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

/**
 * @param string $entry Manifest 键名，如 index.html、full.html
 * @return array{js: string|null, css: string[]}|null
 */
function adachat_vite_entry_assets(string $entry): ?array
{
    $m = adachat_vite_manifest();
    if ($m === null || !isset($m[$entry]) || !is_array($m[$entry])) {
        return null;
    }
    $e = $m[$entry];
    $js = isset($e['file']) && is_string($e['file']) ? $e['file'] : null;
    $css = isset($e['css']) && is_array($e['css']) ? $e['css'] : [];
    return ['js' => $js, 'css' => $css];
}

/**
 * index.html（精简版）入口
 *
 * @return array{js: string|null, css: string[]}|null
 */
function adachat_vite_index_assets(): ?array
{
    return adachat_vite_entry_assets('index.html');
}

/**
 * 供 PHP 页面生成 <link>/<script> 的相对路径（相对站点根目录下的 *.php）
 * Relative paths from site root → dist/*
 *
 * @return array{js: string|null, css: string[]}|null
 */
function adachat_vite_dist_hrefs(): ?array
{
    $a = adachat_vite_index_assets();
    if ($a === null) {
        return null;
    }
    $out = ['js' => null, 'css' => []];
    if (!empty($a['js']) && is_string($a['js'])) {
        $out['js'] = 'dist/' . $a['js'];
    }
    foreach ($a['css'] as $c) {
        if (is_string($c) && $c !== '') {
            $out['css'][] = 'dist/' . $c;
        }
    }
    return $out;
}

/**
 * full.html（完整版 ESM 占位入口）
 *
 * @return array{js: string|null, css: string[]}|null
 */
function adachat_vite_full_dist_hrefs(): ?array
{
    $a = adachat_vite_entry_assets('full.html');
    if ($a === null) {
        return null;
    }
    $out = ['js' => null, 'css' => []];
    if (!empty($a['js']) && is_string($a['js'])) {
        $out['js'] = 'dist/' . $a['js'];
    }
    foreach ($a['css'] as $c) {
        if (is_string($c) && $c !== '') {
            $out['css'][] = 'dist/' . $c;
        }
    }
    return $out;
}
