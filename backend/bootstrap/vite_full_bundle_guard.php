<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 完整版 Vite bundle 门禁（AI.php 薄入口复用）
 * Guard: require built Vite full bundle for AI.php
 */

/**
 * 若无 dist/full 入口或 JS 文件不存在，则 503 并 exit；否则返回 manifest 解析结果
 * Emits 503 + exit when bundle missing; otherwise returns manifest hrefs array
 *
 * @return array{js: string|null, css: string[]}
 */
function adachat_bootstrap_require_vite_full_bundle_or_503(string $workspaceRoot): array
{
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'vite' . DIRECTORY_SEPARATOR . 'require_dist.php';
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'vite' . DIRECTORY_SEPARATOR . 'manifest.php';

    $viteFull = adachat_vite_full_dist_hrefs();
    $viteFullJsPath = (is_array($viteFull) && !empty($viteFull['js']) && is_string($viteFull['js']))
        ? ($workspaceRoot . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $viteFull['js']))
        : null;
    $hasViteFullBundle = $viteFullJsPath !== null && is_file($viteFullJsPath);
    if (!$hasViteFullBundle) {
        adachat_vite_emit_missing_bundle_503([
            'title' => '前端未构建',
            'heading' => '尚未构建前端资源（Vite）',
            'bodyHtml' => '<p>完整版界面仅通过 <code>dist/</code> 加载。请在<strong>项目根目录</strong>执行：</p>'
                . '<pre>npm install\nnpm run build</pre>'
                . '<p>构建完成后刷新本页。开发调试可使用 <code>npm run dev</code> 并打开 <code>full.html</code>（默认端口 5173）。</p>',
            'backHref' => 'login.php',
            'backText' => '← 返回',
        ]);
    }

    /** @var array{js: string|null, css: string[]} $viteFull */
    return $viteFull;
}
