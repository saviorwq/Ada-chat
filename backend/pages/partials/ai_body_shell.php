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
                    <button type="button" id="adaStudioMusicBtn" class="ada-studio-banner__btn ada-studio-banner__btn--ghost" data-i18n="studio_music">去 Cover</button>
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
                        <option value="music" data-i18n="category_music">🎵 音乐生成</option>
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
                        <select id="imageOutputFormat" class="select-mini" title="导出格式：PNG 写 iTXt 元数据；JPEG 写标准 EXIF（含仿手机相机）" data-i18n-title="image_output_format_title">
                            <option value="png" selected data-i18n="image_format_png">PNG · iTXt元数据</option>
                            <option value="jpeg" data-i18n="image_format_jpeg">JPEG · EXIF(仿实拍)</option>
                        </select>
                        <select id="imageCharacter" class="select-mini" title="人物脸部预设：文生图可直接锁脸（无需上传）；图生图时上传图仅作构图" style="display:none;">
                            <option value="">无人物预设</option>
                        </select>
                        <button type="button" id="imageCharacterSaveBtn" class="btn-mini" title="把当前上传图存为人物预设" style="display:none;">存为人物</button>
                        <button type="button" id="imageCharacterManageBtn" class="btn-mini" title="管理多个人物脸部预设" style="display:none;">管理</button>
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
                    <div class="mode-wrapper music-params-row" id="musicRow" style="display:none;">
                        <select id="musicTaskType" class="select-mini" title="文生音乐 或 Cover 翻唱/伴奏" data-i18n-title="music_task_type_title">
                            <option value="text2music" selected data-i18n="music_task_text2music">文生音乐</option>
                            <option value="cover" data-i18n="music_task_cover">Cover 伴奏</option>
                        </select>
                        <label class="music-param-field music-cover-only" id="musicCoverStrengthWrap" style="display:none;" data-i18n-title="music_cover_strength_title" title="Cover 强度：越高越贴近源曲结构">
                            <span class="music-param-label">
                                <span data-i18n="music_cover_strength_label">Cover强度</span>
                                <span class="music-param-range" data-i18n="music_cover_strength_range">0.1–1.0</span>
                            </span>
                            <input type="number" id="musicCoverStrength" class="input-mini music-param-input" min="0.1" max="1" step="0.05" value="0.78" inputmode="decimal">
                        </label>
                        <select id="musicCoverPreset" class="select-mini music-cover-only" style="display:none;" title="Cover 预设一键填 Prompt" data-i18n-title="music_cover_preset_title">
                            <option value="" data-i18n="music_cover_preset_placeholder">Cover 预设…</option>
                        </select>
                        <div class="music-cover-src-panel music-cover-only" id="musicCoverSrcPanel" style="display:none;">
                            <span class="hint-mini" id="musicCoverSrcHint" data-i18n="music_cover_src_hint">先 📁 上传 Suno 完整 WAV</span>
                            <button type="button" id="musicCoverSrcReupload" class="btn-mini" style="display:none;" data-i18n="music_cover_reupload">重新上传</button>
                        </div>
                        <label class="music-param-field" id="musicDurationWrap" data-i18n-title="music_duration_title" title="音乐时长（秒）">
                            <span class="music-param-label">
                                <span data-i18n="music_duration_label">时长</span>
                                <span class="music-param-range" data-i18n="music_duration_range">10–300 秒</span>
                            </span>
                            <input type="number" id="musicDuration" class="input-mini music-param-input" min="10" max="300" step="1" value="30" inputmode="numeric">
                        </label>
                        <label class="music-param-field" data-i18n-title="music_steps_title" title="推理步数（Base 建议 40–70；Turbo 建议 8）">
                            <span class="music-param-label">
                                <span data-i18n="music_steps_label">步数</span>
                                <span class="music-param-range" data-i18n="music_steps_range">4–100</span>
                            </span>
                            <input type="number" id="musicSteps" class="input-mini music-param-input" min="4" max="100" step="1" value="55" inputmode="numeric">
                        </label>
                        <label class="music-param-field" data-i18n-title="music_cfg_title" title="CFG Guidance（Base 生效；国风/人声建议 2–4）">
                            <span class="music-param-label">
                                <span data-i18n="music_cfg_label">CFG</span>
                                <span class="music-param-range" data-i18n="music_cfg_range">1–12</span>
                            </span>
                            <input type="number" id="musicCfg" class="input-mini music-param-input" min="1" max="12" step="0.5" value="3" inputmode="decimal">
                        </label>
                        <label class="music-param-field" data-i18n-title="music_bpm_title" title="BPM 速度；留空则按风格自动推断">
                            <span class="music-param-label">
                                <span data-i18n="music_bpm_label">BPM</span>
                                <span class="music-param-range" data-i18n="music_bpm_range">30–300 · 空=自动</span>
                            </span>
                            <input type="number" id="musicBpm" class="input-mini music-param-input" min="30" max="300" step="1" placeholder="自动" data-i18n-placeholder="music_bpm_auto">
                        </label>
                        <label class="music-param-field" data-i18n-title="music_lm_temp_title" title="5Hz LM 采样温度；人声建议 0.6–0.8，越低越稳">
                            <span class="music-param-label">
                                <span data-i18n="music_lm_temp_label">LM温度</span>
                                <span class="music-param-range" data-i18n="music_lm_temp_range">0.5–1.5</span>
                            </span>
                            <input type="number" id="musicLmTemp" class="input-mini music-param-input" min="0.5" max="1.5" step="0.05" value="0.7" inputmode="decimal">
                        </label>
                        <label class="music-param-field" data-i18n-title="music_infer_method_title" title="扩散推理：ODE 更稳；勿用 SDE（人声易畸变）">
                            <span class="music-param-label">
                                <span data-i18n="music_infer_method_label">推理</span>
                                <span class="music-param-range" data-i18n="music_infer_method_range">ODE / SDE</span>
                            </span>
                            <select id="musicInferMethod" class="select-mini music-param-select">
                                <option value="ode" selected data-i18n="music_infer_ode">ODE（稳）</option>
                                <option value="sde" data-i18n="music_infer_sde">SDE</option>
                            </select>
                        </label>
                        <select id="musicFormat" class="select-mini" title="输出格式（WAV 便于排查杂音/进 DAW）">
                            <option value="wav" selected>WAV</option>
                            <option value="mp3">MP3</option>
                            <option value="flac">FLAC</option>
                        </select>
                        <label class="route-toggle-mini" title="勾选后强制纯器乐，并自动追加无人声提示词" data-i18n-title="music_instrumental_only_title">
                            <input type="checkbox" id="musicInstrumentalOnly" checked>
                            <span data-i18n="music_instrumental_only">仅音乐</span>
                        </label>
                        <button type="button" id="musicFreeVramBtn" class="btn-mini" data-i18n="music_free_vram" title="停止 ACE-Step / 出图 Worker，释放显存" data-i18n-title="music_free_vram_title">释放显存</button>
                    </div>
                    
                    <button type="button" class="btn-mini" id="inputTranslateEnBtn" data-i18n="input_translate_en" title="将输入框中文译为英文（出图提示词推荐）">译英</button>
                    <button class="send-btn" onclick="send()" id="sendBtn" data-i18n="send">发送</button>
                </div>
            </div>
        </main>
    </div>
