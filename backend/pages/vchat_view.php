<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * Vite 精简版页面视图（由 vchat.php require）
 * Slim chat view (included from vchat.php)
 *
 * 期望调用方已设置 / Expected from caller:
 * $csrfToken, $hrefs, $hasBundle
 */

$root = dirname(__DIR__, 2);
$logoV = @filemtime($root . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'adachat-logo.png') ?: time();
?>
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="<?= htmlspecialchars((string) $csrfToken, ENT_QUOTES, 'UTF-8') ?>">
    <title>Ada Chat — Vite 精简版</title>
    <link rel="icon" type="image/png" href="assets/adachat-logo.png?v=<?= (int) $logoV ?>">
    <?php if (!empty($hasBundle) && is_array($hrefs)): ?>
        <?php foreach (($hrefs['css'] ?? []) as $cssHref): ?>
    <link rel="stylesheet" href="<?= htmlspecialchars((string) $cssHref, ENT_QUOTES, 'UTF-8') ?>">
        <?php endforeach; ?>
    <?php endif; ?>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="<?= htmlspecialchars((string) ($hrefs['js'] ?? ''), ENT_QUOTES, 'UTF-8') ?>"></script>
</body>
</html>
