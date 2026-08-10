<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Vite 构建产物门禁：当 dist/ 不存在或缺少入口 bundle 时返回 503 HTML 指引页
 * Vite build output guard: emits 503 HTML when dist bundle missing
 */

/**
 * @param array{title:string, heading:string, bodyHtml:string, backHref?:string, backText?:string} $opts
 */
function adachat_vite_emit_missing_bundle_503(array $opts): void
{
    http_response_code(503);
    header('Content-Type: text/html; charset=UTF-8');

    $title = (string) ($opts['title'] ?? '前端未构建');
    $heading = (string) ($opts['heading'] ?? '尚未构建前端资源（Vite）');
    $bodyHtml = (string) ($opts['bodyHtml'] ?? '');
    $backHref = isset($opts['backHref']) ? (string) $opts['backHref'] : '';
    $backText = isset($opts['backText']) ? (string) $opts['backText'] : '← 返回';

    echo '<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        . '<title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title>'
        . '<style>'
        . 'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
        . 'background:linear-gradient(135deg,#0f172a,#1e293b);font-family:system-ui,sans-serif;color:#e2e8f0;}'
        . '.box{max-width:560px;padding:1.5rem 1.75rem;background:rgba(30,41,59,.85);'
        . 'border:1px solid rgba(148,163,184,.15);border-radius:12px;}'
        . 'code,pre{background:#0b1220;padding:10px;border-radius:6px;font-size:13px;display:block;'
        . 'overflow:auto;white-space:pre-wrap;}'
        . 'a{color:#38bdf8;}'
        . '</style></head><body>';

    echo '<div class="box"><h2 style="margin-top:0;">'
        . htmlspecialchars($heading, ENT_QUOTES, 'UTF-8')
        . '</h2>';
    echo $bodyHtml;
    if ($backHref !== '') {
        echo '<p><a href="' . htmlspecialchars($backHref, ENT_QUOTES, 'UTF-8') . '">'
            . htmlspecialchars($backText, ENT_QUOTES, 'UTF-8')
            . '</a></p>';
    }
    echo '</div></body></html>';
    exit;
}

