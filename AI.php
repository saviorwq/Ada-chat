<?php
/**
 * AI 智能助手前端 - 需要登录访问
 * 验证逻辑：Session 鉴权
 * 
 * 修改记录:
 * - 优化 Session 配置以支持子目录部署
 * - 增强安全性 (Headers, Input Sanitization)
 * - 清理内联样式，减少与 style.css 的潜在冲突
 * - 新增插件动态加载机制：自动扫描 plugins/ 目录加载插件 JS 和 CSS
 */

// 安全头设置
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: SAMEORIGIN");
header("X-XSS-Protection: 1; mode=block");

// Session 配置优化
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_lifetime', 0); // 浏览器关闭即失效
ini_set('session.gc_maxlifetime', 86400);
ini_set('session.cookie_path', '/'); // 确保整个域有效，如需限制子目录可改为 dirname($_SERVER['PHP_SELF'])
ini_set('session.cookie_samesite', 'Lax');
session_name('ADASESSID');

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// 严格的登录验证
if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true) {
    http_response_code(403);
    echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>禁止访问</title><style>body{background:#000;color:#0f7;font-family:monospace;padding:2rem;text-align:center;}a{color:#0f7;text-decoration:none;border:1px solid #0f7;padding:10px 20px;border-radius:4px;}a:hover{background:#0f7;color:#000;}</style></head><body><h1>🔒 需要先登录</h1><p>您没有权限访问此页面。</p><br><a href="login.php">返回登录</a></body></html>';
    exit;
}

// CSRF Token
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
$csrfToken = $_SESSION['csrf_token'];

// cookie_secure for HTTPS
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    ini_set('session.cookie_secure', 1);
}

// 获取当前版本号用于缓存清除
$ver = time();

// ========== 插件动态加载模块 ==========
/**
 * 扫描 plugins 目录，加载所有插件的 JS 和 CSS
 * 插件目录结构要求：
 * plugins/
 *   ├── plugin1/
 *   │   ├── plugin1.js
 *   │   ├── plugin1.css (可选)
 *   │   └── manifest.json (可选，用于元数据)
 *   └── plugin2/
 *       ├── plugin2.js
 *       └── ...
 */
function loadPlugins() {
    $pluginsDir = __DIR__ . '/plugins';
    $pluginAssets = [
        'css' => [],
        'js' => []
    ];
    
    if (!is_dir($pluginsDir)) {
        if (!mkdir($pluginsDir, 0755, true)) {
            error_log("无法创建插件目录: {$pluginsDir}");
            return $pluginAssets;
        }
    }
    
    $pluginFolders = scandir($pluginsDir);
    
    foreach ($pluginFolders as $folder) {
        if ($folder === '.' || $folder === '..') continue;
        
        $pluginPath = $pluginsDir . '/' . $folder;
        if (!is_dir($pluginPath)) continue;
        
        $manifestFile = $pluginPath . '/manifest.json';
        
        if (file_exists($manifestFile)) {
            $manifest = json_decode(file_get_contents($manifestFile), true);
            if ($manifest && !empty($manifest['files'])) {
                $entry = $manifest['entry'] ?? null;
                foreach ($manifest['files'] as $file) {
                    if ($file === $entry) continue;
                    $fullPath = $pluginPath . '/' . $file;
                    if (!file_exists($fullPath)) continue;
                    $relativePath = 'plugins/' . $folder . '/' . $file;
                    $ver = '?v=' . filemtime($fullPath);
                    if (preg_match('/\.js$/', $file)) {
                        $pluginAssets['js'][] = $relativePath . $ver;
                    } elseif (preg_match('/\.css$/', $file)) {
                        $pluginAssets['css'][] = $relativePath . $ver;
                    }
                }
                if ($entry) {
                    $entryPath = $pluginPath . '/' . $entry;
                    if (file_exists($entryPath)) {
                        $pluginAssets['js'][] = 'plugins/' . $folder . '/' . $entry . '?v=' . filemtime($entryPath);
                    }
                }
                continue;
            }
        }
        
        $jsFiles = glob($pluginPath . '/*.js');
        if (!empty($jsFiles)) {
            foreach ($jsFiles as $jsFile) {
                $relativePath = 'plugins/' . $folder . '/' . basename($jsFile);
                $pluginAssets['js'][] = $relativePath . '?v=' . filemtime($jsFile);
            }
        }
        
        $cssFiles = glob($pluginPath . '/*.css');
        if (!empty($cssFiles)) {
            foreach ($cssFiles as $cssFile) {
                $relativePath = 'plugins/' . $folder . '/' . basename($cssFile);
                $pluginAssets['css'][] = $relativePath . '?v=' . filemtime($cssFile);
            }
        }
    }
    
    return $pluginAssets;
}

