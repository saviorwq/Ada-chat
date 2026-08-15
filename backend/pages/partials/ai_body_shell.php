<body>
    <div class="app">
        <!-- 侧边栏 -->
        <aside class="sidebar">
            <div class="sidebar-header">
                <button class="new-chat-btn" onclick="newChat()" data-i18n="new_chat">➕ 新建对话</button>
            </div>
            <div class="chat-list" id="chatList"></div>
            <div class="sidebar-footer">
                <button id="settingsBtn" class="settings-btn-bottom" onclick="openSettings()" data-i18n="settings">⚙️ 设置</button>
                <button class="settings-btn-bottom" onclick="openHelpModal()" data-i18n="help">❓ 帮助</button>
                <button class="settings-btn-bottom" onclick="openSupportModal()" data-i18n="support">💚 Support</button>
                <button type="button" class="settings-btn-bottom workspace-advanced-only" onclick="location.href='vchat.php'" title="Vite 构建的精简聊天（需 npm run build）">🧩 Vite 精简版</button>
                <button class="settings-btn-bottom" onclick="safeExitAndShutdown()" data-i18n="safe_exit" title="彻底退出（含后台服务）">⏻ 安全退出</button>
            </div>
        </aside>

        <!-- 主区域 -->
        <main class="main">
            <!-- Ada Studio 创作入口（创作模式显示） -->
            <div id="adaStudioBanner" class="ada-studio-banner" hidden>
                <div class="ada-studio-banner__text">
                    <strong data-i18n="studio_banner_title">Ada Studio</strong>
                    <span data-i18n="studio_banner_desc">CYOA 文字冒险 · 创作与游玩</span>
                </div>
                <div class="ada-studio-banner__actions">
                    <button type="button" id="adaStudioOpenBtn" class="ada-studio-banner__btn" data-i18n="studio_open">打开 CYOA</button>
                    <button type="button" id="adaStudioImageBtn" class="ada-studio-banner__btn ada-studio-banner__btn--ghost" data-i18n="studio_image">去文生图</button>
                </div>
            </div>

            <!-- 知识库模式摘要条 -->
            <div id="knowledgeDock" class="knowledge-dock" hidden>
                <div class="knowledge-dock__main">
                    <strong data-i18n="knowledge_dock_title">知识库</strong>
                    <span id="knowledgeDockStats" class="knowledge-dock__stats"></span>
                </div>
                <div class="knowledge-dock__hits" id="knowledgeDockHits"></div>
                <div class="knowledge-dock__actions">
                    <label class="knowledge-dock__toggle">
                        <input type="checkbox" id="knowledgeDockRagEnable">
                        <span data-i18n="rag_enable">启用RAG增强</span>
                    </label>
                    <button type="button" id="knowledgeDockManageBtn" class="ada-studio-banner__btn ada-studio-banner__btn--ghost" data-i18n="knowledge_manage">管理知识库</button>
                </div>
            </div>

            <!-- 模型角色卡 -->
            <div id="modelPersonaStrip" class="persona-strip" aria-label="Ada recommended personas"></div>
            <div id="personaActiveHint" class="persona-active-hint" hidden></div>

            <!-- 空会话欢迎（非启动页时） -->
            <div id="workspaceEmptyState" class="workspace-empty" hidden>
                <div class="workspace-empty__title" id="workspaceEmptyTitle"></div>
                <p class="workspace-empty__desc" id="workspaceEmptyDesc"></p>
                <div class="workspace-empty__prompts" id="workspaceEmptyPrompts"></div>
            </div>

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
                    <input type="file" id="file-input" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf" style="display:none" onchange="previewAndCompress()">
                    <button class="upload-btn" onclick="document.getElementById('file-input').click()" data-i18n="upload">📁 上传</button>
                    
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
                    
                    <label class="auto-switch-toggle workspace-advanced-only" id="autoSwitchLabel" title="自动切换模型 / Auto-switch model">
                        <input type="checkbox" id="autoSwitchToggle" onchange="toggleAutoSwitch(this)">
                        <span class="auto-switch-slider"></span>
                        <span class="auto-switch-text" data-i18n="auto_switch">🔄</span>
                    </label>
                    
                    <div class="mode-wrapper" id="modeRow" style="display:none;">
                        <select id="imageMode" class="select-mini">
                            <option value="text2img" data-i18n="text2img">文生图</option>
                            <option value="img2img" data-i18n="img2img">图生图</option>
                        </select>
                        <select id="imageStrength" class="select-mini" title="重绘强度：越高越听提示词，越低越像参考图" style="display:none;">
                            <option value="0.5">0.5 像原图</option>
                            <option value="0.65">0.65</option>
                            <option value="0.75">0.75</option>
                            <option value="0.85" selected>0.85 换装推荐</option>
                            <option value="0.95">0.95 几乎重画</option>
                        </select>
                        <select id="imageCharacter" class="select-mini" title="角色库锁脸（可选）：用档案脸替换，构图仍用上传图" style="display:none;">
                            <option value="">无角色锁脸</option>
                        </select>
                        <span class="hint" data-i18n="max_1mb">≤1MB</span>
                    </div>
                    <div class="mode-wrapper" id="loraRow" style="display:none;">
                        <select id="imageLora" class="select-mini" title="LoRA（可选）">
                            <option value="" data-i18n="lora_none">无 LoRA</option>
                        </select>
                        <select id="imageLoraScale" class="select-mini" title="LoRA scale">
                            <option value="0.5">0.5</option>
                            <option value="0.8" selected>0.8</option>
                            <option value="1">1.0</option>
                        </select>
                    </div>
                    
                    <button class="send-btn" onclick="send()" id="sendBtn" data-i18n="send">发送</button>
                </div>
            </div>
        </main>
    </div>
