<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * 精简版 Vite bundle 门禁（vchat.php 薄入口复用）
 * Guard: require built Vite slim (index.html) bundle for vchat.php
 */

/**
 * 若无 dist/index 入口或 JS 文件不存在，则 503 并 exit；否则返回 manifest 解析的 hrefs
 * Emits 503 + exit when bundle missing; otherwise returns dist-relative hrefs array
 *
 * @return array{js: string|null, css: string[]}
 */
function adachat_bootstrap_require_vite_slim_bundle_or_503(string $workspaceRoot): array
{
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'vite' . DIRECTORY_SEPARATOR . 'require_dist.php';
    require_once rtrim($workspaceRoot, "/\\") . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'vite' . DIRECTORY_SEPARATOR . 'manifest.php';

    $hrefs = adachat_vite_dist_hrefs();
    $viteSlimJsPath = (is_array($hrefs) && !empty($hrefs['js']) && is_string($hrefs['js']))
        ? ($workspaceRoot . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $hrefs['js']))
        : null;
    $hasSlimBundle = $viteSlimJsPath !== null && is_file($viteSlimJsPath);
    if (!$hasSlimBundle) {
        adachat_vite_emit_missing_bundle_503([
            'title' => '前端未构建',
            'heading' => '尚未构建前端资源（Vite）',
            'bodyHtml' => '<p>请在本项目根目录执行：</p>'
                . '<pre>npm install\nnpm run build</pre>'
                . '<p>构建完成后刷新本页。开发调试可使用 <code>npm run dev</code>（默认端口 5173）并代理到本机 PHP。</p>',
            'backHref' => 'AI.php',
            'backText' => '← 返回完整版',
        ]);
    }

    /** @var array{js: string|null, css: string[]} $hrefs */
    return $hrefs;
}
