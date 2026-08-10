<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="<?= htmlspecialchars($csrfToken) ?>">
    <title data-i18n="app_title">Ada Chat 开发版 V1.0 · 多模态</title>
    <link rel="icon" type="image/png" href="assets/adachat-logo.png?v=<?= @filemtime($workspaceRoot . '/assets/adachat-logo.png') ?: time() ?>">
    <link rel="apple-touch-icon" href="assets/adachat-logo.png?v=<?= @filemtime($workspaceRoot . '/assets/adachat-logo.png') ?: time() ?>">
        
    <!-- 动态加载所有插件的 CSS 文件 -->
    <?php foreach ($pluginAssets['css'] as $cssFile): ?>
    <link rel="stylesheet" href="<?= htmlspecialchars($cssFile) ?>">
    <?php endforeach; ?>
    
    <!-- 预加载插件样式，但由JS动态加载，避免404 -->