// 获取所有插件资源
$pluginAssets = loadPlugins();
?>
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="<?= htmlspecialchars($csrfToken) ?>">
    <title data-i18n="app_title">Ada Chat 开发版 V1.0 · 多模态</title>
    
    <!-- 核心样式文件 -->
    <link rel="stylesheet" href="style.css?v=<?= filemtime('style.css') ?>">
    
    <!-- 动态加载所有插件的 CSS 文件 -->
    <?php foreach ($pluginAssets['css'] as $cssFile): ?>
    <link rel="stylesheet" href="<?= htmlspecialchars($cssFile) ?>">
    <?php endforeach; ?>
    
    <!-- 预加载插件样式，但由JS动态加载，避免404 -->
    <style>
        /* 
         * 专属布局样式 
         * 注意：此处仅包含本页面特有的布局覆盖，通用样式请移至 style.css
         */
        .main {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden; /* 防止双重滚动条 */
        }

        .log-container {
            flex: 1 1 auto;
            padding-bottom: 16px;
            overflow-y: auto; /* 确保聊天记录独立滚动 */
        }

        /* 底部输入区域容器 */
        #dropZone {
            background: var(--bg-light);
            border-top: 1px solid var(--border);
            padding: 16px 28px 20px;
            box-shadow: 0 -4px 15px rgba(0, 0, 0, 0.03);
            flex-shrink: 0; /* 防止被压缩 */
        }

        /* 图片预览容器 */
        .preview-container {
            display: none;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
            padding: 8px 12px;
            background: var(--bg);
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            position: relative;
            max-width: fit-content;
        }

        .preview-container img {
            max-height: 70px;
            max-width: 120px;
            border-radius: var(--radius-sm);
            border: 2px solid var(--primary);
            object-fit: cover;
            display: block;
        }

        .remove-preview {
            background: none;
            border: none;
            color: var(--text-light);
            font-size: 20px;
            cursor: pointer;
            padding: 4px 10px;
            border-radius: 50%;
            line-height: 1;
            transition: var(--transition);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .remove-preview:hover {
            background: rgba(239,68,68,0.1);
            color: var(--danger);
        }

        /* 输入框行 - DeepSeek模式 */
        .input-row {
            margin-bottom: 12px;
            width: 100%;
            position: relative;
        }

        .message-input {
            width: 100%;
            background: var(--bg);
            border: 2px solid var(--border);
            border-radius: var(--radius-xl);
            padding: 14px 20px;
            font-size: 15px;
            outline: none;
            transition: var(--transition);
            color: var(--text);
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
            box-sizing: border-box;
            resize: none;
            min-height: 52px;
            max-height: 132px; /* 约5行高度 */
            line-height: 1.5;
            overflow-y: auto;
            font-family: inherit;
        }

        .message-input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
        }

        /* 输入提示 */
        .input-hint {
            position: absolute;
            right: 16px;
            bottom: 8px;
            font-size: 11px;
            color: var(--text-light);
            opacity: 0.6;
            pointer-events: none;
            background: var(--bg);
            padding: 2px 6px;
            border-radius: 12px;
        }

        /* 控件行 (传图、下拉框、发送) */
        .controls-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            width: 100%;
        }

        .controls-row .upload-btn {
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: var(--radius-xl);
            padding: 0 18px;
            height: 42px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            color: var(--text-light);
            transition: var(--transition);
            display: inline-flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
        }

        .controls-row .upload-btn:hover {
            background: var(--border);
            color: var(--text);
        }

        .controls-row .send-btn {
            background: var(--primary);
            color: white;
            border: none;
            border-radius: var(--radius-xl);
            padding: 0 28px;
            height: 42px;
            font-weight: 600;
            font-size: 15px;
            cursor: pointer;
            transition: var(--transition);
            white-space: nowrap;
            margin-left: auto;
        }

        .controls-row .send-btn:hover {
            background: var(--primary-dark);
        }

        .controls-row .send-btn:disabled {
            background: var(--border-dark);
            cursor: not-allowed;
            opacity: 0.7;
        }

        /* 下拉框统一尺寸 */
        .controls-row .select-mini {
            min-width: 130px;
            height: 42px;
            background-color: var(--bg-light);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            color: var(--text);
            padding: 0 10px;
            outline: none;
        }

        /* 图片模式包装 */
        .mode-wrapper {
            display: flex;
            align-items: center;
            gap: 6px;
            background: var(--bg);
            padding: 0 8px;
            border-radius: var(--radius-xl);
            border: 1px solid var(--border);
            height: 42px;
        }

        .mode-wrapper .select-mini {
            min-width: 100px;
            border: none;
            background: transparent;
            height: 40px;
            box-shadow: none;
            padding-left: 5px;
        }

        .mode-wrapper .hint {
            color: var(--text-light);
            font-size: 12px;
            white-space: nowrap;
            padding-right: 5px;
        }

        /* 移动端适配 */
        @media (max-width: 768px) {
            #dropZone { padding: 12px 16px; }
            .controls-row { gap: 8px; }
            .controls-row .select-mini { min-width: calc(50% - 20px); flex: 1 1 auto; }
            .mode-wrapper { width: 100%; order: 3; justify-content: space-between; margin-top: 8px; }
            .controls-row .upload-btn { order: 1; }
            .controls-row .send-btn { order: 2; margin-left: 0; flex: 1; }
            .input-hint { bottom: 4px; right: 12px; }
        }

        /* 预设管理列表样式 (复用部分通用样式，此处做微调) */
        .preset-list {
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            margin-bottom: 20px;
            max-height: 300px;
            overflow-y: auto;
            background: var(--bg);
        }

        .preset-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
            cursor: pointer;
            transition: var(--transition);
        }

        .preset-item:last-child { border-bottom: none; }
        .preset-item:hover { background: var(--bg-light); }
        
        .preset-item.active {
            background: rgba(16, 185, 129, 0.1);
            border-left: 3px solid var(--primary);
        }

        .preset-name { font-weight: 600; flex: 1; }
        
        .preset-type-badge {
            font-size: 12px;
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            background: var(--border);
            margin: 0 10px;
            color: var(--text-light);
        }

        .preset-actions button {
            background: none;
            border: none;
            cursor: pointer;
            margin: 0 4px;
            font-size: 16px;
            color: var(--text-light);
            transition: color 0.2s;
        }

        .preset-actions button:hover { color: var(--primary); }
        .preset-actions .delete-preset:hover { color: var(--danger); }

        /* 文生图单词转换管理样式 */
        .word-conversion-list {
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            max-height: 300px;
            overflow-y: auto;
            margin-bottom: 20px;
            background: var(--bg);
        }

        .conversion-item {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
            gap: 12px;
        }

        .conversion-item:last-child { border-bottom: none; }

        .conversion-short {
            min-width: 100px;
            font-weight: 600;
            color: var(--primary);
        }

        .conversion-long {
            flex: 1;
            color: var(--text);
            font-size: 13px;
            line-height: 1.5;
        }

        .conversion-actions {
            display: flex;
            gap: 8px;
        }

        .conversion-actions button {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            color: var(--text-light);
            transition: color 0.2s;
            padding: 4px;
        }

        .conversion-actions .edit-conversion:hover { color: var(--primary); }
        .conversion-actions .delete-conversion:hover { color: var(--danger); }

        .conversion-form {
            background: var(--bg);
            border-radius: var(--radius-md);
            padding: 20px;
            margin-top: 20px;
            border: 1px solid var(--border);
        }

        .conversion-form h4 {
            margin-bottom: 16px;
            color: var(--text);
        }

        .form-row {
            margin-bottom: 16px;
        }

        .form-row label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            font-size: 14px;
            color: var(--text);
        }

        .form-row input,
        .form-row textarea {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            font-size: 14px;
            transition: var(--transition);
        }

        .form-row input:focus,
        .form-row textarea:focus {
            border-color: var(--primary);
            outline: none;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
        }

        .form-row textarea {
            min-height: 80px;
            resize: vertical;
        }

        .conversion-form-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 20px;
        }

        /* 自动切换开关（控件行内） */
        .auto-switch-toggle {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            height: 42px;
            padding: 0 10px;
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            background: var(--bg);
            transition: var(--transition);
            user-select: none;
            white-space: nowrap;
            font-size: 13px;
        }
        .auto-switch-toggle:hover { background: var(--bg-light); }
        .auto-switch-toggle input[type="checkbox"] {
            width: 16px; height: 16px; margin: 0; cursor: pointer;
            accent-color: var(--primary);
        }
        .auto-switch-text { color: var(--text-light); font-size: 13px; }
        .auto-switch-toggle:has(input:checked) {
            border-color: var(--primary);
            background: rgba(16, 185, 129, 0.08);
        }
        .auto-switch-toggle:has(input:checked) .auto-switch-text {
            color: var(--primary);
        }

        /* 自动切换 Toast 通知 */
        .auto-switch-toast {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(-80px);
            background: var(--primary);
            color: #fff;
            padding: 10px 24px;
            border-radius: var(--radius-xl);
            font-size: 14px;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
            opacity: 0;
            transition: transform 0.3s ease, opacity 0.3s ease;
            pointer-events: none;
        }
        .auto-switch-toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }

        /* 设置面板中的模型列表 */
        .auto-switch-model-list {
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            max-height: 400px;
            overflow-y: auto;
            background: var(--bg);
            margin-top: 12px;
        }
        .auto-switch-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-bottom: 1px solid var(--border);
            transition: background 0.15s;
            cursor: grab;
        }
        .auto-switch-item:last-child { border-bottom: none; }
        .auto-switch-item:hover { background: var(--bg-light); }
        .auto-switch-item.checked { background: rgba(16, 185, 129, 0.06); }
        .auto-switch-item.dragging { opacity: 0.4; background: var(--border); }
        .drag-handle {
            color: var(--text-light);
            cursor: grab;
            font-size: 16px;
            line-height: 1;
            user-select: none;
        }
        .auto-switch-cb {
            width: 16px; height: 16px; margin: 0; cursor: pointer;
            accent-color: var(--primary);
        }
        .auto-switch-model-name {
            flex: 1;
            font-size: 14px;
            font-weight: 500;
            color: var(--text);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .auto-switch-provider-badge {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            background: var(--border);
            color: var(--text-light);
            white-space: nowrap;
        }
        .auto-switch-type-badge {
            font-size: 11px;
            padding: 2px 6px;
            border-radius: var(--radius-sm);
            background: rgba(16, 185, 129, 0.12);
            color: var(--primary);
            white-space: nowrap;
        }

        .auto-switch-group-header {
            font-size: 13px;
            font-weight: 600;
            padding: 10px 14px 6px;
            color: var(--text-light);
            border-bottom: 1px solid var(--border);
            background: var(--bg-light);
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .auto-switch-group-header:first-child {
            border-radius: var(--radius-md) var(--radius-md) 0 0;
        }
        .auto-switch-group {
            margin-bottom: 4px;
        }

        /* 模型搜索栏 */
        .model-search-bar {
            position: relative;
            margin: 10px 0 0;
        }
        .model-search-bar input {
            width: 100%;
            padding: 10px 14px;
            padding-right: 80px;
            border: 2px solid var(--border);
            border-radius: var(--radius-lg);
            font-size: 14px;
            outline: none;
            background: var(--bg);
            color: var(--text);
            transition: border-color 0.2s;
            box-sizing: border-box;
        }
        .model-search-bar input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
        }
        .model-search-count {
            position: absolute;
            right: 14px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 12px;
            color: var(--text-light);
            pointer-events: none;
        }

        @media (max-width: 768px) {
            .auto-switch-toggle { padding: 0 8px; }
            .auto-switch-text { display: none; }
        }

        .cost-section {
            background: var(--bg-secondary, #f8f9fa);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 10px;
            padding: 14px 16px;
            margin-bottom: 12px;
        }
        .cost-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 6px;
        }
        .cost-section .hint {
            font-size: 12px;
            color: #888;
            margin: 2px 0 0;
        }
        .cost-section .form-table th {
            width: 110px;
            font-size: 13px;
        }
        .cost-section .form-table td {
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="app">
        <!-- 侧边栏 -->
        <aside class="sidebar">
            <div class="sidebar-header">
                <button class="new-chat-btn" onclick="newChat()" data-i18n="new_chat">➕ 新建对话</button>
            </div>
            <div class="chat-list" id="chatList"></div>
            <div class="sidebar-footer">
                <button class="settings-btn-bottom" onclick="openSettings()" data-i18n="settings">⚙️ 设置</button>
            </div>
        </aside>

        <!-- 主区域 -->
        <main class="main">
            <!-- 聊天记录显示区域 -->
            <div id="log" class="log-container"></div>
            
            <!-- 底部输入区域 -->
            <div id="dropZone" class="drop-zone">
                <!-- 预览区域 -->
                <div id="previewContainer" class="preview-container">
                    <img id="preview" class="preview-img" alt="预览">
                    <button class="remove-preview" id="removePreviewBtn" title="移除图片">✕</button>
                </div>
                
                <!-- 输入框行 - DeepSeek模式 -->
                <div class="input-row">
                    <textarea 
                        id="msg" 
                        class="message-input" 
                        rows="1"
                        placeholder="输入提示词... 或将图片拖拽至此 (Enter发送，Ctrl+Enter换行)" 
                        onkeydown="handleTextareaKeydown(event)"
                    ></textarea>
                    <span class="input-hint">Ctrl+↵ 换行</span>
                </div>
                
                <!-- 控件行 -->
                <div class="controls-row">
                    <input type="file" id="file-input" accept="image/*" style="display:none" onchange="previewAndCompress()">
                    <button class="upload-btn" onclick="document.getElementById('file-input').click()" data-i18n="upload">📁 传图</button>
                    
                    <select id="category" class="select-mini" onchange="onCategoryChange()">
                        <option value="chat" data-i18n="category_chat">💬 对话</option>
                        <option value="code" data-i18n="category_code">💻 编程</option>
                        <option value="image" data-i18n="category_image">🎨 图像生成</option>
                        <option value="video" data-i18n="category_video">🎬 视频生成</option>
                        <option value="ocr" data-i18n="category_ocr">📄 文字识别</option>
                        <option value="vision" data-i18n="category_vision">👁️ 图像理解</option>
                        <option value="translation" data-i18n="category_translation">🌐 翻译</option>
                    </select>
                    
                    <select id="providerSelect" class="select-mini" onchange="onProviderChange()">
                        <option value="" data-i18n="loading_providers">加载供应商中...</option>
                    </select>
                    
                    <select id="model" class="select-mini">
                        <option value="" data-i18n="select_model_first">请先选择供应商和类别</option>
                    </select>
                    
                    <label class="auto-switch-toggle" id="autoSwitchLabel" title="自动切换模型 / Auto-switch model">
                        <input type="checkbox" id="autoSwitchToggle" onchange="toggleAutoSwitch(this)">
                        <span class="auto-switch-slider"></span>
                        <span class="auto-switch-text" data-i18n="auto_switch">🔄</span>
                    </label>
                    
                    <div class="mode-wrapper" id="modeRow" style="display:none;">
                        <select id="imageMode" class="select-mini">
                            <option value="text2img" data-i18n="text2img">文生图</option>
                            <option value="img2img" data-i18n="img2img">图生图</option>
                        </select>
                        <span class="hint" data-i18n="max_1mb">≤1MB</span>
                    </div>
                    
                    <button class="send-btn" onclick="send()" id="sendBtn" data-i18n="send">发送</button>
                </div>
            </div>
        </main>
    </div>

    <!-- 设置模态框 -->
    <div id="settingsModal" class="modal">
        <div class="modal-content settings-layout">
            <!-- 左侧导航菜单 -->
            <div class="settings-sidebar">
                <div class="settings-sidebar-header">
                    <h3 data-i18n="settings">⚙️ 设置</h3>
                </div>
                <div class="settings-menu">
                    <div class="menu-item" onclick="showAddProvider()">
                        <span class="menu-icon">➕</span> <span data-i18n="add_provider">新增供应商</span>
                    </div>
                    <div class="menu-item expandable" id="providerListToggle" onclick="toggleProviderList()">
                        <span class="menu-icon">📋</span> <span data-i18n="provider_list">供应商列表</span> <span class="arrow" id="providerListArrow">▼</span>
                    </div>
                    <div class="submenu" id="providerListSubmenu" style="display: none;"></div>
                    <div class="menu-item" onclick="showModelTypeManager()">
                        <span class="menu-icon">🎛️</span> <span data-i18n="model_type_manager">模型类型管理</span>
                    </div>
                    <div class="menu-item" id="autoSwitchMenuItem">
                        <span class="menu-icon">🔄</span> <span data-i18n="auto_switch_settings">模型自动切换</span>
                    </div>
                    <div class="menu-item" id="presetManagerMenuItem">
                        <span class="menu-icon">📚</span> <span data-i18n="preset_manager">预设管理</span>
                    </div>
                    <!-- 新增：文生图单词转换 -->
                    <div class="menu-item" id="wordConversionMenuItem">
                        <span class="menu-icon">🔄</span> <span data-i18n="word_conversion">文生图单词转换</span>
                    </div>
                    <div class="menu-item" id="timeoutMenuItem">
                        <span class="menu-icon">⏱️</span> <span data-i18n="timeout_settings">超时设置</span>
                    </div>
                    <div class="menu-item" id="pluginManagerMenuItem">
                        <span class="menu-icon">🧩</span> <span data-i18n="plugin_manager">插件管理</span>
                    </div>
                    <div class="menu-item" id="languageMenuItem">
                        <span class="menu-icon">🌐</span> <span data-i18n="language">语言</span>
                    </div>
                    <div class="menu-item" onclick="showPasswordSettings()">
                        <span class="menu-icon">🔐</span> <span data-i18n="password_settings">密码设置</span>
                    </div>
                    <div class="menu-item" onclick="showCostOptimizer()">
                        <span class="menu-icon">💰</span> <span data-i18n="cost_optimizer">成本优化</span>
                    </div>
                </div>
            </div>

            <!-- 右侧内容区 -->
            <div class="settings-main">
                <div class="settings-main-header">
                    <h2 id="settingsContentTitle" data-i18n="select_left_function">请选择左侧功能</h2>
                    <span class="close" onclick="closeSettings()">&times;</span>
                </div>

                <!-- 供应商编辑面板 -->
                <div id="providerEditPanel" style="display: none;">
                    <form id="providerForm" onsubmit="saveProvider(event)">
                        <input type="hidden" id="providerId">
                        <table class="form-table">
                            <tr><th data-i18n="name">名称*</th><td><input type="text" id="provName" required></td></tr>
                            <tr><th data-i18n="api_base_url">API 基础地址*</th><td><input type="url" id="provBaseUrl" placeholder="https://api.openai.com/v1" required></td></tr>
                            <tr><th data-i18n="api_key">API Key*</th><td><input type="password" id="provApiKey"></td></tr>
                            <tr><th data-i18n="models_path">模型列表路径</th><td><input type="text" id="provModelsPath" value="/models" placeholder="/models"></td></tr>
                            <tr><th data-i18n="chat_path">聊天补全路径</th><td><input type="text" id="provChatPath" value="/chat/completions" placeholder="/chat/completions"></td></tr>
                            <tr><th data-i18n="image_gen_path">文生图路径</th><td><input type="text" id="provImageGenPath" value="/images/generations" placeholder="/images/generations"></td></tr>
                            <tr><th data-i18n="image_edit_path">图生图路径</th><td><input type="text" id="provImageEditPath" value="/images/edits" placeholder="/images/edits"></td></tr>
                            <tr><th data-i18n="video_path">视频生成路径</th><td><input type="text" id="provVideoPath" value="/videos/generations" placeholder="/videos/generations"></td></tr>
                            <tr><th data-i18n="cache_strategy">缓存对齐策略</th><td>
                                <select id="provCacheStrategy">
                                    <option value="auto">自动检测 (Auto)</option>
                                    <option value="breakpoint">显式断点 (Anthropic/OpenRouter)</option>
                                    <option value="prefix">前缀缓存 (OpenAI/DeepSeek)</option>
                                    <option value="none">关闭</option>
                                </select>
                                <p class="hint" style="margin:4px 0 0;font-size:12px;color:#888;" data-i18n="cache_strategy_hint">自动检测会根据 API 地址选择最优策略，可节省 50%-90% 输入 token 费用</p>
                            </td></tr>
                        </table>
                        <div class="form-actions">
                            <button type="submit" class="save-provider-btn" data-i18n="save_provider">保存供应商</button>
                        </div>
                    </form>
                    <div class="model-selector">
                        <h4 data-i18n="enable_models">启用模型（可多选）</h4>
                        <div class="model-toolbar">
                            <button type="button" class="fetch-models-btn" onclick="fetchModelsForCurrentProvider()" data-i18n="fetch_models">获取最新模型</button>
                            <button type="button" class="save-models-btn" onclick="saveSelectedModels()" data-i18n="save_model_selection">保存模型选择</button>
                            <button type="button" class="select-all-btn" onclick="selectAllModels()" data-i18n="select_all">全选</button>
                            <button type="button" class="deselect-all-btn" onclick="deselectAllModels()" data-i18n="deselect_all">全不选</button>
                        </div>
                        <div class="model-search-bar">
                            <input type="text" id="modelSearchInput" placeholder="🔍 搜索模型名称..." oninput="filterModelCheckboxes(this.value)" autocomplete="off">
                            <span id="modelSearchCount" class="model-search-count"></span>
                        </div>
                        <div id="modelCheckboxList" class="model-checkbox-list"></div>
                        <p class="hint" data-i18n="save_after_checking">勾选后点击“保存模型选择”</p>
                    </div>
                </div>

                <!-- 模型类型管理面板 -->
                <div id="modelTypePanel" style="display: none;">
                    <h3 data-i18n="model_type_config">模型类型配置</h3>
                    <p data-i18n="model_type_desc">为已启用的模型指定类型（聊天/图像/视频/OCR等）</p>
                    <div id="modelTypeList" class="model-type-list"></div>
                    <button class="save-models-btn" onclick="saveModelTypes()" data-i18n="save_all_types">保存所有类型</button>
                </div>

                <!-- 预设管理面板 -->
                <div id="presetManagerPanel" style="display: none;">
                    <h3 data-i18n="preset_manager">📚 预设管理</h3>
                    <p data-i18n="preset_manager_desc">你可以创建多个预设，并在发送消息时自动应用激活的预设。系统预设用于聊天，角色预设用于图像生成。</p>
                    
                    <div id="presetList" class="preset-list"></div>
                    
                    <div style="margin-top: 20px;">
                        <input type="hidden" id="editingPresetId" value="">
                        <table class="form-table">
                            <tr>
                                <th data-i18n="preset_name">预设名称</th>
                                <td><input type="text" id="presetName" placeholder="例如：通用写实人像"></td>
                            </tr>
                            <tr>
                                <th data-i18n="preset_type">类型</th>
                                <td>
                                    <select id="presetType">
                                        <option value="system" data-i18n="system_preset">系统预设（聊天）</option>
                                        <option value="role" data-i18n="role_preset">角色预设（图像生成）</option>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <th data-i18n="preset_content">内容</th>
                                <td><textarea id="presetContent" rows="6" style="width:100%; padding:12px; border-radius:var(--radius-md); border:1px solid var(--border); font-family:monospace;" placeholder="输入预设内容..."></textarea></td>
                            </tr>
                        </table>
                        <div class="form-actions">
                            <button class="save-provider-btn" onclick="savePreset()" data-i18n="save_preset">保存预设</button>
                            <button class="fetch-models-btn" onclick="clearPresetForm()" data-i18n="new_preset">新建预设</button>
                        </div>
                    </div>
                </div>

                <!-- 新增：文生图单词转换面板 -->
                <div id="wordConversionPanel" style="display: none;">
                    <h3 data-i18n="word_conversion">🔄 文生图单词转换</h3>
                    <p data-i18n="word_conversion_desc">设置短语自动转换为更详细的Prompt，提升图像生成质量。</p>
                    
                    <div id="conversionList" class="word-conversion-list"></div>
                    
                    <div class="conversion-form" id="conversionForm">
                        <h4 data-i18n="add_edit_conversion" id="conversionFormTitle">新增转换规则</h4>
                        <input type="hidden" id="editingConversionId" value="">
                        
                        <div class="form-row">
                            <label for="conversionShort" data-i18n="short_phrase">短词/短语</label>
                            <input type="text" id="conversionShort" placeholder="例如：cat, 狗, 风景" maxlength="50">
                        </div>
                        
                        <div class="form-row">
                            <label for="conversionLong" data-i18n="long_prompt">详细Prompt</label>
                            <textarea id="conversionLong" rows="4" placeholder="例如：A beautiful fluffy cat sitting on a windowsill, sunlight streaming in, soft focus, 4k, highly detailed"></textarea>
                        </div>
                        
                        <div class="conversion-form-actions">
                            <button class="fetch-models-btn" onclick="clearConversionForm()" data-i18n="clear_form">清空表单</button>
                            <button class="save-provider-btn" onclick="saveConversion()" data-i18n="save_conversion">保存转换规则</button>
                        </div>
                    </div>
                </div>

                <!-- 超时设置面板 -->
                <div id="timeoutPanel" style="display: none;">
                    <h3 data-i18n="timeout_settings">⏱️ 超时设置</h3>
                    <p data-i18n="timeout_desc">自定义前端流式响应的超时时间（单位：秒）。</p>
                    <table class="form-table">
                        <tr>
                            <th data-i18n="total_timeout">总超时（秒）</th>
                            <td>
                                <input type="number" id="timeoutTotal" min="10" max="3600" value="600" step="10">
                                <span class="hint" data-i18n="total_timeout_hint">默认 600 秒（10分钟）</span>
                            </td>
                        </tr>
                        <tr>
                            <th data-i18n="idle_timeout">空闲超时（秒）</th>
                            <td>
                                <input type="number" id="timeoutIdle" min="10" max="600" value="120" step="10">
                                <span class="hint" data-i18n="idle_timeout_hint">默认 120 秒（2分钟）</span>
                            </td>
                        </tr>
                    </table>
                    <div class="form-actions">
                        <button class="save-provider-btn" onclick="saveTimeoutSettings()" data-i18n="save_timeout">保存超时设置</button>
                    </div>
                    <p class="hint" data-i18n="timeout_effect">修改后仅对新发送的请求生效。</p>
                </div>

                <!-- 语言设置面板 -->
                <div id="languagePanel" style="display: none;">
                    <h3 data-i18n="language">🌐 语言</h3>
                    <p data-i18n="language_desc">选择界面显示语言。</p>
                    <div class="password-row">
                        <select id="languageSelect" style="width:200px;">
                            <option value="zh" data-i18n="chinese">简体中文</option>
                            <option value="en" data-i18n="english">English</option>
                        </select>
                        <button onclick="saveLanguage()" data-i18n="save_language">保存语言</button>
                    </div>
                </div>

                <!-- 成本优化面板 -->
                <div id="costOptimizerPanel" style="display: none;">
                    <h3>💰 成本优化引擎</h3>
                    <p style="color:#888;margin-bottom:16px;">在不影响对话质量的前提下，自动降低 API 调用成本。所有优化在服务端透明执行。</p>

                    <!-- 1. 滑动窗口 -->
                    <div class="cost-section">
                        <div class="cost-header">
                            <label class="switch"><input type="checkbox" id="costSlidingEnabled"><span class="slider round"></span></label>
                            <strong>📐 滑动窗口 (Sliding Window)</strong>
                        </div>
                        <p class="hint">对话历史超过 token 上限时，自动裁剪中间旧消息，保留开头（定锚）+ 结尾（记忆）。</p>
                        <table class="form-table" style="margin-top:8px;">
                            <tr><th>Token 上限</th><td><input type="number" id="costSlidingMaxTokens" value="10000" min="1000" step="1000" style="width:100px;"> tokens</td></tr>
                            <tr><th>保留开头轮数</th><td><input type="number" id="costSlidingKeepFirst" value="2" min="0" max="10" style="width:60px;"> 轮</td></tr>
                            <tr><th>保留结尾轮数</th><td><input type="number" id="costSlidingKeepLast" value="5" min="1" max="20" style="width:60px;"> 轮</td></tr>
                        </table>
                    </div>

                    <!-- 2. 模型路由 -->
                    <div class="cost-section">
                        <div class="cost-header">
                            <label class="switch"><input type="checkbox" id="costRoutingEnabled"><span class="slider round"></span></label>
                            <strong>🔀 智能模型路由 (Model Routing)</strong>
                        </div>
                        <p class="hint">短消息/简单指令（"好的"、"继续"等）自动路由到廉价模型，复杂问题保持原模型。</p>
                        <table class="form-table" style="margin-top:8px;">
                            <tr><th>廉价模型</th><td><select id="costRoutingLightModel" style="width:100%;max-width:400px;"><option value="">-- 未配置（请先添加供应商和模型）--</option></select></td></tr>
                            <tr><th>简单消息阈值</th><td><input type="number" id="costRoutingMaxChars" value="30" min="5" max="100" style="width:60px;"> 字符以下视为简单消息</td></tr>
                            <tr><th>复杂关键词</th><td><textarea id="costRoutingKeywords" rows="2" style="width:100%;max-width:400px;font-size:12px;" placeholder="逗号分隔"></textarea><br><span class="hint">包含这些词的消息不会被路由到廉价模型</span></td></tr>
                        </table>
                    </div>

                    <!-- 3. 压缩回复 -->
                    <div class="cost-section">
                        <div class="cost-header">
                            <label class="switch"><input type="checkbox" id="costCompressEnabled"><span class="slider round"></span></label>
                            <strong>📦 压缩回复 (Compress Output)</strong>
                        </div>
                        <p class="hint">在 System Prompt 末尾注入简洁指令，减少 AI 废话，输出 token 预计减少 20%-30%。</p>
                        <table class="form-table" style="margin-top:8px;">
                            <tr><th>注入指令</th><td><textarea id="costCompressInstruction" rows="2" style="width:100%;max-width:400px;"></textarea></td></tr>
                        </table>
                    </div>

                    <!-- 4. KV 缓存 -->
                    <div class="cost-section">
                        <div class="cost-header">
                            <label class="switch"><input type="checkbox" id="costKvEnabled"><span class="slider round"></span></label>
                            <strong>🗄️ 回复缓存 (Response Cache)</strong>
                        </div>
                        <p class="hint">对相同问题（相同 system prompt + user message + model）缓存回复，重复提问零成本零延迟。使用 SQLite 存储。</p>
                        <table class="form-table" style="margin-top:8px;">
                            <tr><th>缓存有效期</th><td><input type="number" id="costKvTtl" value="3600" min="60" step="60" style="width:100px;"> 秒 <span class="hint">（3600 = 1小时）</span></td></tr>
                            <tr><th>跨会话宽松匹配</th><td><label class="switch"><input type="checkbox" id="costKvLoose"><span class="slider round"></span></label> <span class="hint">忽略 System Prompt 差异，仅匹配 user message + model</span></td></tr>
                        </table>
                    </div>

                    <!-- 5. 智能 max_tokens -->
                    <div class="cost-section">
                        <div class="cost-header">
                            <label class="switch"><input type="checkbox" id="costMaxTokensEnabled"><span class="slider round"></span></label>
                            <strong>📏 智能 max_tokens 限制</strong>
                        </div>
                        <p class="hint">根据用户输入长度自动设置输出上限。短问题不需要 4096 token 的预算。输出 token 价格是输入的 2-3 倍。</p>
                        <table class="form-table" style="margin-top:8px;">
                            <tr><th>分级规则</th><td><input type="text" id="costMaxTokensTiers" value="20:512,100:1024,500:2048,0:4096" style="width:100%;max-width:350px;"><br><span class="hint">格式: 字符数:max_tokens，逗号分隔。0 表示默认值。例: 20:512 = 20字以下限512</span></td></tr>
                        </table>
                    </div>

                    <!-- 6. Prompt 压缩 -->
                    <div class="cost-section">
                        <div class="cost-header">
                            <label class="switch"><input type="checkbox" id="costPromptCompressEnabled"><span class="slider round"></span></label>
                            <strong>🗜️ System Prompt 压缩</strong>
                        </div>
                        <p class="hint">自动将 System Prompt 中的结构化角色/物品/场景定义压缩为简记符号，减少 40-60% token。AI 能无损理解压缩格式。</p>
                    </div>

                    <div class="form-actions" style="margin-top:16px;">
                        <button class="save-provider-btn" onclick="saveCostSettings()">保存优化设置</button>
                    </div>
                </div>

                <!-- 密码设置面板 -->
                <div id="passwordPanel" style="display: none;">
                    <h3 data-i18n="password_settings">🔐 密码设置</h3>
                    <div class="password-row">
                        <input type="password" id="settingsPassword" placeholder="设置密码（留空则无密码）">
                        <button onclick="savePassword()" data-i18n="save_password">保存密码</button>
                    </div>
                    <p class="hint" data-i18n="password_hint">下次打开设置需输入此密码（简单前端保护）</p>
                </div>

                <!-- 自动切换面板 -->
                <div id="autoSwitchPanel" style="display: none;">
                    <h3 data-i18n="auto_switch_settings">🔄 模型自动切换</h3>
                    <p data-i18n="auto_switch_settings_desc">启用后，当模型达到频率限制时自动切换到列表中的下一个模型。拖拽可调整优先级。</p>
                    
                    <div style="margin: 20px 0; display:flex; align-items:center; gap:12px;">
                        <label class="switch">
                            <input type="checkbox" id="autoSwitchSettingToggle" onchange="toggleAutoSwitch(this)">
                            <span class="slider round"></span>
                        </label>
                        <span data-i18n="auto_switch_enable_label" style="font-weight:600;">启用自动切换</span>
                    </div>
                    
                    <h4 data-i18n="auto_switch_select_models" style="margin-top:24px;">选择参与切换的模型</h4>
                    <p class="hint" data-i18n="auto_switch_drag_hint">拖拽排序 · 勾选启用</p>
                    <div id="autoSwitchModelList" class="auto-switch-model-list"></div>
                    
                    <div class="form-actions" style="margin-top:16px;">
                        <button class="save-provider-btn" onclick="saveAutoSwitchList()" data-i18n="auto_switch_save">保存切换列表</button>
                    </div>
                </div>

                <!-- 插件管理面板 -->
                <div id="pluginManagerPanel" style="display: none;">
                    <h3 data-i18n="plugin_manager">🧩 插件管理</h3>
                    <p data-i18n="plugin_manager_desc">启用/禁用插件，配置插件设置。</p>
                    <div id="pluginList" class="plugin-list"></div>
                </div>

                <!-- 空白提示 -->
                <div id="defaultPlaceholder" style="display: block; text-align: center; color: #666; margin-top: 50px;" data-i18n="select_left_function">
                    请从左侧选择要配置的功能
                </div>
            </div>
        </div>
    </div>

    <!-- 核心脚本必须最先加载 -->
    <script src="script.js?v=<?= filemtime('script.js') ?>"></script>
    
    <!-- 动态加载所有插件的 JS 文件（必须在核心脚本之后加载） -->
    <?php foreach ($pluginAssets['js'] as $jsFile): ?>
    <script src="<?= htmlspecialchars($jsFile) ?>" defer></script>
    <?php endforeach; ?>
    
    <!-- 内联脚本：处理图片预览逻辑 -->
    <script>
        (function() {
            const previewImg = document.getElementById('preview');
            const previewContainer = document.getElementById('previewContainer');
            const removeBtn = document.getElementById('removePreviewBtn');
            const fileInput = document.getElementById('file-input');
            
            // 监听图片显示状态以控制容器显示
            if (previewImg && previewContainer) {
                // 初始隐藏预览容器
                previewImg.style.display = 'none';
                previewContainer.style.display = 'none';
                
                const observer = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        if (mutation.attributeName === 'src' || mutation.attributeName === 'style') {
                            const hasSrc = previewImg.src && previewImg.src !== '' && !previewImg.src.endsWith('undefined');
                            if (hasSrc && previewImg.src !== window.location.href) {
                                previewImg.style.display = 'block';
                                previewContainer.style.display = 'flex';
                            } else {
                                previewImg.style.display = 'none';
                                previewContainer.style.display = 'none';
                            }
                        }
                    });
                });
                
                observer.observe(previewImg, { attributes: true, attributeFilter: ['src', 'style'] });
                
                // 初始化状态
                previewImg.style.display = 'none';
                previewContainer.style.display = 'none';
            }

            // 全局移除函数
            window.removePreview = function() {
                if (previewImg) {
                    previewImg.src = '';
                    previewImg.style.display = 'none';
                }
                if (previewContainer) {
                    previewContainer.style.display = 'none';
                }
                if (typeof window.currentBase64 !== 'undefined') {
                    window.currentBase64 = "";
                }
                if (fileInput) fileInput.value = '';
            };

            if (removeBtn) {
                removeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if(typeof window.removePreview === 'function') window.removePreview();
                });
            }

            // 阻止预览区的默认拖拽行为
            if (previewContainer) {
                previewContainer.addEventListener('dragover', (e) => e.preventDefault());
                previewContainer.addEventListener('drop', (e) => e.preventDefault());
            }
            
            // 设置textarea自动调整高度
            const textarea = document.getElementById('msg');
            if (textarea) {
                function autoResize() {
                    textarea.style.height = 'auto';
                    const newHeight = Math.min(textarea.scrollHeight, 132); // 最大5行约132px
                    textarea.style.height = newHeight + 'px';
                    textarea.style.overflowY = newHeight >= 132 ? 'auto' : 'hidden';
                }
                
                textarea.addEventListener('input', autoResize);
                textarea.addEventListener('keydown', function(e) {
                    // Ctrl+Enter 插入换行并调整高度
                    if (e.key === 'Enter' && e.ctrlKey) {
                        e.preventDefault();
                        const start = this.selectionStart;
                        const end = this.selectionEnd;
                        this.value = this.value.substring(0, start) + '\n' + this.value.substring(end);
                        this.selectionStart = this.selectionEnd = start + 1;
                        autoResize();
                    }
                });
            }
        })();
    </script>
</body>
</html>