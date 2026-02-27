/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
// ===============================
// Ada Chat Plugin Runtime System
// ===============================

// Auto-inject CSRF token for all fetch POST requests
(function() {
    const _origFetch = window.fetch;
    window.fetch = function(url, options) {
        options = options || {};
        if (options.method && options.method.toUpperCase() === 'POST') {
            const meta = document.querySelector('meta[name="csrf-token"]');
            if (meta) {
                options.headers = options.headers || {};
                if (options.headers instanceof Headers) {
                    options.headers.set('X-CSRF-Token', meta.content);
                } else {
                    options.headers['X-CSRF-Token'] = meta.content;
                }
            }
        }
        return _origFetch.call(this, url, options);
    };
})();

const PluginSystem = {
    plugins: {},
    hooks: {},

    registerPlugin(plugin) {
        if (!plugin.id) {
            console.error("[Plugin] 必须提供 id");
            return;
        }

        this.plugins[plugin.id] = plugin;

        if (plugin.hooks && Array.isArray(plugin.hooks)) {
            plugin.hooks.forEach(hookName => {
                if (!this.hooks[hookName]) {
                    this.hooks[hookName] = [];
                }
                // 只存储插件引用，不存储具体函数
                this.hooks[hookName].push(plugin.id);
            });
        }

        if (plugin.onload && typeof plugin.onload === 'function') {
            try {
                plugin.onload();
            } catch (e) {
                console.error(`[Plugin] onload 错误 (${plugin.id}):`, e);
            }
        }

        console.log("[Plugin] 已注册:", plugin.id);
    },

    async runHook(name, context) {
        if (!this.hooks[name]) return true;

        for (const pluginId of this.hooks[name]) {
            const plugin = this.plugins[pluginId];
            // 检查插件是否启用
            if (!plugin || !MainApp.isPluginEnabled(pluginId)) {
                continue;
            }
            
            const fn = plugin[name];
            if (typeof fn === "function") {
                try {
                    const result = await fn(context);
                    if (result === false) {
                        console.log("[Plugin] 阻止执行:", pluginId);
                        return false;
                    }
                } catch (e) {
                    console.error(`[Plugin] 钩子执行错误 (${pluginId}.${name}):`, e);
                }
            }
        }
        return true;
    },

    // 获取所有已注册的插件
    getAllPlugins() {
        return Object.values(this.plugins);
    },

    // 获取插件信息（用于设置面板）
    getPluginInfo(pluginId) {
        return this.plugins[pluginId] || null;
    }
};

// ========== 插件通用服务端存储 API ==========
class PluginStorage {
    constructor(pluginId) {
        this._id = pluginId;
        this._base = `api.php?plugin=${encodeURIComponent(pluginId)}`;
    }
    async get(key) {
        const res = await fetch(`${this._base}&action=store_get&key=${encodeURIComponent(key)}&_=${Date.now()}`);
        const json = await res.json();
        return json.success ? json.data : null;
    }
    async set(key, data) {
        const res = await fetch(`${this._base}&action=store_set&key=${encodeURIComponent(key)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const json = await res.json();
        return json.success === true;
    }
    async delete(key) {
        const res = await fetch(`${this._base}&action=store_delete&key=${encodeURIComponent(key)}`);
        const json = await res.json();
        return json.success === true;
    }
    async list() {
        const res = await fetch(`${this._base}&action=store_list&_=${Date.now()}`);
        const json = await res.json();
        return json.success ? json.keys : [];
    }
}
window.PluginStorage = PluginStorage;

// 恢复旧版插件接口兼容
window.MainApp = {
    // 插件存储 { id: pluginObject }
    plugins: {},
    // 插件启用状态（从 localStorage 加载）
    enabledPlugins: {},

    /**
     * 注册插件
     */
    registerPlugin: function(plugin) {
        if (!plugin.id) {
            console.error('插件必须包含 id');
            return;
        }
        
        plugin.storage = new PluginStorage(plugin.id);
        
        this.plugins[plugin.id] = plugin;
        
        const saved = localStorage.getItem('plugin_enabled_' + plugin.id);
        this.enabledPlugins[plugin.id] = saved !== null ? saved === 'true' : true;

        PluginSystem.registerPlugin(plugin);

        console.log(`插件已注册: ${plugin.name} (${plugin.id})`);
        
        // 触发插件列表更新事件
        document.dispatchEvent(new CustomEvent('pluginRegistered', { detail: { pluginId: plugin.id } }));
    },

    /**
     * 获取插件启用状态
     */
    isPluginEnabled: function(pluginId) {
        return !!this.enabledPlugins[pluginId];
    },

    /**
     * 设置插件启用/禁用
     */
    setPluginEnabled: function(pluginId, enabled) {
        this.enabledPlugins[pluginId] = enabled;
        localStorage.setItem('plugin_enabled_' + pluginId, enabled);
        
        // 触发插件状态变更事件
        document.dispatchEvent(new CustomEvent('pluginStateChanged', { 
            detail: { pluginId: pluginId, enabled: enabled } 
        }));
    },

    /**
     * 执行所有插件的钩子（支持异步）
     */
    async runHooks(hookName, ...args) {
        // 使用 PluginSystem 的 runHook
        return await PluginSystem.runHook(hookName, ...args);
    },

    // 以下为现有功能的封装
    appendMessage: function(role, content) {
        if (role === 'user') {
            addMessageToCurrent('user', content);
        } else {
            appendToLastAIMessage(content);
        }
    },

/**
 * 设置游戏模式
 */
setGameMode: function(active, config = {}) {
    const dropZone = $('dropZone');
    const controlsBar = document.querySelector('.controls-bar');
    const sidebar = document.querySelector('.sidebar');
    const mainElement = document.querySelector('.main');
    
    if (active) {
        if (dropZone) {
            dropZone.style.display = 'none';
        }
        
        if (controlsBar) {
            controlsBar.style.display = 'none';
        }
        
        const originalInputs = document.querySelectorAll('.input-row, .controls-row, .upload-btn, .send-btn, #category, #providerSelect, #model, #modeRow');
        originalInputs.forEach(el => {
            if (el) el.style.display = 'none';
        });
        
        if (typeof window !== 'undefined') {
            window.gameModeModel = $('model') ? $('model').value : null;
            window.gameModeProvider = $('providerSelect') ? $('providerSelect').value : null;
        }
        
        let gameBar = $('gameModeBar');
        if (!gameBar) {
            gameBar = document.createElement('div');
            gameBar.id = 'gameModeBar';
            gameBar.style.padding = '16px 28px';
            gameBar.style.background = 'var(--bg-light)';
            gameBar.style.borderTop = '1px solid var(--border)';
            gameBar.style.position = 'relative';
            gameBar.style.zIndex = '100';
            
            if (mainElement) {
                if (dropZone && dropZone.parentNode) {
                    dropZone.parentNode.insertBefore(gameBar, dropZone);
                    dropZone.style.display = 'none';
                } else {
                    mainElement.appendChild(gameBar);
                }
            }
        }
        gameBar.style.display = 'block';
        
        if (config.controlsRenderer) {
            gameBar.innerHTML = config.controlsRenderer();
        }
        if (config.onExit) {
            window.gameExitCallback = config.onExit;
        }
        
        document.body.classList.add('game-mode-active');
        
        console.log('[MainApp] 进入游戏模式，保存的模型:', window.gameModeModel);
        
    } else {
        if (dropZone) {
            dropZone.style.display = 'block';
        }
        
        if (controlsBar) {
            controlsBar.style.display = 'flex';
        }
        
        const originalInputs = document.querySelectorAll('.input-row, .controls-row, .upload-btn, .send-btn, #category, #providerSelect, #model, #modeRow');
        originalInputs.forEach(el => {
            if (el) el.style.display = '';
        });
        
        const gameBar = $('gameModeBar');
        if (gameBar) {
            gameBar.style.display = 'none';
            if (gameBar.parentNode) {
                gameBar.parentNode.removeChild(gameBar);
            }
        }
        
        document.body.classList.remove('game-mode-active');
        
        if (typeof window !== 'undefined') {
            window.gameModeModel = null;
            window.gameModeProvider = null;
        }
        
        if (window.gameExitCallback) {
            try {
                window.gameExitCallback();
            } catch (e) {
                console.error('[MainApp] 退出回调执行错误:', e);
            }
            window.gameExitCallback = null;
        }
        
        console.log('[MainApp] 退出游戏模式');
    }
},

    /**
     * 获取指定类型的模型列表
     */
    getModels: function(type) {
        return window.allModels ? window.allModels.filter(m => m.type === type).map(m => ({
            value: m.value,
            label: m.label
        })) : [];
    },
    
    /**
     * 获取所有已注册插件
     */
    getPlugins: function() {
        return Object.values(this.plugins);
    }
};

console.log("✅ Ada Chat 插件系统已初始化");

// ---------- 全局变量 ----------
let conversations = [];
let currentConvId = null;
window.currentBase64 = window.currentBase64 || "";
// 确保 allModels 只声明一次
if (typeof window.allModels === 'undefined') {
    window.allModels = [];
}
let providers = [];
let isReceiving = false;
let currentEditingProviderId = null;

// 预设数据 { id, name, type, content }
let presets = [];
let currentActivePresetId = { system: null, role: null };

// 新增：文生图单词转换数据
let wordConversions = [];
let currentEditingConversionId = null;
let debugLogs = [];
const DEBUG_MODE_KEY = 'debug_mode_enabled';
const DEBUG_LOGS_KEY = 'debug_logs';
const DEBUG_MAX_LOGS = 300;
const THEME_SETTINGS_KEY = 'theme_settings';
const CHAT_PROFILE_KEY = 'chat_profile_settings';
const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const RAG_SETTINGS_KEY = 'adachat_rag_settings_v1';
const RAG_STORE_KEY = 'adachat_rag_store_v1';
const RAG_MAX_FILE_BYTES = 1024 * 1024; // 1MB per file for localStorage safety
const MODE_CONFIG = window.AdaChatModeConfig || {};
const IMAGE_UPLOAD_ACCEPT = MODE_CONFIG.IMAGE_ACCEPT || '.jpg,.jpeg,.png,.webp,.gif';
const OCR_UPLOAD_ACCEPT = MODE_CONFIG.OCR_ACCEPT || '.jpg,.jpeg,.png,.webp,.gif,.pdf';
const PDF_SCAN_MAX_PAGES = 5;

// 语言包
const i18n = {
    zh: {
        app_title: "Ada Chat 开发版 V1.0 · 多模态",
        new_chat: "➕ 新建对话",
        settings: "⚙️ 设置",
        help: "❓ 帮助",
        help_center: "帮助中心",
        upload: "📁 上传",
        category_chat: "💬 对话",
        category_code: "💻 编程",
        category_image: "🎨 图像生成",
        category_video: "🎬 视频生成",
        category_ocr: "📄 文字识别",
        category_vision: "👁️ 图像理解",
        category_translation: "🌐 翻译",
        loading_providers: "加载供应商中...",
        select_model_first: "请先选择供应商和类别",
        text2img: "文生图",
        img2img: "图生图",
        code_placeholder: "描述你需要的代码功能，或粘贴代码让AI分析",
        ocr_placeholder: "上传含文字的图片或文档截图，自动提取文字",
        ocr_need_image: "请先上传需要识别文字的图片",
        vision_placeholder: '上传图片后点击发送 · 可输入分析指令，如"分析穿搭风格"、"描述场景"',
        vision_need_image: "请先上传需要分析的图片",
        translation_placeholder: "输入要翻译的文本（可上传含文字的图片）",
        translation_need_input: "请输入要翻译的文本或上传含文字的图片",
        max_1mb: "≤1MB",
        send: "发送",
        add_provider: "新增供应商",
        provider_list: "供应商列表",
        model_type_manager: "模型类型管理",
        mode_capability_matrix: "模式能力矩阵",
        mode_capability_desc: "此面板从模式配置实时渲染，仅用于查看当前各模式上传规则与处理方式。",
        mode_capability_flags: "关键开关",
        mode_capability_copy_md: "复制为Markdown",
        mode_capability_copy_success: "模式能力矩阵已复制到剪贴板",
        mode_capability_copy_failed: "复制失败，请手动复制",
        preset_manager: "预设管理",
        rag_knowledge: "RAG知识库",
        rag_desc: "上传本地文本文件，聊天时自动检索相关片段注入上下文。",
        rag_enable: "启用RAG增强",
        rag_topk: "检索片段数 (Top-K)",
        rag_max_chars: "上下文最大字符",
        rag_import_files: "导入文件",
        rag_rebuild: "重建索引",
        rag_clear_all: "清空知识库",
        rag_supported_types: "支持 .txt .md .json .csv .log（单文件≤1MB）",
        rag_docs_empty: "暂无已导入文档",
        rag_docs_count: "文档数",
        rag_chunks_count: "分块数",
        rag_saved: "RAG设置已保存",
        rag_import_done: "导入完成",
        rag_import_none: "未导入任何可用文本文件",
        rag_delete_doc_confirm: "确定删除该文档吗？",
        word_conversion: "文生图单词转换",
        word_conversion_desc: "设置短语自动转换为更详细的Prompt，提升图像生成质量。",
        add_edit_conversion: "新增/编辑转换规则",
        short_phrase: "短词/短语",
        long_prompt: "详细Prompt",
        save_conversion: "保存转换规则",
        clear_form: "清空表单",
        edit: "编辑",
        delete: "删除",
        confirm_delete_conversion: "确定删除此转换规则吗？",
        conversion_saved: "转换规则已保存",
        timeout_settings: "超时设置",
        plugin_manager: "插件管理",
        plugin_manager_desc: "启用/禁用插件，配置插件设置",
        language: "切换语言",
        chat_profile: "聊天身份",
        chat_profile_desc: "可自定义玩家与 AI 的昵称和头像（支持图片 URL）。",
        player_nickname: "玩家昵称",
        player_avatar: "玩家头像 URL",
        ai_nickname: "AI 昵称",
        ai_avatar: "AI 头像 URL",
        upload_avatar: "上传头像",
        avatar_upload_hint: "可上传本地图片，自动压缩至 2MB 以内",
        avatar_file_invalid: "请选择图片文件",
        avatar_upload_failed: "头像处理失败，请更换图片重试",
        avatar_upload_success: "头像已上传并自动压缩",
        ai_call_user_as: "AI 对玩家称呼",
        save_profile: "保存身份",
        password_settings: "密码设置",
        more_features: "更多功能开发中...",
        select_left_function: "请选择左侧功能",
        name: "名称*",
        api_base_url: "API 基础地址*",
        api_key: "API Key*",
        api_key_keep_hint: "留空则保持不变",
        models_path: "模型列表路径",
        chat_path: "聊天补全路径",
        image_gen_path: "文生图路径",
        image_edit_path: "图生图路径",
        video_path: "视频生成路径",
        save_provider: "保存供应商",
        enable_models: "启用模型（可多选）",
        fetch_models: "获取最新模型",
        save_model_selection: "保存模型选择",
        select_all: "全选",
        deselect_all: "全不选",
        save_after_checking: "勾选后点击“保存模型选择”",
        model_type_config: "模型类型配置",
        model_type_desc: "为已启用的模型指定类型（对话/编程/图像/视频/OCR/图像理解/翻译）",
        save_all_types: "保存所有类型",
        preset_manager_desc: "你可以创建多个预设，并在发送消息时自动应用激活的预设。",
        preset_name: "预设名称",
        preset_type: "类型",
        system_preset: "系统预设（聊天）",
        role_preset: "角色预设（图像生成）",
        preset_content: "内容",
        save_preset: "保存预设",
        new_preset: "新建预设",
        total_timeout: "总超时（秒）",
        total_timeout_hint: "默认 600 秒（10分钟）",
        idle_timeout: "空闲超时（秒）",
        idle_timeout_hint: "默认 120 秒（2分钟）",
        save_timeout: "保存超时设置",
        timeout_effect: "修改后仅对新发送的请求生效。",
        language_desc: "选择界面显示语言。",
        chinese: "简体中文",
        english: "English",
        save_language: "保存语言",
        save_password: "保存密码",
        password_hint: "下次打开设置需输入此密码",
        activate: "激活",
        confirm_delete_preset: "确定删除此预设吗？",
        preset_saved: "预设已保存",
        language_saved: "语言已保存，刷新页面生效",
        timeout_saved: "超时设置已保存",
        password_saved: "密码已保存",
        password_cleared: "密码已清除",
        auto_switch: "自动切换",
        auto_switch_tooltip: "模型达到限制时自动切换到下一个可用模型",
        auto_switch_notice: "🔄 模型限制，切换至：",
        auto_switch_all_failed: "所有模型均已达到限制",
        auto_switch_enabled: "自动切换已开启",
        auto_switch_disabled: "自动切换已关闭",
        auto_switch_settings: "模型自动切换",
        auto_switch_settings_desc: "启用后，当模型达到频率限制时自动切换到列表中的下一个模型。拖拽可调整优先级。",
        auto_switch_enable_label: "启用自动切换",
        auto_switch_select_models: "选择参与切换的模型",
        auto_switch_no_models: "暂无可用模型，请先在供应商中启用模型。",
        auto_switch_save: "保存切换列表",
        auto_switch_saved: "自动切换列表已保存",
        auto_switch_drag_hint: "拖拽排序 · 勾选启用",
        search_models_placeholder: "🔍 搜索模型名称...",
        debug_mode: "调试模式",
        debug_mode_desc: "默认关闭。开启后记录请求调试日志（自动脱敏），用于问题排查。",
        debug_mode_enable_label: "启用调试模式",
        debug_refresh: "刷新日志",
        debug_export: "导出日志(JSON)",
        debug_diag: "生成诊断码",
        debug_clear: "清空日志",
        debug_cleared: "调试日志已清空",
        debug_export_empty: "暂无日志可导出",
        debug_cmd_title: "命令控制台",
        debug_cmd_placeholder: "输入命令，例如：help / diag / stats / errors 20",
        debug_run: "执行",
        debug_help: "帮助",
        skin_mode: "皮肤模式",
        skin_mode_desc: "选择界面主题，或自定义颜色。",
        theme_preset: "主题预设",
        theme_light: "浅色",
        theme_dark: "深色",
        theme_custom: "自定义",
        theme_primary: "主色",
        theme_bg: "背景色",
        theme_text: "文字色",
        save_skin: "保存皮肤"
    },
    en: {
        app_title: "Ada Chat Dev V1.0 · Multimodal",
        new_chat: "➕ New Chat",
        settings: "⚙️ Settings",
        help: "❓ Help",
        help_center: "Help Center",
        upload: "📁 Upload",
        category_chat: "💬 Chat",
        category_code: "💻 Code",
        category_image: "🎨 Image",
        category_video: "🎬 Video",
        category_ocr: "📄 OCR",
        category_vision: "👁️ Vision",
        category_translation: "🌐 Translate",
        loading_providers: "Loading providers...",
        select_model_first: "Select provider and category first",
        text2img: "Text to Image",
        img2img: "Image to Image",
        code_placeholder: "Describe the code you need, or paste code for analysis",
        ocr_placeholder: "Upload image with text or document screenshot",
        ocr_need_image: "Please upload an image to extract text from",
        vision_placeholder: "Upload image & send · e.g. \"analyze outfit\", \"describe scene\"",
        vision_need_image: "Please upload an image to analyze",
        translation_placeholder: "Enter text to translate (or upload image with text)",
        translation_need_input: "Please enter text or upload an image to translate",
        max_1mb: "≤1MB",
        send: "Send",
        add_provider: "Add Provider",
        provider_list: "Provider List",
        model_type_manager: "Model Type Manager",
        mode_capability_matrix: "Mode Capability Matrix",
        mode_capability_desc: "This read-only panel is rendered from mode config and shows current upload rules and processing.",
        mode_capability_flags: "Key Flags",
        mode_capability_copy_md: "Copy as Markdown",
        mode_capability_copy_success: "Mode capability matrix copied to clipboard",
        mode_capability_copy_failed: "Copy failed, please copy manually",
        preset_manager: "Preset Manager",
        rag_knowledge: "RAG Knowledge",
        rag_desc: "Upload local text files and inject relevant chunks into chat context.",
        rag_enable: "Enable RAG",
        rag_topk: "Top-K Chunks",
        rag_max_chars: "Max Context Chars",
        rag_import_files: "Import Files",
        rag_rebuild: "Rebuild Index",
        rag_clear_all: "Clear Knowledge Base",
        rag_supported_types: "Supports .txt .md .json .csv .log (≤1MB each)",
        rag_docs_empty: "No documents imported",
        rag_docs_count: "Documents",
        rag_chunks_count: "Chunks",
        rag_saved: "RAG settings saved",
        rag_import_done: "Import completed",
        rag_import_none: "No valid text files imported",
        rag_delete_doc_confirm: "Delete this document?",
        word_conversion: "Word Conversion",
        word_conversion_desc: "Convert short words/phrases to detailed prompts for better image generation.",
        add_edit_conversion: "Add/Edit Conversion Rule",
        short_phrase: "Short Phrase",
        long_prompt: "Detailed Prompt",
        save_conversion: "Save Rule",
        clear_form: "Clear Form",
        edit: "Edit",
        delete: "Delete",
        confirm_delete_conversion: "Delete this conversion rule?",
        conversion_saved: "Conversion rule saved",
        timeout_settings: "Timeout",
        plugin_manager: "Plugins",
        plugin_manager_desc: "Enable/disable plugins and configure plugin settings",
        language: "Language",
        chat_profile: "Chat Profile",
        chat_profile_desc: "Customize player/AI nicknames and avatars (image URL supported).",
        player_nickname: "Player Nickname",
        player_avatar: "Player Avatar URL",
        ai_nickname: "AI Nickname",
        ai_avatar: "AI Avatar URL",
        upload_avatar: "Upload Avatar",
        avatar_upload_hint: "Upload local image, auto-compressed below 2MB",
        avatar_file_invalid: "Please select an image file",
        avatar_upload_failed: "Avatar processing failed, please try another image",
        avatar_upload_success: "Avatar uploaded and auto-compressed",
        ai_call_user_as: "How AI Addresses User",
        save_profile: "Save Profile",
        password_settings: "Password",
        more_features: "More features...",
        select_left_function: "Select a function from left",
        name: "Name*",
        api_base_url: "API Base URL*",
        api_key: "API Key*",
        api_key_keep_hint: "Leave empty to keep current key",
        models_path: "Models Path",
        chat_path: "Chat Path",
        image_gen_path: "Image Gen Path",
        image_edit_path: "Image Edit Path",
        video_path: "Video Path",
        save_provider: "Save Provider",
        enable_models: "Enable Models",
        fetch_models: "Fetch Models",
        save_model_selection: "Save Selection",
        select_all: "Select All",
        deselect_all: "Deselect All",
        save_after_checking: "Check and save",
        model_type_config: "Model Type Config",
        model_type_desc: "Assign types to enabled models",
        save_all_types: "Save All",
        preset_manager_desc: "Create multiple presets.",
        preset_name: "Preset Name",
        preset_type: "Type",
        system_preset: "System (Chat)",
        role_preset: "Role (Image)",
        preset_content: "Content",
        save_preset: "Save Preset",
        new_preset: "New Preset",
        total_timeout: "Total Timeout (sec)",
        total_timeout_hint: "Default 600s (10min)",
        idle_timeout: "Idle Timeout (sec)",
        idle_timeout_hint: "Default 120s (2min)",
        save_timeout: "Save Timeout",
        timeout_effect: "Changes apply to new requests only.",
        language_desc: "Choose interface language.",
        chinese: "简体中文",
        english: "English",
        save_language: "Save Language",
        save_password: "Save Password",
        password_hint: "Password required to open settings next time.",
        activate: "Activate",
        confirm_delete_preset: "Delete this preset?",
        preset_saved: "Preset saved",
        language_saved: "Language saved, refresh to apply",
        timeout_saved: "Timeout saved",
        password_saved: "Password saved",
        password_cleared: "Password cleared",
        auto_switch: "Auto-switch",
        auto_switch_tooltip: "Auto-switch to next model when rate limited",
        auto_switch_notice: "🔄 Rate limited, switching to: ",
        auto_switch_all_failed: "All models rate limited",
        auto_switch_enabled: "Auto-switch enabled",
        auto_switch_disabled: "Auto-switch disabled",
        auto_switch_settings: "Auto-Switch Models",
        auto_switch_settings_desc: "When enabled, automatically switch to the next model in the list when rate limited. Drag to reorder priority.",
        auto_switch_enable_label: "Enable auto-switch",
        auto_switch_select_models: "Select models for auto-switch",
        auto_switch_no_models: "No models available. Enable models in a provider first.",
        auto_switch_save: "Save Switch List",
        auto_switch_saved: "Auto-switch list saved",
        auto_switch_drag_hint: "Drag to reorder · Check to enable",
        search_models_placeholder: "🔍 Search model name...",
        debug_mode: "Debug Mode",
        debug_mode_desc: "Off by default. When enabled, request debug logs are recorded with sensitive data redacted.",
        debug_mode_enable_label: "Enable debug mode",
        debug_refresh: "Refresh Logs",
        debug_export: "Export Logs (JSON)",
        debug_diag: "Generate Diagnostic Code",
        debug_clear: "Clear Logs",
        debug_cleared: "Debug logs cleared",
        debug_export_empty: "No logs to export",
        debug_cmd_title: "Command Console",
        debug_cmd_placeholder: "Enter command, e.g. help / diag / stats / errors 20",
        debug_run: "Run",
        debug_help: "Help",
        skin_mode: "Skin Mode",
        skin_mode_desc: "Choose a theme or customize colors.",
        theme_preset: "Theme Preset",
        theme_light: "Light",
        theme_dark: "Dark",
        theme_custom: "Custom",
        theme_primary: "Primary Color",
        theme_bg: "Background Color",
        theme_text: "Text Color",
        save_skin: "Save Skin"
    }
};

// 语言包扩展：基于英文回退，避免漏翻导致空白
i18n.es = {
    ...i18n.en,
    app_title: "Ada Chat Dev V1.0 · Multimodal",
    settings: "⚙️ Configuración",
    language: "Idioma",
    save_language: "Guardar idioma",
    skin_mode: "Tema",
    skin_mode_desc: "Elige un tema o personaliza colores.",
    theme_preset: "Tema predefinido",
    theme_light: "Claro",
    theme_dark: "Oscuro",
    theme_custom: "Personalizado",
    save_skin: "Guardar tema",
    debug_mode: "Modo depuración"
};

i18n.ja = {
    ...i18n.en,
    app_title: "Ada Chat Dev V1.0 · マルチモーダル",
    settings: "⚙️ 設定",
    language: "言語",
    save_language: "言語を保存",
    skin_mode: "スキンモード",
    skin_mode_desc: "テーマを選択するか、色をカスタマイズします。",
    theme_preset: "テーマプリセット",
    theme_light: "ライト",
    theme_dark: "ダーク",
    theme_custom: "カスタム",
    save_skin: "スキンを保存",
    debug_mode: "デバッグモード"
};

let currentLanguage = 'zh';

// ---------- 工具函数 ----------
function $(id) {
    return document.getElementById(id);
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderInlineMd(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    return html;
}

function markdownToHtml(md) {
    const lines = String(md || '').split(/\r?\n/);
    let html = '';
    let inList = false;
    let inCode = false;
    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (line.startsWith('```')) {
            if (!inCode) {
                if (inList) { html += '</ul>'; inList = false; }
                html += '<pre><code>';
                inCode = true;
            } else {
                html += '</code></pre>';
                inCode = false;
            }
            continue;
        }
        if (inCode) {
            html += `${escapeHtml(rawLine)}\n`;
            continue;
        }
        const t = line.trim();
        if (!t) {
            if (inList) { html += '</ul>'; inList = false; }
            continue;
        }
        if (t.startsWith('## ')) {
            if (inList) { html += '</ul>'; inList = false; }
            html += `<h3>${renderInlineMd(t.slice(3))}</h3>`;
            continue;
        }
        if (t.startsWith('### ')) {
            if (inList) { html += '</ul>'; inList = false; }
            html += `<h4>${renderInlineMd(t.slice(4))}</h4>`;
            continue;
        }
        if (t.startsWith('- ')) {
            if (!inList) { html += '<ul>'; inList = true; }
            html += `<li>${renderInlineMd(t.slice(2))}</li>`;
            continue;
        }
        if (inList) { html += '</ul>'; inList = false; }
        html += `<p>${renderInlineMd(t)}</p>`;
    }
    if (inList) html += '</ul>';
    if (inCode) html += '</code></pre>';
    return html;
}

function getHelpMarkdown() {
    if (currentLanguage === 'zh') {
        return `
## 模块使用说明

### 1) 对话与输入
- 输入消息后按 \`Enter\` 发送，\`Ctrl+Enter\` 换行。
- 上传图片后输入框显示 \`[图片]\`，聊天历史显示图片预览。
- 支持任务分类：对话、编程、图像、视频、OCR、图像理解、翻译。

### 2) 供应商与模型
- 设置 -> 新增供应商：填写 \`Base URL\`、\`API Key\`、各接口路径。
- 在供应商编辑页点击“获取最新模型”，勾选后保存。
- 模型类型管理中给模型分配类别，否则前台无法按分类筛选。

### 3) 自动切换与预设
- 自动切换可在模型限流时切到下一个候选模型。
- 预设管理：系统预设用于聊天，角色预设用于图像任务。
- 文生图单词转换可把短词扩展成完整 Prompt。

### 4) 聊天身份与皮肤
- 聊天身份可修改玩家/AI 昵称、头像 URL、AI 对玩家称呼。
- 皮肤模式支持浅色、深色和自定义主题。

### 5) 调试模式
- 可导出脱敏日志，支持命令：\`help\`、\`stats\`、\`diag\`、\`route\`。
- 问题排查建议先执行 \`diag 120\` 后再导出日志。
`;
    }
    return `
## Module Guide

### 1) Chat Input
- Press \`Enter\` to send, \`Ctrl+Enter\` for newline.
- After upload, input shows \`[image]\` while chat history renders image preview.
- Task categories: chat, coding, image, video, OCR, vision, translation.

### 2) Providers & Models
- Settings -> Add Provider: configure \`Base URL\`, \`API Key\`, and paths.
- Fetch models, then check and save.
- Assign model types in Model Type Manager for category filtering.

### 3) Auto Switch & Presets
- Auto-switch changes model when rate-limited.
- System presets for chat; role presets for image tasks.
- Word conversion expands short prompts for image generation.

### 4) Profiles & Skin
- Configure player/AI names, avatar URLs, and AI user addressing.
- Skin mode supports light, dark, and custom themes.

### 5) Debug Mode
- Export redacted logs; commands include \`help\`, \`stats\`, \`diag\`, \`route\`.
- Run \`diag 120\` first when reporting issues.
`;
}

function openHelpModal() {
    const modal = $('helpModal');
    const content = $('helpContent');
    if (!modal || !content) return;
    content.innerHTML = markdownToHtml(getHelpMarkdown());
    modal.classList.add('show-floating');
}

function closeHelpModal() {
    const modal = $('helpModal');
    if (!modal) return;
    modal.classList.remove('show-floating');
}

function initHelpWindowDrag() {
    const header = $('helpDragHeader');
    const win = $('helpWindow');
    if (!header || !win) return;
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    header.addEventListener('mousedown', (e) => {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = win.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const left = Math.max(0, startLeft + (e.clientX - startX));
        const top = Math.max(0, startTop + (e.clientY - startY));
        win.style.left = `${left}px`;
        win.style.top = `${top}px`;
    });

    window.addEventListener('mouseup', () => {
        dragging = false;
    });
}

function isDebugModeEnabled() {
    return localStorage.getItem(DEBUG_MODE_KEY) === 'true';
}

function loadDebugLogs() {
    try {
        const saved = localStorage.getItem(DEBUG_LOGS_KEY);
        debugLogs = saved ? JSON.parse(saved) : [];
        if (!Array.isArray(debugLogs)) debugLogs = [];
    } catch {
        debugLogs = [];
    }
}

function saveDebugLogs() {
    localStorage.setItem(DEBUG_LOGS_KEY, JSON.stringify(debugLogs));
}

function sanitizeErrorMessage(msg) {
    if (!msg) return '';
    return String(msg)
        .replace(/sk-[a-zA-Z0-9_-]{8,}/g, 'sk-***')
        .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ***')
        .slice(0, 300);
}

function summarizeRequestBody(body) {
    let hasImage = false;
    if (Array.isArray(body.messages)) {
        hasImage = body.messages.some(m => Array.isArray(m.content) &&
            m.content.some(c => c && c.type === 'image_url'));
    }
    if (body.image) hasImage = true;
    return {
        model: body.model,
        task: body.task,
        stream: !!body.stream,
        prompt_length: (body.prompt || '').length,
        message_count: Array.isArray(body.messages) ? body.messages.length : 0,
        has_image: hasImage
    };
}

function addDebugLog(event, data = {}, level = 'info') {
    if (!isDebugModeEnabled()) return;
    const entry = {
        ts: new Date().toISOString(),
        event,
        level,
        ...data
    };
    debugLogs.push(entry);
    if (debugLogs.length > DEBUG_MAX_LOGS) {
        debugLogs = debugLogs.slice(-DEBUG_MAX_LOGS);
    }
    saveDebugLogs();
    if ($('debugPanel') && $('debugPanel').style.display !== 'none') {
        renderDebugLogs();
    }
}

function renderDebugLogs() {
    const logEl = $('debugLogList');
    const countEl = $('debugLogCount');
    if (!logEl || !countEl) return;
    countEl.textContent = `${debugLogs.length} logs`;
    const lines = [...debugLogs].reverse().map(item => JSON.stringify(item));
    logEl.textContent = lines.length ? lines.join('\n') : '[]';
}

function toggleDebugMode(checkbox) {
    const enabled = !!checkbox.checked;
    localStorage.setItem(DEBUG_MODE_KEY, enabled ? 'true' : 'false');
    if (enabled) {
        addDebugLog('debug_mode_enabled', { message: 'debug mode enabled' });
    }
    renderDebugLogs();
}

function exportDebugLogs() {
    if (debugLogs.length === 0) {
        alert(i18n[currentLanguage].debug_export_empty);
        return;
    }
    const data = JSON.stringify(debugLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adachat-debug-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function clearDebugLogs() {
    debugLogs = [];
    saveDebugLogs();
    renderDebugLogs();
    alert(i18n[currentLanguage].debug_cleared);
}

function refreshDebugLogs() {
    loadDebugLogs();
    renderDebugLogs();
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return null;
    return {
        r: parseInt(m[1], 16),
        g: parseInt(m[2], 16),
        b: parseInt(m[3], 16)
    };
}

function rgbToHex(r, g, b) {
    return `#${[r, g, b].map(v => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function shiftColor(hex, amount) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(rgb.r + amount, rgb.g + amount, rgb.b + amount);
}

function mixColor(hex1, hex2, ratio = 0.5) {
    const a = hexToRgb(hex1);
    const b = hexToRgb(hex2);
    if (!a || !b) return hex1;
    const t = clamp(ratio, 0, 1);
    return rgbToHex(
        Math.round(a.r + (b.r - a.r) * t),
        Math.round(a.g + (b.g - a.g) * t),
        Math.round(a.b + (b.b - a.b) * t)
    );
}

function getDefaultThemeSettings() {
    return {
        preset: 'light',
        primary: '#10b981',
        bg: '#f9fafc',
        text: '#1e293b'
    };
}

function getDefaultRagSettings() {
    return {
        enabled: false,
        topK: 4,
        maxChars: 1800
    };
}

let ragSettings = getDefaultRagSettings();
let ragStore = { version: 1, docs: [] };
let ragIndex = [];
let ragIdfMap = {};

function loadRagSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(RAG_SETTINGS_KEY) || 'null');
        ragSettings = { ...getDefaultRagSettings(), ...(saved || {}) };
    } catch {
        ragSettings = getDefaultRagSettings();
    }
}

function saveRagSettingsToLocal() {
    localStorage.setItem(RAG_SETTINGS_KEY, JSON.stringify(ragSettings));
}

function loadRagStore() {
    try {
        const saved = JSON.parse(localStorage.getItem(RAG_STORE_KEY) || 'null');
        if (saved && Array.isArray(saved.docs)) {
            ragStore = { version: 1, docs: saved.docs };
        } else {
            ragStore = { version: 1, docs: [] };
        }
    } catch {
        ragStore = { version: 1, docs: [] };
    }
}

function saveRagStore() {
    localStorage.setItem(RAG_STORE_KEY, JSON.stringify(ragStore));
}

function tokenizeRagText(text) {
    if (!text) return [];
    const lower = String(text).toLowerCase();
    const enWords = lower.match(/[a-z0-9_]{2,}/g) || [];
    const zhChars = lower.match(/[\u4e00-\u9fa5]/g) || [];
    return enWords.concat(zhChars);
}

function buildTfMap(tokens) {
    const tf = Object.create(null);
    for (const token of tokens) {
        tf[token] = (tf[token] || 0) + 1;
    }
    return tf;
}

function splitIntoRagChunks(text, chunkSize = 900, overlap = 180) {
    const chunks = [];
    const clean = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!clean) return chunks;
    let start = 0;
    while (start < clean.length) {
        const end = Math.min(clean.length, start + chunkSize);
        const part = clean.slice(start, end).trim();
        if (part.length > 20) chunks.push(part);
        if (end >= clean.length) break;
        start = Math.max(end - overlap, start + 1);
    }
    return chunks;
}

function rebuildRagIndex() {
    ragIndex = [];
    ragIdfMap = {};
    const df = Object.create(null);
    const totalDocs = Array.isArray(ragStore.docs) ? ragStore.docs.length : 0;
    if (!totalDocs) return;

    ragStore.docs.forEach(doc => {
        (doc.chunks || []).forEach((chunkText, idx) => {
            const tokens = tokenizeRagText(chunkText);
            const tf = buildTfMap(tokens);
            const unique = new Set(tokens);
            unique.forEach(token => {
                df[token] = (df[token] || 0) + 1;
            });
            ragIndex.push({
                id: `${doc.id}_${idx}`,
                docId: doc.id,
                docName: doc.name,
                chunkIndex: idx,
                text: chunkText,
                tf
            });
        });
    });

    Object.keys(df).forEach(token => {
        ragIdfMap[token] = Math.log((1 + totalDocs) / (1 + df[token])) + 1;
    });
}

function retrieveRagChunks(query) {
    const tokens = tokenizeRagText(query);
    if (!tokens.length || !ragIndex.length) return [];
    const qtf = buildTfMap(tokens);
    const scored = [];
    for (const item of ragIndex) {
        let score = 0;
        for (const token of Object.keys(qtf)) {
            const tf = item.tf[token] || 0;
            if (!tf) continue;
            score += (1 + Math.log(tf)) * (ragIdfMap[token] || 1) * qtf[token];
        }
        if (score > 0) scored.push({ ...item, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(1, parseInt(ragSettings.topK, 10) || 4));
}

function buildRagSystemPrompt(userText) {
    if (!ragSettings.enabled) return null;
    const top = retrieveRagChunks(userText || '');
    if (!top.length) return null;
    const maxChars = Math.max(600, parseInt(ragSettings.maxChars, 10) || 1800);
    let used = 0;
    const refs = [];
    for (const chunk of top) {
        const snippet = chunk.text.trim();
        if (!snippet) continue;
        if (used + snippet.length > maxChars) break;
        used += snippet.length;
        refs.push(`【来源:${chunk.docName}#${chunk.chunkIndex + 1}】\n${snippet}`);
    }
    if (!refs.length) return null;
    return (
        "以下是从本地知识库检索到的参考资料。回答时请优先参考这些内容；若资料不足，请明确说明并给出保守结论。\n\n" +
        refs.join("\n\n")
    );
}

function renderRagDocList() {
    const listEl = $('ragDocList');
    const statsEl = $('ragStats');
    if (!listEl || !statsEl) return;
    const docs = ragStore.docs || [];
    const chunkCount = docs.reduce((sum, d) => sum + (d.chunks?.length || 0), 0);
    statsEl.textContent = `${i18n[currentLanguage].rag_docs_count}: ${docs.length} · ${i18n[currentLanguage].rag_chunks_count}: ${chunkCount}`;

    if (!docs.length) {
        listEl.innerHTML = `<div class="hint">${i18n[currentLanguage].rag_docs_empty}</div>`;
        return;
    }

    listEl.innerHTML = docs.map(doc => {
        const charCount = (doc.chunks || []).reduce((s, t) => s + t.length, 0);
        return `
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; padding:10px 12px; border:1px solid var(--border); border-radius:var(--radius-md); margin-bottom:8px;">
                <div>
                    <div style="font-weight:600;">${escapeHtml(doc.name)}</div>
                    <div class="hint" style="font-size:12px;">${doc.chunks?.length || 0} chunks · ${charCount} chars</div>
                </div>
                <button class="deselect-all-btn" onclick="deleteRagDoc('${escapeHtml(doc.id)}')">🗑️</button>
            </div>
        `;
    }).join('');
}

function showRagSettings() {
    hideAllPanels();
    const panel = $('ragPanel');
    if (panel) panel.style.display = 'block';
    $('settingsContentTitle').textContent = i18n[currentLanguage].rag_knowledge;
    if ($('ragEnable')) $('ragEnable').checked = !!ragSettings.enabled;
    if ($('ragTopK')) $('ragTopK').value = ragSettings.topK || 4;
    if ($('ragMaxChars')) $('ragMaxChars').value = ragSettings.maxChars || 1800;
    renderRagDocList();
}

function saveRagSettings() {
    ragSettings.enabled = !!$('ragEnable')?.checked;
    ragSettings.topK = Math.max(1, Math.min(10, parseInt($('ragTopK')?.value, 10) || 4));
    ragSettings.maxChars = Math.max(600, Math.min(5000, parseInt($('ragMaxChars')?.value, 10) || 1800));
    saveRagSettingsToLocal();
    alert(i18n[currentLanguage].rag_saved);
}

async function importRagFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const acceptedExt = ['txt', 'md', 'json', 'csv', 'log'];
    let imported = 0;

    for (const file of files) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!acceptedExt.includes(ext)) continue;
        if (file.size > RAG_MAX_FILE_BYTES) continue;
        const raw = await file.text();
        const text = String(raw || '').trim();
        if (!text) continue;

        const chunks = splitIntoRagChunks(text);
        if (!chunks.length) continue;

        const id = `rag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const existingIndex = (ragStore.docs || []).findIndex(d => d.name === file.name);
        const doc = { id, name: file.name, chunks, updatedAt: Date.now() };
        if (existingIndex >= 0) ragStore.docs[existingIndex] = doc;
        else ragStore.docs.push(doc);
        imported++;
    }

    if (!imported) {
        alert(i18n[currentLanguage].rag_import_none);
        return;
    }
    saveRagStore();
    rebuildRagIndex();
    renderRagDocList();
    alert(`${i18n[currentLanguage].rag_import_done}: ${imported}`);
}

function deleteRagDoc(docId) {
    if (!confirm(i18n[currentLanguage].rag_delete_doc_confirm)) return;
    ragStore.docs = (ragStore.docs || []).filter(d => d.id !== docId);
    saveRagStore();
    rebuildRagIndex();
    renderRagDocList();
}

function clearRagKnowledge() {
    ragStore.docs = [];
    saveRagStore();
    rebuildRagIndex();
    renderRagDocList();
}

function getDefaultChatProfile() {
    return {
        user: { name: '你', avatar: '' },
        assistant: { name: 'Ada', avatar: '', callUserAs: '' }
    };
}

function loadChatProfileSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(CHAT_PROFILE_KEY) || 'null');
        const def = getDefaultChatProfile();
        return {
            user: { ...def.user, ...(saved?.user || {}) },
            assistant: { ...def.assistant, ...(saved?.assistant || {}) }
        };
    } catch {
        return getDefaultChatProfile();
    }
}

function saveChatProfileSettings(profile) {
    localStorage.setItem(CHAT_PROFILE_KEY, JSON.stringify(profile));
}

function getRoleProfile(role) {
    const profile = loadChatProfileSettings();
    return role === 'user' ? profile.user : profile.assistant;
}

function getPreferredUserAddress() {
    const profile = loadChatProfileSettings();
    const custom = (profile.assistant?.callUserAs || '').trim();
    if (custom) return custom;
    return (profile.user?.name || '').trim() || '用户';
}

function isValidAvatarUrl(url) {
    if (!url) return false;
    const s = String(url).trim();
    return /^https?:\/\/.+/i.test(s) || s.startsWith('data:image/');
}

function setProfileAvatarPreview(inputId, previewId, fallbackEmoji) {
    const input = $(inputId);
    const preview = $(previewId);
    if (!preview) return;
    const avatarUrl = (input?.value || '').trim();
    if (isValidAvatarUrl(avatarUrl)) {
        preview.src = avatarUrl;
        preview.style.display = 'block';
        return;
    }
    preview.removeAttribute('src');
    preview.style.display = 'none';
    preview.setAttribute('data-fallback', fallbackEmoji || '');
}

function refreshProfileAvatarPreviews() {
    setProfileAvatarPreview('playerAvatar', 'playerAvatarPreview', '🙂');
    setProfileAvatarPreview('aiAvatar', 'aiAvatarPreview', '🤖');
}

function compressImageFileToDataUrl(file, maxBytes = PROFILE_AVATAR_MAX_BYTES) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read_failed'));
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error('image_decode_failed'));
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                const maxSide = 1024;
                if (Math.max(width, height) > maxSide) {
                    const ratio = maxSide / Math.max(width, height);
                    width = Math.max(1, Math.round(width * ratio));
                    height = Math.max(1, Math.round(height * ratio));
                }

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('canvas_ctx_failed'));
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                let quality = 0.9;
                let result = canvas.toDataURL('image/jpeg', quality);
                while (result.length > maxBytes * 1.37 && quality > 0.2) {
                    quality -= 0.1;
                    result = canvas.toDataURL('image/jpeg', quality);
                }
                resolve(result);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function uploadProfileAvatar(role, inputEl) {
    const file = inputEl?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert(i18n[currentLanguage]?.avatar_file_invalid || i18n.en.avatar_file_invalid);
        inputEl.value = '';
        return;
    }
    try {
        const compressedDataUrl = await compressImageFileToDataUrl(file, PROFILE_AVATAR_MAX_BYTES);
        const targetId = role === 'assistant' ? 'aiAvatar' : 'playerAvatar';
        const targetInput = $(targetId);
        if (targetInput) targetInput.value = compressedDataUrl;
        refreshProfileAvatarPreviews();
        alert(`${i18n[currentLanguage]?.avatar_upload_success || i18n.en.avatar_upload_success} (${Math.round(compressedDataUrl.length / 1.37 / 1024)} KB)`);
    } catch (err) {
        console.error('Avatar upload failed:', err);
        alert(i18n[currentLanguage]?.avatar_upload_failed || i18n.en.avatar_upload_failed);
    } finally {
        inputEl.value = '';
    }
}

function buildMessageRow(msg) {
    const roleKey = msg.role === 'user' ? 'user' : 'assistant';
    const profile = getRoleProfile(roleKey);
    const row = document.createElement('div');
    row.className = `msg-row ${roleKey === 'user' ? 'user-row' : 'ai-row'}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    if (isValidAvatarUrl(profile.avatar)) {
        avatar.style.backgroundImage = `url("${profile.avatar}")`;
        avatar.textContent = '';
    } else {
        avatar.textContent = roleKey === 'user' ? '🙂' : '🤖';
    }

    const wrap = document.createElement('div');
    wrap.className = 'msg-bubble-wrap';

    const name = document.createElement('div');
    name.className = 'msg-name';
    name.textContent = profile.name || (roleKey === 'user' ? 'You' : 'Assistant');

    const bubble = document.createElement('div');
    bubble.className = roleKey === 'user' ? 'user' : 'ai';

    const contentEl = document.createElement('div');
    contentEl.className = 'msg-content';
    renderMessageContentTo(contentEl, msg);
    bubble.appendChild(contentEl);

    wrap.appendChild(name);
    wrap.appendChild(bubble);
    row.appendChild(avatar);
    row.appendChild(wrap);

    return { row, bubble, contentEl };
}

function renderMessageContentTo(contentEl, msg) {
    contentEl.innerHTML = '';
    const content = msg?.content || '';
    const userImage = msg?.role === 'user' && msg?.image;
    if (typeof content === 'string' && content.startsWith('生成图片：')) {
        const imgUrl = content.substring(5);
        const img = document.createElement('img');
        img.src = imgUrl;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '400px';
        img.style.border = '1px solid #10b981';
        img.style.borderRadius = '12px';
        contentEl.appendChild(img);
    } else if (userImage) {
        const cleanText = String(content).replace(/\[图片\]/g, '').trim();
        if (cleanText) {
            const textDiv = document.createElement('div');
            textDiv.textContent = cleanText;
            textDiv.style.marginBottom = '8px';
            contentEl.appendChild(textDiv);
        }
        const img = document.createElement('img');
        img.src = msg.image;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '320px';
        img.style.border = '1px solid #10b981';
        img.style.borderRadius = '12px';
        contentEl.appendChild(img);
    } else {
        contentEl.textContent = content || '';
    }
}

function loadThemeSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(THEME_SETTINGS_KEY) || 'null');
        return { ...getDefaultThemeSettings(), ...(saved || {}) };
    } catch {
        return getDefaultThemeSettings();
    }
}

function applyThemeSettings(settings) {
    const body = document.body;
    if (!body) return;
    const root = document.documentElement;
    const s = { ...getDefaultThemeSettings(), ...(settings || {}) };

    if (s.preset === 'dark') {
        body.setAttribute('data-theme', 'dark');
        root.style.removeProperty('--primary');
        root.style.removeProperty('--primary-dark');
        root.style.removeProperty('--primary-light');
        root.style.removeProperty('--bg');
        root.style.removeProperty('--bg-light');
        root.style.removeProperty('--text');
        root.style.removeProperty('--text-light');
        root.style.removeProperty('--body-bg-start');
        root.style.removeProperty('--body-bg-end');
        root.style.removeProperty('--surface-muted');
        return;
    }

    if (s.preset === 'custom') {
        body.setAttribute('data-theme', 'custom');
        const primary = s.primary || '#10b981';
        const bg = s.bg || '#f9fafc';
        const text = s.text || '#1e293b';
        root.style.setProperty('--primary', primary);
        root.style.setProperty('--primary-dark', shiftColor(primary, -26));
        root.style.setProperty('--primary-light', shiftColor(primary, 22));
        root.style.setProperty('--bg', bg);
        root.style.setProperty('--bg-light', mixColor(bg, '#ffffff', 0.7));
        root.style.setProperty('--border', mixColor(bg, '#64748b', 0.25));
        root.style.setProperty('--border-dark', mixColor(bg, '#334155', 0.35));
        root.style.setProperty('--text', text);
        root.style.setProperty('--text-light', mixColor(text, '#94a3b8', 0.55));
        root.style.setProperty('--body-bg-start', mixColor(bg, '#ffffff', 0.3));
        root.style.setProperty('--body-bg-end', mixColor(bg, '#cbd5e1', 0.35));
        root.style.setProperty('--surface-muted', mixColor(bg, '#e2e8f0', 0.45));
        return;
    }

    body.setAttribute('data-theme', 'light');
    root.style.removeProperty('--primary');
    root.style.removeProperty('--primary-dark');
    root.style.removeProperty('--primary-light');
    root.style.removeProperty('--bg');
    root.style.removeProperty('--bg-light');
    root.style.removeProperty('--border');
    root.style.removeProperty('--border-dark');
    root.style.removeProperty('--text');
    root.style.removeProperty('--text-light');
    root.style.removeProperty('--body-bg-start');
    root.style.removeProperty('--body-bg-end');
    root.style.removeProperty('--surface-muted');
}

function onThemePresetChange() {
    const preset = $('themePreset')?.value || 'light';
    const disabled = preset !== 'custom';
    ['themePrimary', 'themeBg', 'themeText'].forEach(id => {
        const el = $(id);
        if (el) el.disabled = disabled;
    });
}

function showSkinSettings() {
    hideAllPanels();
    const panel = $('skinPanel');
    if (panel) panel.style.display = 'block';
    $('settingsContentTitle').textContent = i18n[currentLanguage].skin_mode;

    const s = loadThemeSettings();
    if ($('themePreset')) $('themePreset').value = s.preset;
    if ($('themePrimary')) $('themePrimary').value = s.primary;
    if ($('themeBg')) $('themeBg').value = s.bg;
    if ($('themeText')) $('themeText').value = s.text;
    onThemePresetChange();
}

function saveSkinSettings() {
    const settings = {
        preset: $('themePreset')?.value || 'light',
        primary: $('themePrimary')?.value || '#10b981',
        bg: $('themeBg')?.value || '#f9fafc',
        text: $('themeText')?.value || '#1e293b'
    };
    localStorage.setItem(THEME_SETTINGS_KEY, JSON.stringify(settings));
    applyThemeSettings(settings);
    alert(i18n[currentLanguage].save_skin || 'Skin saved');
}

function getDebugHelpText() {
    return [
        'Debug Commands',
        '------------------------------',
        'help                  显示帮助',
        'stats                 显示日志统计',
        'explain [n]           输出问题翻译（定位到模块+建议）',
        'route [n]             输出项目内排查路径（文件+步骤）',
        'last [n]              查看最近 n 条日志（默认 10）',
        'errors [n]            查看最近 n 条错误日志（默认 20）',
        'find <keyword>        搜索关键词（event/message/model）',
        'diag [n]              生成诊断码 + 问题翻译（默认 120）',
        'export                导出 JSON 日志',
        'clear                 清空日志',
        'mode on|off           开关调试模式'
    ].join('\n');
}

function writeDebugCommandOutput(text) {
    const out = $('debugCommandOutput');
    if (!out) return;
    out.textContent = text;
}

function computeDiagnostics(logs) {
    const metrics = {
        total: logs.length,
        errors: 0,
        retries: 0,
        switches: 0,
        blocked: 0,
        timeoutErrors: 0,
        streamNoSuccess: 0
    };
    const byRequest = {};
    logs.forEach(l => {
        const rid = l.request_id || 'unknown';
        if (!byRequest[rid]) byRequest[rid] = { hasStart: false, hasSuccess: false, hasError: false, hasEnd: false };
        if (l.event === 'request_start') byRequest[rid].hasStart = true;
        if (l.event === 'request_success') byRequest[rid].hasSuccess = true;
        if (l.event === 'request_error') byRequest[rid].hasError = true;
        if (l.event === 'request_end') byRequest[rid].hasEnd = true;
        if (l.event === 'request_error') metrics.errors++;
        if (l.event === 'request_retry') metrics.retries++;
        if (l.event === 'model_switch') metrics.switches++;
        if (l.event === 'request_blocked_by_plugin') metrics.blocked++;
        if (l.event === 'request_error' && /timeout|超时/i.test(String(l.message || ''))) metrics.timeoutErrors++;
    });

    Object.values(byRequest).forEach(v => {
        if (v.hasStart && !v.hasSuccess && !v.hasError && v.hasEnd) {
            metrics.streamNoSuccess++;
        }
    });

    const flags = [];
    if (metrics.errors > 0) flags.push('ERR');
    if (metrics.timeoutErrors > 0) flags.push('TO');
    if (metrics.retries > 0 || metrics.switches > 0) flags.push('RL');
    if (metrics.streamNoSuccess > 0) flags.push('ST');
    if (metrics.blocked > 0) flags.push('PLG');
    if (flags.length === 0) flags.push('OK');

    const hashBase = `${metrics.total}|${metrics.errors}|${metrics.retries}|${metrics.switches}|${metrics.timeoutErrors}|${metrics.blocked}|${metrics.streamNoSuccess}`;
    let hash = 0;
    for (let i = 0; i < hashBase.length; i++) {
        hash = ((hash << 5) - hash) + hashBase.charCodeAt(i);
        hash |= 0;
    }
    const shortHash = Math.abs(hash).toString(16).toUpperCase().padStart(6, '0').slice(0, 6);
    const code = `ADA-DBG-${flags.join('-')}-${shortHash}`;
    return { code, metrics, flags };
}

function translateProblem(logs) {
    const lastError = [...logs].reverse().find(l => l.event === 'request_error' || l.level === 'error');
    const lastResponse = [...logs].reverse().find(l => l.event === 'response_received');
    const hasPluginBlock = logs.some(l => l.event === 'request_blocked_by_plugin');

    if (hasPluginBlock) {
        return {
            where: '插件层（beforeSend 钩子）',
            issue: '请求被插件拦截',
            evidence: '存在 request_blocked_by_plugin 事件',
            suggestion: '在设置里禁用最近启用的插件，或检查插件 beforeSend 返回值'
        };
    }

    if (lastError) {
        const msg = String(lastError.message || '').toLowerCase();
        if (/timeout|超时/.test(msg)) {
            return {
                where: '网络层 / 上游模型响应链路',
                issue: '请求超时',
                evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
                suggestion: '增大超时设置，或切换更稳定模型/供应商'
            };
        }
        if (/http error 401|401|unauthorized|invalid api key|api key/.test(msg)) {
            return {
                where: '供应商鉴权（API Key）',
                issue: '鉴权失败',
                evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
                suggestion: '检查供应商 API Key、Base URL、路径是否匹配'
            };
        }
        if (/http error 403|403|forbidden/.test(msg)) {
            return {
                where: '供应商权限/账号策略',
                issue: '无权限访问模型或接口',
                evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
                suggestion: '检查账号权限、模型白名单、企业策略限制'
            };
        }
        if (/http error 404|404|not found/.test(msg)) {
            return {
                where: 'API 路径配置',
                issue: '请求路径不存在',
                evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
                suggestion: '检查 chat/models/image 路径配置是否与供应商文档一致'
            };
        }
        if (/http error 429|429|rate limit|quota|exceeded|limit/.test(msg)) {
            return {
                where: '上游模型限流',
                issue: '触发频率或配额限制',
                evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
                suggestion: '开启自动切换、降低并发、检查余额与配额'
            };
        }
        if (/http error 5\d\d|502|503|504|upstream|bad gateway/.test(msg)) {
            return {
                where: '上游服务可用性',
                issue: '供应商服务异常',
                evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
                suggestion: '稍后重试，或切换到备用供应商'
            };
        }
        return {
            where: '请求执行链路（前端->代理->上游）',
            issue: '出现未分类错误',
            evidence: `错误信息: ${sanitizeErrorMessage(lastError.message || '')}`,
            suggestion: '导出日志并提供给维护者进一步定位'
        };
    }

    if (lastResponse && Number(lastResponse.status) >= 400) {
        return {
            where: 'HTTP 响应阶段',
            issue: `响应状态异常 (${lastResponse.status})`,
            evidence: `最后状态码: ${lastResponse.status}`,
            suggestion: '优先检查供应商配置、模型权限和网络连通性'
        };
    }

    const d = computeDiagnostics(logs);
    if (d.metrics.streamNoSuccess > 0) {
        return {
            where: '流式渲染阶段（前端）',
            issue: '流结束但未确认成功',
            evidence: `streamNoSuccess=${d.metrics.streamNoSuccess}`,
            suggestion: '检查浏览器控制台、网络中断、SSE 数据格式'
        };
    }

    return {
        where: '未发现明确故障点',
        issue: '当前日志中无显著异常',
        evidence: '未检出 error / 非 2xx / 插件拦截',
        suggestion: '若仍异常，请复现后立即导出日志再分析'
    };
}

function getTroubleshootRoute(t) {
    const text = `${t.where} ${t.issue}`.toLowerCase();
    if (text.includes('插件')) {
        return [
            '定位路径: 前端插件钩子',
            '1) 在设置 -> 插件管理中禁用最近启用插件',
            '2) 检查插件 beforeSend 是否返回 false',
            '3) 关键文件: plugins/*/*.js, script.js (PluginSystem.runHook)'
        ];
    }
    if (text.includes('鉴权') || text.includes('401') || text.includes('权限') || text.includes('403')) {
        return [
            '定位路径: 供应商配置与鉴权',
            '1) 设置 -> 供应商列表 -> 检查 API Key / Base URL / 路径',
            '2) 确认模型权限与账号额度',
            '3) 关键文件: ai_proxy.php, AI.php (供应商设置)'
        ];
    }
    if (text.includes('路径') || text.includes('404')) {
        return [
            '定位路径: API 路径配置',
            '1) 设置 -> 供应商列表 -> 校验 chat/models/image/video 路径',
            '2) 对照供应商文档确认 endpoint',
            '3) 关键文件: ai_proxy.php, AI.php'
        ];
    }
    if (text.includes('限流') || text.includes('429') || text.includes('配额')) {
        return [
            '定位路径: 模型限流与切换策略',
            '1) 开启自动切换并配置候选模型顺序',
            '2) 检查模型可用性与余额/配额',
            '3) 关键文件: script.js (auto switch), ai_proxy.php'
        ];
    }
    if (text.includes('超时') || text.includes('网络')) {
        return [
            '定位路径: 网络与超时参数',
            '1) 设置 -> 超时设置，适当提高 total/idle timeout',
            '2) 检查服务器到上游模型的网络连通性',
            '3) 关键文件: script.js (send timeout), ai_proxy.php (上游请求)'
        ];
    }
    if (text.includes('流式') || text.includes('stream')) {
        return [
            '定位路径: 前端流式渲染',
            '1) 检查浏览器网络面板的 SSE 数据是否连续',
            '2) 观察是否有 DONE 但无 content delta',
            '3) 关键文件: script.js (stream parser / appendToLastAIMessage)'
        ];
    }
    if (text.includes('上游服务') || text.includes('5')) {
        return [
            '定位路径: 上游服务稳定性',
            '1) 更换备用供应商/模型验证是否恢复',
            '2) 重试并记录发生时段',
            '3) 关键文件: ai_proxy.php, 供应商后台状态页'
        ];
    }
    return [
        '定位路径: 通用排查',
        '1) 先执行 explain 120 查看最近问题翻译',
        '2) 执行 errors 20 查看最近错误',
        '3) 导出日志后结合 ai_proxy.php 与 script.js 联合排查'
    ];
}

function buildDiagnosticText(logs) {
    const d = computeDiagnostics(logs);
    const t = translateProblem(logs);
    const route = getTroubleshootRoute(t);
    return [
        `Diagnostic Code: ${d.code}`,
        `Flags: ${d.flags.join(', ')}`,
        '',
        '[问题翻译]',
        `问题位置: ${t.where}`,
        `问题类型: ${t.issue}`,
        `证据: ${t.evidence}`,
        `建议: ${t.suggestion}`,
        '',
        '[项目定位路径]',
        ...route,
        '',
        '[统计]',
        JSON.stringify(d.metrics, null, 2)
    ].join('\n');
}

function showDebugHelp() {
    writeDebugCommandOutput(getDebugHelpText());
}

function generateDiagnosticCode(sampleSize = 120) {
    const n = Math.max(10, Math.min(500, parseInt(sampleSize, 10) || 120));
    const sample = debugLogs.slice(-n);
    const report = buildDiagnosticText(sample);
    const d = computeDiagnostics(sample);
    writeDebugCommandOutput(report);
    addDebugLog('diagnostic_generated', {
        code: d.code,
        sample_size: n,
        flags: d.flags
    });
    return d.code;
}

function executeDebugCommand() {
    const input = $('debugCommandInput');
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) {
        showDebugHelp();
        return;
    }
    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg1 = parts[1];

    if (cmd === 'help') {
        showDebugHelp();
    } else if (cmd === 'stats') {
        const d = computeDiagnostics(debugLogs);
        writeDebugCommandOutput(JSON.stringify({
            diagnostic_code: d.code,
            flags: d.flags,
            metrics: d.metrics
        }, null, 2));
    } else if (cmd === 'explain') {
        const n = Math.max(10, Math.min(500, parseInt(arg1 || '120', 10) || 120));
        const sample = debugLogs.slice(-n);
        writeDebugCommandOutput(buildDiagnosticText(sample));
    } else if (cmd === 'route') {
        const n = Math.max(10, Math.min(500, parseInt(arg1 || '120', 10) || 120));
        const sample = debugLogs.slice(-n);
        const t = translateProblem(sample);
        writeDebugCommandOutput(getTroubleshootRoute(t).join('\n'));
    } else if (cmd === 'last') {
        const n = Math.max(1, Math.min(100, parseInt(arg1 || '10', 10) || 10));
        const slice = debugLogs.slice(-n);
        writeDebugCommandOutput(JSON.stringify(slice, null, 2));
    } else if (cmd === 'errors') {
        const n = Math.max(1, Math.min(200, parseInt(arg1 || '20', 10) || 20));
        const errs = debugLogs.filter(l => l.level === 'error' || l.event === 'request_error').slice(-n);
        writeDebugCommandOutput(JSON.stringify(errs, null, 2));
    } else if (cmd === 'find') {
        const keyword = parts.slice(1).join(' ').toLowerCase();
        if (!keyword) {
            writeDebugCommandOutput('Usage: find <keyword>');
        } else {
            const rows = debugLogs.filter(l => {
                return JSON.stringify(l).toLowerCase().includes(keyword);
            }).slice(-120);
            writeDebugCommandOutput(JSON.stringify(rows, null, 2));
        }
    } else if (cmd === 'diag') {
        generateDiagnosticCode(arg1 || '120');
    } else if (cmd === 'export') {
        exportDebugLogs();
        writeDebugCommandOutput('OK: exported logs');
    } else if (cmd === 'clear') {
        clearDebugLogs();
        writeDebugCommandOutput('OK: logs cleared');
    } else if (cmd === 'mode') {
        const mode = (arg1 || '').toLowerCase();
        if (mode !== 'on' && mode !== 'off') {
            writeDebugCommandOutput('Usage: mode on|off');
        } else {
            const enabled = mode === 'on';
            localStorage.setItem(DEBUG_MODE_KEY, enabled ? 'true' : 'false');
            const toggle = $('debugModeToggle');
            if (toggle) toggle.checked = enabled;
            writeDebugCommandOutput(`OK: debug mode ${enabled ? 'enabled' : 'disabled'}`);
        }
    } else {
        writeDebugCommandOutput(`Unknown command: ${cmd}\n\n${getDebugHelpText()}`);
    }
}

function handleDebugCommandKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        executeDebugCommand();
    }
}

function updateUILanguage() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const value =
            (i18n[currentLanguage] && i18n[currentLanguage][key]) ||
            (i18n.en && i18n.en[key]) ||
            null;
        if (value) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                if (el.getAttribute('placeholder') !== null) {
                    el.setAttribute('placeholder', value);
                }
            } else if (el.tagName === 'OPTION') {
                el.textContent = value;
            } else {
                el.textContent = value;
            }
        }
    });
    document.title = (i18n[currentLanguage] && i18n[currentLanguage].app_title) || i18n.en.app_title;
}

// ---------- 文生图单词转换管理 ----------
function loadWordConversions() {
    const saved = localStorage.getItem('word_conversions');
    wordConversions = saved ? JSON.parse(saved) : [
        { id: '1', short: '猫', long: 'A beautiful fluffy cat sitting on a windowsill, sunlight streaming in, soft focus, 4k, highly detailed, photorealistic' },
        { id: '2', short: '狗', long: 'A cute dog playing in a grassy field, golden hour lighting, shallow depth of field, professional photography, 8k' },
        { id: '3', short: '风景', long: 'A breathtaking landscape with mountains, lake, and forest, dramatic sky, sunset colors, ultra wide angle, highly detailed, atmospheric' },
        { id: '4', short: 'cat', long: 'A majestic cat with intricate fur details, studio lighting, professional portrait, 4k, sharp focus, bokeh background' },
        { id: '5', short: 'dog', long: 'A happy dog running through autumn leaves, warm tones, motion blur, professional photography, cinematic composition' }
    ];
}

function saveWordConversions() {
    localStorage.setItem('word_conversions', JSON.stringify(wordConversions));
}

function renderConversionList() {
    const container = $('conversionList');
    if (!container) return;
    
    if (wordConversions.length === 0) {
        container.innerHTML = '<p class="hint" style="padding:20px; text-align:center;">暂无转换规则，请添加</p>';
        return;
    }
    
    container.innerHTML = '';
    wordConversions.forEach(conversion => {
        const item = document.createElement('div');
        item.className = 'conversion-item';
        
        const shortSpan = document.createElement('span');
        shortSpan.className = 'conversion-short';
        shortSpan.textContent = conversion.short;
        
        const longSpan = document.createElement('span');
        longSpan.className = 'conversion-long';
        longSpan.textContent = conversion.long;
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'conversion-actions';
        actionsDiv.innerHTML = `
            <button class="edit-conversion" title="${i18n[currentLanguage].edit}">✏️</button>
            <button class="delete-conversion" title="${i18n[currentLanguage].delete}">🗑️</button>
        `;
        
        actionsDiv.querySelector('.edit-conversion').addEventListener('click', (e) => {
            e.stopPropagation();
            editConversion(conversion.id);
        });
        
        actionsDiv.querySelector('.delete-conversion').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConversion(conversion.id);
        });
        
        item.appendChild(shortSpan);
        item.appendChild(longSpan);
        item.appendChild(actionsDiv);
        container.appendChild(item);
    });
}

function editConversion(id) {
    const conversion = wordConversions.find(c => c.id === id);
    if (conversion) {
        currentEditingConversionId = id;
        $('editingConversionId').value = id;
        $('conversionShort').value = conversion.short;
        $('conversionLong').value = conversion.long;
        
        const titleEl = $('conversionFormTitle');
        if (titleEl) {
            titleEl.textContent = i18n[currentLanguage].add_edit_conversion + ' - ' + conversion.short;
        }
    }
}

function deleteConversion(id) {
    if (!confirm(i18n[currentLanguage].confirm_delete_conversion)) return;
    wordConversions = wordConversions.filter(c => c.id !== id);
    saveWordConversions();
    renderConversionList();
    if (currentEditingConversionId === id) {
        clearConversionForm();
    }
}

function clearConversionForm() {
    currentEditingConversionId = null;
    $('editingConversionId').value = '';
    $('conversionShort').value = '';
    $('conversionLong').value = '';
    
    const titleEl = $('conversionFormTitle');
    if (titleEl) {
        titleEl.textContent = i18n[currentLanguage].add_edit_conversion;
    }
}

function saveConversion() {
    const short = $('conversionShort').value.trim();
    const long = $('conversionLong').value.trim();
    
    if (!short || !long) {
        alert('短词和详细Prompt都不能为空');
        return;
    }
    
    const editingId = $('editingConversionId').value;
    
    if (editingId) {
        // 编辑现有规则
        const conversion = wordConversions.find(c => c.id === editingId);
        if (conversion) {
            conversion.short = short;
            conversion.long = long;
        }
    } else {
        // 新增规则
        const newId = Date.now().toString();
        wordConversions.push({
            id: newId,
            short: short,
            long: long
        });
    }
    
    saveWordConversions();
    renderConversionList();
    clearConversionForm();
    alert(i18n[currentLanguage].conversion_saved);
}

// 新增：应用单词转换函数
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyWordConversion(text) {
    if (!text || wordConversions.length === 0) return text;
    
    let result = text;
    const sortedConversions = [...wordConversions].sort((a, b) => b.short.length - a.short.length);
    
    for (const conversion of sortedConversions) {
        const escaped = escapeRegExp(conversion.short);
        const regex = new RegExp(`\\b${escaped}\\b|(?<=[^a-zA-Z])${escaped}(?=[^a-zA-Z])`, 'g');
        result = result.replace(regex, conversion.long);
    }
    
    return result;
}

// 新增：显示文生图单词转换面板
function showWordConversion() {
    hideAllPanels();
    const panel = $('wordConversionPanel');
    if (panel) {
        panel.style.display = 'block';
        renderConversionList();
        clearConversionForm();
    }
    $('settingsContentTitle').textContent = i18n[currentLanguage].word_conversion;
}

// ---------- 预设管理 ----------
function loadPresets() {
    const saved = localStorage.getItem('ai_presets');
    presets = saved ? JSON.parse(saved) : [
        { id: '1', name: '通用助手', type: 'system', content: '你是一个乐于助人的助手。' },
        { id: '2', name: '写实人像', type: 'role', content: 'A realistic portrait of a person, detailed skin texture, natural lighting, 4k.' }
    ];
    const active = localStorage.getItem('ai_active_preset_ids');
    if (active) {
        currentActivePresetId = JSON.parse(active);
    } else {
        const sys = presets.find(p => p.type === 'system');
        const role = presets.find(p => p.type === 'role');
        currentActivePresetId = { system: sys ? sys.id : null, role: role ? role.id : null };
    }
}

function savePresets() {
    localStorage.setItem('ai_presets', JSON.stringify(presets));
    localStorage.setItem('ai_active_preset_ids', JSON.stringify(currentActivePresetId));
}

function renderPresetList() {
    const container = $('presetList');
    if (!container) return;
    container.innerHTML = '';
    presets.forEach(preset => {
        const item = document.createElement('div');
        item.className = `preset-item ${(preset.type === 'system' && currentActivePresetId.system === preset.id) || (preset.type === 'role' && currentActivePresetId.role === preset.id) ? 'active' : ''}`;
        item.dataset.id = preset.id;
        item.dataset.type = preset.type;
        item.onclick = () => selectPresetForEdit(preset.id);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'preset-name';
        nameSpan.textContent = preset.name;

        const typeSpan = document.createElement('span');
        typeSpan.className = 'preset-type-badge';
        typeSpan.textContent = preset.type === 'system' ? (currentLanguage === 'zh' ? '系统' : 'System') : (currentLanguage === 'zh' ? '角色' : 'Role');

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'preset-actions';
        actionsDiv.innerHTML = `
            <button class="activate-preset" title="${i18n[currentLanguage].activate}">⭐</button>
            <button class="edit-preset" title="${i18n[currentLanguage].edit}">✏️</button>
            <button class="delete-preset" title="${i18n[currentLanguage].delete}">🗑️</button>
        `;
        actionsDiv.querySelector('.activate-preset').addEventListener('click', (e) => { e.stopPropagation(); activatePreset(preset.id, preset.type); });
        actionsDiv.querySelector('.edit-preset').addEventListener('click', (e) => { e.stopPropagation(); selectPresetForEdit(preset.id); });
        actionsDiv.querySelector('.delete-preset').addEventListener('click', (e) => { e.stopPropagation(); deletePreset(preset.id); });

        item.appendChild(nameSpan);
        item.appendChild(typeSpan);
        item.appendChild(actionsDiv);
        container.appendChild(item);
    });
}

function selectPresetForEdit(id) {
    const preset = presets.find(p => p.id === id);
    if (preset) {
        $('editingPresetId').value = preset.id;
        $('presetName').value = preset.name;
        $('presetType').value = preset.type;
        $('presetContent').value = preset.content;
    }
}

function activatePreset(id, type) {
    if (type === 'system') {
        currentActivePresetId.system = id;
    } else if (type === 'role') {
        currentActivePresetId.role = id;
    }
    savePresets();
    renderPresetList();
    alert(i18n[currentLanguage].preset_saved);
}

function deletePreset(id) {
    if (!confirm(i18n[currentLanguage].confirm_delete_preset)) return;
    presets = presets.filter(p => p.id !== id);
    if (currentActivePresetId.system === id) currentActivePresetId.system = null;
    if (currentActivePresetId.role === id) currentActivePresetId.role = null;
    savePresets();
    renderPresetList();
    clearPresetForm();
}

function clearPresetForm() {
    $('editingPresetId').value = '';
    $('presetName').value = '';
    $('presetType').value = 'system';
    $('presetContent').value = '';
}

function savePreset() {
    const id = $('editingPresetId').value;
    const name = $('presetName').value.trim();
    const type = $('presetType').value;
    const content = $('presetContent').value.trim();
    if (!name || !content) {
        alert('名称和内容不能为空');
        return;
    }
    if (id) {
        const preset = presets.find(p => p.id === id);
        if (preset) {
            preset.name = name;
            preset.type = type;
            preset.content = content;
        }
    } else {
        const newId = Date.now().toString();
        presets.push({ id: newId, name, type, content });
        if (type === 'system' && !currentActivePresetId.system) currentActivePresetId.system = newId;
        if (type === 'role' && !currentActivePresetId.role) currentActivePresetId.role = newId;
    }
    savePresets();
    renderPresetList();
    clearPresetForm();
    alert(i18n[currentLanguage].preset_saved);
}

// ---------- 语言设置 ----------
function loadLanguage() {
    const lang = localStorage.getItem('ui_language');
    if (lang && i18n[lang]) {
        currentLanguage = lang;
    }
    updateUILanguage();
    const langSelect = $('languageSelect');
    if (langSelect) langSelect.value = currentLanguage;
}

function saveLanguage() {
    const lang = $('languageSelect').value;
    localStorage.setItem('ui_language', lang);
    currentLanguage = lang;
    updateUILanguage();
    alert(i18n[currentLanguage].language_saved);
    renderPresetList();
    renderConversionList();
}

// ---------- 对话管理 ----------
function loadConversations() {
    const saved = localStorage.getItem('conversations');
    conversations = saved ? JSON.parse(saved) : [{
        id: Date.now().toString(),
        title: '新对话',
        messages: []
    }];
    if (conversations.length === 0) {
        conversations.push({
            id: Date.now().toString(),
            title: '新对话',
            messages: []
        });
    }
    currentConvId = conversations[0].id;
    renderChatList();
    renderCurrentConversation();
}

function saveConversations() {
    localStorage.setItem('conversations', JSON.stringify(conversations));
}

function newChat() {
    if (isReceiving) {
        alert('请等待当前响应完成');
        return;
    }
    const newId = Date.now().toString();
    conversations.unshift({
        id: newId,
        title: '新对话',
        messages: []
    });
    currentConvId = newId;
    saveConversations();
    renderChatList();
    renderCurrentConversation();
}

function deleteChat(e, id) {
    e.stopPropagation();
    if (isReceiving) {
        alert('请等待当前响应完成');
        return;
    }
    if (!confirm('确定删除此对话？')) return;
    conversations = conversations.filter(c => c.id !== id);
    if (conversations.length === 0) {
        newChat();
    } else {
        if (currentConvId === id) {
            currentConvId = conversations[0].id;
        }
        saveConversations();
        renderChatList();
        renderCurrentConversation();
    }
}

function switchChat(id) {
    if (isReceiving) {
        alert('请等待当前响应完成');
        return;
    }
    currentConvId = id;
    renderChatList();
    renderCurrentConversation();
}

function renderChatList() {
    const listEl = $('chatList');
    if (!listEl) return;
    listEl.innerHTML = '';
    conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = `chat-item ${conv.id === currentConvId ? 'active' : ''}`;
        item.onclick = () => switchChat(conv.id);
        const titleSpan = document.createElement('span');
        titleSpan.className = 'chat-title';
        titleSpan.textContent = conv.title;
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-chat';
        delBtn.innerHTML = '✕';
        delBtn.onclick = (e) => deleteChat(e, conv.id);
        item.appendChild(titleSpan);
        item.appendChild(delBtn);
        listEl.appendChild(item);
    });
}

function updateConversationTitle(convId, userMsg) {
    const conv = conversations.find(c => c.id === convId);
    if (conv && conv.title === '新对话' && userMsg) {
        conv.title = userMsg.substring(0, 10) + (userMsg.length > 10 ? '...' : '');
        saveConversations();
        renderChatList();
    }
}

function renderCurrentConversation() {
    const logEl = $('log');
    if (!logEl) return;
    logEl.innerHTML = '';
    const conv = conversations.find(c => c.id === currentConvId);
    if (!conv) return;
    conv.messages.forEach(msg => {
        const built = buildMessageRow(msg);
        logEl.appendChild(built.row);
    });
    logEl.scrollTop = logEl.scrollHeight;
}

function addMessageToCurrent(role, content, convId = currentConvId, extra = {}) {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;
    conv.messages.push({ role, content, ...extra });
    if (role === 'user') {
        updateConversationTitle(convId, content);
    }
    saveConversations();
    if (convId === currentConvId) {
        renderCurrentConversation();
    }
}

function appendToLastAIMessage(chunk, convId = currentConvId) {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;
    if (conv.messages.length === 0 || conv.messages[conv.messages.length-1].role !== 'assistant') {
        conv.messages.push({ role: 'assistant', content: chunk });
    } else {
        conv.messages[conv.messages.length-1].content += chunk;
    }

    // 响应归属会话发生变化时，不更新当前窗口 DOM，避免串会话显示
    if (convId !== currentConvId) {
        saveConversations();
        return;
    }

    const logEl = $('log');
    let lastAiRow = logEl.querySelector('.msg-row.ai-row:last-child');
    let lastAiDiv;
    let lastContentEl;
    if (!lastAiRow) {
        const built = buildMessageRow({ role: 'assistant', content: '' });
        lastAiRow = built.row;
        lastAiDiv = built.bubble;
        lastContentEl = built.contentEl;
        logEl.appendChild(lastAiRow);
    } else {
        lastAiDiv = lastAiRow.querySelector('.ai');
        lastContentEl = lastAiRow.querySelector('.msg-content');
    }

    if (!lastAiDiv || !lastContentEl) return;

    if (chunk.startsWith('生成图片：')) {
        renderMessageContentTo(lastContentEl, { role: 'assistant', content: chunk });
    } else {
        if (lastContentEl.textContent === '') {
            lastContentEl.textContent = chunk;
        } else {
            lastContentEl.textContent += chunk;
        }
    }
    logEl.scrollTop = logEl.scrollHeight;
}

function finishAIMessage(convId = currentConvId) {
    const conv = conversations.find(c => c.id === convId);
    if (conv) {
        saveConversations();
    }
    if (convId === currentConvId) {
        const lastAiDiv = $('log').querySelector('.ai:last-child');
        if (lastAiDiv) {
            lastAiDiv.classList.remove('streaming');
        }
    }
    isReceiving = false;
    $('sendBtn').disabled = false;
}

// ---------- 供应商和模型逻辑 ----------
async function loadProviders() {
    try {
        const res = await fetch('ai_proxy.php?action=get_providers');
        const rawText = await res.text();
        let raw = null;
        try {
            raw = JSON.parse(rawText);
        } catch (_) {
            const maybeHtml = /<\s*!doctype|<\s*html/i.test(rawText);
            const hint = maybeHtml ? '（看起来返回了HTML，可能登录态失效或被重定向）' : '';
            throw new Error('供应商接口返回非 JSON ' + hint);
        }
        providers = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.providers) ? raw.providers : []);
        const providerSelect = $('providerSelect');
        if (!providerSelect) return;
        
        providerSelect.innerHTML = '';
        if (providers.length > 0) {
            providers.forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = p.name;
                providerSelect.appendChild(option);
            });
            providerSelect.value = providers[0].id;
            await loadAllModels();
            filterModelsByCategory();
        } else {
            if (raw && raw.error && /unauthorized/i.test(String(raw.error))) {
                console.warn('供应商接口未授权，可能登录态已失效');
            }
            providerSelect.innerHTML = '<option value="">暂无供应商，请先添加</option>';
        }
    } catch (e) {
        console.error('加载供应商失败', e);
    }
}

async function loadAllModels() {
    try {
        const res = await fetch('ai_proxy.php?action=list_models&_=' + Date.now());
        const data = await res.json();
        window.allModels = data.models || [];
    } catch (e) {
        console.error('加载模型失败', e);
        window.allModels = [];
    }
}

function onCategoryChange() {
    filterModelsByCategory();
    const category = $('category').value;
    const imageMode = $('imageMode')?.value;
    const modeRow = $('modeRow');
    if (modeRow) {
        modeRow.style.display = category === 'image' ? 'flex' : 'none';
    }
    updateUploadAcceptByMode(category, imageMode);
    const msgInput = $('msg');
    if (msgInput) {
        const placeholders = {
            code: i18n[currentLanguage].code_placeholder,
            ocr: i18n[currentLanguage].ocr_placeholder,
            vision: i18n[currentLanguage].vision_placeholder,
            translation: i18n[currentLanguage].translation_placeholder
        };
        msgInput.placeholder = placeholders[category] || i18n[currentLanguage].input_placeholder || '输入提示词... 或将图片拖拽至此 (Enter发送，Ctrl+Enter换行)';
    }
}

function filterModelsByCategory() {
    const category = $('category').value;
    const providerId = $('providerSelect').value;
    if (!providerId) return;

    const modelSelect = $('model');
    if (!modelSelect) return;
    
    modelSelect.innerHTML = '';

    const filtered = (window.allModels || []).filter(m => {
        const [pId] = m.value.split('::');
        return pId === providerId && m.type === category;
    });

    if (filtered.length > 0) {
        filtered.forEach(m => {
            const option = document.createElement('option');
            option.value = m.value;
            option.textContent = m.label;
            modelSelect.appendChild(option);
        });
    } else {
        modelSelect.innerHTML = '<option value="">该类别下无模型</option>';
    }
}

async function onProviderChange() {
    const providerId = $('providerSelect').value;
    if (!providerId) return;
    if (!window.allModels || window.allModels.length === 0) await loadAllModels();
    filterModelsByCategory();
}

// ---------- 拖拽上传与图片压缩 ----------
function getUploadAcceptByMode(category, imageMode) {
    if (MODE_CONFIG.getUploadAccept) {
        return MODE_CONFIG.getUploadAccept(category, imageMode);
    }
    if (category === 'ocr') return OCR_UPLOAD_ACCEPT;
    if (category === 'vision') return IMAGE_UPLOAD_ACCEPT;
    if (category === 'translation') return IMAGE_UPLOAD_ACCEPT;
    if (category === 'image') return imageMode === 'img2img' ? IMAGE_UPLOAD_ACCEPT : '';
    return IMAGE_UPLOAD_ACCEPT;
}

function updateUploadAcceptByMode(category, imageMode) {
    const fileInput = $('file-input');
    const uploadBtn = document.querySelector('.upload-btn');
    if (!fileInput) return;
    const accept = getUploadAcceptByMode(category || $('category')?.value, imageMode || $('imageMode')?.value);
    fileInput.accept = accept;
    if (uploadBtn) {
        uploadBtn.title = accept ? `支持格式: ${accept}` : '当前模式无需上传文件';
    }
}

function isFileAcceptedByMode(file, accept) {
    if (!accept || !file) return false;
    const fileName = String(file.name || '').toLowerCase();
    const mime = String(file.type || '').toLowerCase();
    return accept.split(',').map(s => s.trim().toLowerCase()).some(rule => {
        if (!rule) return false;
        if (rule.startsWith('.')) return fileName.endsWith(rule);
        if (rule.endsWith('/*')) return mime.startsWith(rule.slice(0, -1));
        return mime === rule;
    });
}

function isPdfFile(fileOrMeta) {
    const name = String(fileOrMeta?.name || '').toLowerCase();
    const mime = String(fileOrMeta?.type || '').toLowerCase();
    return name.endsWith('.pdf') || mime === 'application/pdf';
}

async function ensurePdfJsLib() {
    if (window.__pdfjsLibCached) return window.__pdfjsLibCached;
    const mod = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs');
    const lib = mod?.default || mod;
    if (!lib?.getDocument) {
        throw new Error('pdf.js 初始化失败');
    }
    window.__pdfjsLibCached = lib;
    return lib;
}

async function extractTextFromPdf(file) {
    const pdfjsLib = await ensurePdfJsLib();
    if (!pdfjsLib) throw new Error('pdf.js 加载失败');
    if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';
    }
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages || 0;
    let textParts = [];
    for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = (textContent.items || []).map(it => it.str || '').join(' ').trim();
        if (pageText) {
            textParts.push(`--- 第 ${i} 页 ---\n${pageText}`);
        }
    }
    const merged = textParts.join('\n\n').trim();
    return {
        text: merged,
        pageCount
    };
}

async function extractPdfPageImages(file, options = {}) {
    const pdfjsLib = await ensurePdfJsLib();
    if (!pdfjsLib) throw new Error('pdf.js 加载失败');
    if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';
    }
    const maxPages = Number(options.maxPages || 5);
    const targetScale = Number(options.scale || 1.3);
    const maxDim = Number(options.maxDimension || 1400);

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages || 0;
    const endPage = Math.min(pageCount, maxPages);
    const images = [];

    for (let i = 1; i <= endPage; i++) {
        const page = await pdf.getPage(i);
        let viewport = page.getViewport({ scale: targetScale });
        const maxSide = Math.max(viewport.width, viewport.height);
        if (maxSide > maxDim) {
            const ratio = maxDim / maxSide;
            viewport = page.getViewport({ scale: Math.max(0.5, targetScale * ratio) });
        }
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await page.render({ canvasContext: ctx, viewport }).promise;
        images.push(canvas.toDataURL('image/jpeg', 0.82));
    }

    return {
        images,
        pageCount,
        renderedPages: endPage
    };
}

function initDragAndDrop() {
    const dropZone = $('dropZone');
    if (!dropZone) return;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    dropZone.addEventListener('drop', handleDrop, false);
}

function handleDrop(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        const category = $('category')?.value;
        const imageMode = $('imageMode')?.value;
        const accept = getUploadAcceptByMode(category, imageMode);
        if (!isFileAcceptedByMode(file, accept)) {
            alert(`当前模式不支持该文件格式。支持：${accept || '无'}`);
            return;
        }
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        $('file-input').files = dataTransfer.files;
        previewAndCompress();
    }
}

function ensureImageMarkerInInput() {
    const msgInput = $('msg');
    if (!msgInput) return;
    const marker = '[图片]';
    if (!msgInput.value.includes(marker)) {
        msgInput.value = `${msgInput.value}${msgInput.value ? ' ' : ''}${marker}`.trim();
    }
}

function removeImageMarkerFromInput() {
    const msgInput = $('msg');
    if (!msgInput) return;
    msgInput.value = msgInput.value.replace(/\s*\[图片\]\s*/g, ' ').trim();
}

function ensureFileMarkerInInput(fileName) {
    const msgInput = $('msg');
    if (!msgInput) return;
    const marker = `[文件:${fileName}]`;
    msgInput.value = msgInput.value.replace(/\s*\[文件:[^\]]+\]\s*/g, ' ').trim();
    if (!msgInput.value.includes(marker)) {
        msgInput.value = `${msgInput.value}${msgInput.value ? ' ' : ''}${marker}`.trim();
    }
}

function removeFileMarkerFromInput() {
    const msgInput = $('msg');
    if (!msgInput) return;
    msgInput.value = msgInput.value.replace(/\s*\[文件:[^\]]+\]\s*/g, ' ').trim();
}

function previewAndCompress() {
    const file = $('file-input').files[0];
    if (!file) return;
    const category = $('category')?.value;
    const imageMode = $('imageMode')?.value;
    const accept = getUploadAcceptByMode(category, imageMode);
    if (!isFileAcceptedByMode(file, accept)) {
        alert(`当前模式不支持该文件格式。支持：${accept || '无'}`);
        return;
    }

    window.currentUploadMeta = {
        name: file.name,
        type: file.type,
        isImage: file.type.startsWith('image/'),
        isPdf: isPdfFile(file)
    };

    if (!file.type.startsWith('image/')) {
        if (typeof window.currentBase64 !== 'undefined') {
            window.currentBase64 = "";
        }
        window.currentPdfPageImages = [];
        removeImageMarkerFromInput();
        ensureFileMarkerInInput(file.name);
        if (window.currentUploadMeta.isPdf) {
            window.currentPdfText = '';
            extractTextFromPdf(file).then(({ text, pageCount }) => {
                if (!text) {
                    alert(`PDF 已选择：${file.name}，但未提取到可识别文本（可能是扫描版）。`);
                    window.currentPdfText = '';
                    return;
                }
                window.currentPdfText = text.slice(0, 20000);
                window.currentPdfPageImages = [];
                alert(`PDF 已解析：${file.name}（${pageCount} 页，可用于 OCR/翻译）`);
            }).catch((e) => {
                window.currentPdfText = '';
                window.currentPdfPageImages = [];
                alert(`PDF 解析失败：${e.message || e}`);
            });
        } else {
            window.currentPdfText = '';
            window.currentPdfPageImages = [];
            alert(`已选择文件：${file.name}`);
        }
        return;
    }
    window.currentPdfText = '';
    window.currentPdfPageImages = [];
    removeFileMarkerFromInput();

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.src = e.target.result;
        img.onload = function() {
            const maxSizeMB = 1;
            const maxSizeBytes = maxSizeMB * 1024 * 1024;
            let quality = 0.9;
            let canvas = document.createElement('canvas');
            let ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            while (compressedDataUrl.length > maxSizeBytes * 1.37 && quality > 0.1) {
                quality -= 0.1;
                compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            }
            window.currentBase64 = compressedDataUrl;
            ensureImageMarkerInInput();
            console.log('压缩后大小约', Math.round(compressedDataUrl.length / 1.37), 'bytes');
        };
    };
    reader.readAsDataURL(file);
}

// ---------- 模型自动切换辅助函数 ----------
function isAutoSwitchEnabled() {
    return localStorage.getItem('autoSwitchModel') === 'true';
}

function toggleAutoSwitch(checkbox) {
    localStorage.setItem('autoSwitchModel', checkbox.checked ? 'true' : 'false');
    const mainToggle = $('autoSwitchToggle');
    const settingsToggle = $('autoSwitchSettingToggle');
    if (mainToggle && mainToggle !== checkbox) mainToggle.checked = checkbox.checked;
    if (settingsToggle && settingsToggle !== checkbox) settingsToggle.checked = checkbox.checked;
}

function getAutoSwitchList() {
    try {
        return JSON.parse(localStorage.getItem('autoSwitchList') || '[]');
    } catch { return []; }
}

function getAlternateModels(category, currentModelValue) {
    const userList = getAutoSwitchList();
    if (userList.length > 0) {
        return userList
            .filter(v => v !== currentModelValue)
            .filter(v => {
                if (!window.allModels) return false;
                const m = window.allModels.find(m => m.value === v);
                return m && m.type === category;
            });
    }
    if (!window.allModels) return [];
    return window.allModels
        .filter(m => m.type === category && m.value !== currentModelValue)
        .map(m => m.value);
}

function getModelLabel(modelValue) {
    if (!window.allModels) return modelValue;
    const m = window.allModels.find(m => m.value === modelValue);
    if (m) return m.label;
    const parts = modelValue.split('::');
    return parts.length > 1 ? parts[1] : modelValue;
}

// ---------- 自动切换设置面板 ----------
function showAutoSwitchSettings() {
    hideAllPanels();
    const panel = $('autoSwitchPanel');
    if (panel) panel.style.display = 'block';
    $('settingsContentTitle').textContent = i18n[currentLanguage].auto_switch_settings;

    const toggle = $('autoSwitchSettingToggle');
    if (toggle) toggle.checked = isAutoSwitchEnabled();

    renderAutoSwitchModelList();
}

function renderAutoSwitchModelList() {
    const container = $('autoSwitchModelList');
    if (!container) return;

    const allModels = window.allModels || [];
    if (allModels.length === 0) {
        container.innerHTML = `<p class="hint" style="padding:20px; text-align:center;">${i18n[currentLanguage].auto_switch_no_models}</p>`;
        return;
    }

    const savedList = getAutoSwitchList();

    const typeLabels = {
        chat:        { zh: '💬 对话', en: '💬 Chat' },
        code:        { zh: '💻 编程', en: '💻 Code' },
        image:       { zh: '🎨 图像生成', en: '🎨 Image' },
        video:       { zh: '🎬 视频生成', en: '🎬 Video' },
        ocr:         { zh: '📄 文字识别', en: '📄 OCR' },
        vision:      { zh: '👁️ 图像理解', en: '👁️ Vision' },
        translation: { zh: '🌐 翻译', en: '🌐 Translation' }
    };
    const typeOrder = ['chat', 'code', 'image', 'video', 'ocr', 'vision', 'translation'];

    const byType = {};
    allModels.forEach(m => {
        const t = m.type || 'chat';
        if (!byType[t]) byType[t] = [];
        byType[t].push(m);
    });

    container.innerHTML = '';

    const sortedTypes = [...typeOrder.filter(t => byType[t]), ...Object.keys(byType).filter(t => !typeOrder.includes(t))];

    sortedTypes.forEach(type => {
        const models = byType[type];
        const label = typeLabels[type] ? typeLabels[type][currentLanguage] || typeLabels[type].en : type;

        const header = document.createElement('div');
        header.className = 'auto-switch-group-header';
        header.textContent = label + ` (${models.length})`;
        container.appendChild(header);

        const group = document.createElement('div');
        group.className = 'auto-switch-group';
        group.dataset.type = type;

        const orderedInGroup = [];
        savedList.forEach(val => {
            const m = models.find(m => m.value === val);
            if (m) orderedInGroup.push({ ...m, checked: true });
        });
        models.forEach(m => {
            if (!orderedInGroup.find(o => o.value === m.value)) {
                orderedInGroup.push({ ...m, checked: false });
            }
        });

        orderedInGroup.forEach(m => {
            const providerName = getProviderNameForModel(m.value);
            const item = document.createElement('div');
            item.className = 'auto-switch-item' + (m.checked ? ' checked' : '');
            item.draggable = true;
            item.dataset.value = m.value;
            item.innerHTML = `
                <span class="drag-handle">☰</span>
                <input type="checkbox" class="auto-switch-cb" data-model="${m.value}" ${m.checked ? 'checked' : ''}>
                <span class="auto-switch-model-name">${m.label}</span>
                <span class="auto-switch-provider-badge">${providerName}</span>
            `;
            item.querySelector('.auto-switch-cb').addEventListener('change', function() {
                item.classList.toggle('checked', this.checked);
            });
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('dragging');
            });
            item.addEventListener('dragend', () => item.classList.remove('dragging'));
            group.appendChild(item);
        });

        group.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = group.querySelector('.dragging');
            if (!dragging) return;
            const afterElement = getDragAfterElement(group, e.clientY);
            if (afterElement) {
                group.insertBefore(dragging, afterElement);
            } else {
                group.appendChild(dragging);
            }
        });

        container.appendChild(group);
    });
}

function getDragAfterElement(container, y) {
    const items = [...container.querySelectorAll('.auto-switch-item:not(.dragging)')];
    let closest = null;
    let closestOffset = Number.NEGATIVE_INFINITY;
    items.forEach(child => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closestOffset) {
            closestOffset = offset;
            closest = child;
        }
    });
    return closest;
}

function getProviderNameForModel(modelValue) {
    const [pId] = modelValue.split('::');
    const p = providers.find(p => p.id === pId);
    return p ? p.name : pId;
}

function saveAutoSwitchList() {
    const container = $('autoSwitchModelList');
    if (!container) return;
    const items = container.querySelectorAll('.auto-switch-item');
    const list = [];
    items.forEach(item => {
        const cb = item.querySelector('.auto-switch-cb');
        if (cb && cb.checked) {
            list.push(item.dataset.value);
        }
    });
    localStorage.setItem('autoSwitchList', JSON.stringify(list));
    alert(i18n[currentLanguage].auto_switch_saved);
}

function isRateLimitMessage(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return lower.includes('rate limit') || lower.includes('rate_limit') ||
           lower.includes('quota') || lower.includes('too many request') ||
           lower.includes('exceeded') || lower.includes('limit reached') ||
           lower.includes('请求过多') || lower.includes('频率限制') ||
           lower.includes('配额') || lower.includes('限流') ||
           lower.includes('429') || lower.includes('resource_exhausted') ||
           lower.includes('capacity') || lower.includes('overloaded');
}

function showAutoSwitchToast(modelLabel) {
    let toast = $('autoSwitchToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'autoSwitchToast';
        toast.className = 'auto-switch-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = i18n[currentLanguage].auto_switch_notice + modelLabel;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Normalize UI markers from input before building prompts.
function normalizeUserInputText(raw) {
    return String(raw || '')
        .replace(/\s*\[图片\]\s*/g, ' ')
        .replace(/\s*\[文件:[^\]]+\]\s*/g, ' ')
        .trim();
}

// Build compact upload status tags for chat history rendering.
function buildUploadDisplayMeta(currentBase64, currentUploadMeta, currentPdfPageImages) {
    const mediaTag = currentBase64 ? ' [图片]' : (currentUploadMeta ? ` [文件:${currentUploadMeta.name}]` : '');
    const scanTag = (Array.isArray(currentPdfPageImages) && currentPdfPageImages.length > 0)
        ? ` [扫描页:${currentPdfPageImages.length}]`
        : '';
    return mediaTag + scanTag;
}

// Resolve mode prompt config from centralized registry with safe fallback.
function getModePromptConfig() {
    const modeMap = MODE_CONFIG.modeMap || {};
    const chatLikeCategories = Object.keys(modeMap).filter(k => modeMap[k]?.isChatLike);
    if (!chatLikeCategories.length) {
        chatLikeCategories.push('chat', 'code', 'ocr', 'vision', 'translation');
    }
    const categorySystemPrompts = {
        code: "你是一个高级编程助手。请根据用户需求生成高质量代码，或对用户提供的代码进行分析、优化、调试。回复中使用 Markdown 代码块格式，注明编程语言。解释要简明扼要。",
        ocr: modeMap.ocr?.systemPrompt || "你是一个专业的文字识别(OCR)助手。请准确识别用户上传图片中的所有文字内容，严格按照原始排版格式输出，不要遗漏任何文字，不要添加额外解释。",
        vision: modeMap.vision?.systemPrompt || "你是一个专业的图像分析助手，擅长视觉理解。根据用户的指令分析上传的图片。你可以：分析服装穿搭与造型风格、描述场景与物体、解读图表数据、鉴别物品、评估设计等。请给出准确、详细且有条理的分析结果。",
        translation: modeMap.translation?.systemPrompt || "你是一个专业翻译助手。请将用户提供的文本翻译为目标语言。如果用户没有指定目标语言：中文内容翻译为英文，其他语言翻译为中文。保持原文的格式和语气，翻译要自然流畅。如果用户上传了图片，请先识别图中文字再进行翻译。"
    };
    const categoryDefaultText = {
        ocr: modeMap.ocr?.defaultText || '请识别这张图片中的所有文字，按原始排版输出。',
        vision: modeMap.vision?.defaultText || '请详细分析这张图片的内容。',
        translation: modeMap.translation?.defaultText || '请翻译这张图片中的所有文字。'
    };
    return { chatLikeCategories, categorySystemPrompts, categoryDefaultText };
}

// Build request payload for chat/image/video paths without side effects.
function buildRequestPayload(ctx) {
    const {
        category,
        imageMode,
        text,
        currentBase64,
        currentUploadMeta,
        currentPdfText,
        currentPdfPageImages
    } = ctx;
    const { chatLikeCategories, categorySystemPrompts, categoryDefaultText } = getModePromptConfig();
    const isChatLike = chatLikeCategories.includes(category);

    let finalPrompt = text;
    let finalMessages = null;

    if (isChatLike) {
        const activeSystemId = currentActivePresetId.system;
        const systemPreset = presets.find(p => p.id === activeSystemId && p.type === 'system');

        let userText = text || categoryDefaultText[category] || text;
        if ((category === 'ocr' || category === 'translation') && currentUploadMeta?.isPdf && currentPdfText) {
            userText = (text || categoryDefaultText[category] || '请处理这份PDF文本。') + '\n\n[PDF文本]\n' + currentPdfText;
        } else if ((category === 'ocr' || category === 'translation') && currentUploadMeta?.isPdf && currentPdfPageImages.length > 0) {
            userText = (text || categoryDefaultText[category] || '请识别并处理这份扫描PDF内容。') + `\n\n[说明] 该PDF为扫描版，已附加 ${currentPdfPageImages.length} 页图像，请逐页识别。`;
        }

        let content = [{ type: "text", text: userText }];
        if (currentBase64) {
            content.push({ type: "image_url", image_url: { url: currentBase64 } });
        }
        if (currentPdfPageImages.length > 0) {
            currentPdfPageImages.forEach((img) => {
                content.push({ type: "image_url", image_url: { url: img } });
            });
        }

        finalMessages = [];
        if (categorySystemPrompts[category]) {
            finalMessages.push({ role: "system", content: categorySystemPrompts[category] });
        } else if (systemPreset) {
            finalMessages.push({ role: "system", content: systemPreset.content });
        }
        const preferredUserAddress = getPreferredUserAddress();
        if (preferredUserAddress) {
            finalMessages.push({
                role: "system",
                content: currentLanguage === 'zh'
                    ? `请将用户称呼为“${preferredUserAddress}”。在自然对话中可偶尔使用，不要每句都重复。`
                    : `Address the user as "${preferredUserAddress}" naturally. Use it occasionally and avoid repeating it in every sentence.`
            });
        }
        const ragPrompt = buildRagSystemPrompt(userText);
        if (ragPrompt) {
            finalMessages.push({
                role: "system",
                content: ragPrompt
            });
        }
        finalMessages.push({ role: "user", content: content });
    } else if (category === 'image') {
        const activeRoleId = currentActivePresetId.role;
        const rolePreset = presets.find(p => p.id === activeRoleId && p.type === 'role');
        if (rolePreset) {
            finalPrompt = rolePreset.content + "\n" + text;
        }
    }

    const requestBody = {
        model: ctx.modelValue,
        task: isChatLike ? 'chat' : category,
        prompt: finalPrompt,
        stream: isChatLike
    };
    if (category === 'image') {
        requestBody.mode = imageMode;
        if (imageMode === 'img2img' && currentBase64) {
            requestBody.image = currentBase64;
        }
    } else if (isChatLike) {
        requestBody.messages = finalMessages;
    } else {
        requestBody.prompt = text;
    }

    return { requestBody, isChatLike };
}

// Execute request with model fallback, streaming parse, and retry policy.
async function executeRequestWithFallback(ctx) {
    const {
        requestBody,
        isChatLike,
        category,
        requestConvId,
        debugRequestId,
        totalTimeout,
        idleTimeout
    } = ctx;

    const autoSwitch = isAutoSwitchEnabled();
    let modelsToTry = [requestBody.model];
    if (autoSwitch) {
        modelsToTry = [...modelsToTry, ...getAlternateModels(category, requestBody.model)];
    }

    const allow = await PluginSystem.runHook("beforeSend", requestBody);
    if (!allow) {
        console.log("发送被插件拦截");
        addDebugLog('request_blocked_by_plugin', {
            request_id: debugRequestId,
            conv_id: requestConvId
        }, 'warn');
        isReceiving = false;
        $('sendBtn').disabled = false;
        return;
    }

    for (let mi = 0; mi < modelsToTry.length; mi++) {
        requestBody.model = modelsToTry[mi];

        if (mi > 0) {
            const label = getModelLabel(modelsToTry[mi]);
            appendToLastAIMessage('\n' + i18n[currentLanguage].auto_switch_notice + label + '\n', requestConvId);
            addDebugLog('model_switch', {
                request_id: debugRequestId,
                conv_id: requestConvId,
                to_model: modelsToTry[mi],
                to_label: label
            }, 'warn');
            showAutoSwitchToast(label);
            const modelSelect = $('model');
            if (modelSelect) modelSelect.value = modelsToTry[mi];
        }

        let shouldRetry = false;
        const attemptStartedAt = Date.now();

        try {
            const response = await fetch('ai_proxy.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            addDebugLog('response_received', {
                request_id: debugRequestId,
                conv_id: requestConvId,
                model: requestBody.model,
                status: response.status,
                attempt_ms: Date.now() - attemptStartedAt
            });

            if ((response.status === 429 || response.status === 503) && autoSwitch && mi < modelsToTry.length - 1) {
                shouldRetry = true;
            } else if (!response.ok) {
                if (autoSwitch && mi < modelsToTry.length - 1) {
                    try {
                        const errText = await response.clone().text();
                        if (isRateLimitMessage(errText)) { shouldRetry = true; }
                    } catch {}
                }
                if (!shouldRetry) throw new Error(`HTTP error ${response.status}`);
            }

            if (!shouldRetry && isChatLike) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = '';
                let streamContent = '';
                const startTime = Date.now();

                while (true) {
                    if (Date.now() - startTime > totalTimeout) {
                        throw new Error(`响应超时（超过 ${totalTimeout/1000} 秒）`);
                    }
                    const readPromise = reader.read();
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`${idleTimeout/1000} 秒内无数据，连接可能已断开`)), idleTimeout)
                    );
                    let readResult;
                    try {
                        readResult = await Promise.race([readPromise, timeoutPromise]);
                    } catch (timeoutError) {
                        throw timeoutError;
                    }
                    const { done, value } = readResult;
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('data: ')) {
                            const data = trimmed.substring(6);
                            if (data === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(data);
                                const delta = parsed.choices?.[0]?.delta;
                                if (delta) {
                                    let textChunk = delta.content || delta.reasoning_content || '';
                                    if (textChunk) {
                                        streamContent += textChunk;
                                        appendToLastAIMessage(textChunk, requestConvId);
                                    }
                                }
                            } catch (e) {
                                console.warn('解析流数据失败', e, data);
                            }
                        }
                    }
                }

                if (autoSwitch && mi < modelsToTry.length - 1 && isRateLimitMessage(streamContent)) {
                    shouldRetry = true;
                }
                addDebugLog('stream_finished', {
                    request_id: debugRequestId,
                    conv_id: requestConvId,
                    model: requestBody.model,
                    content_length: streamContent.length
                });
            } else if (!shouldRetry) {
                const result = await response.json();
                if (result.error) {
                    if (autoSwitch && mi < modelsToTry.length - 1 && isRateLimitMessage(result.error)) {
                        appendToLastAIMessage('[' + result.error + ']', requestConvId);
                        shouldRetry = true;
                    } else {
                        appendToLastAIMessage('错误：' + result.error, requestConvId);
                    }
                } else {
                    let imageUrl = null;
                    if (result.data && result.data[0] && result.data[0].url) {
                        imageUrl = result.data[0].url;
                    } else if (result.images && result.images[0]) {
                        imageUrl = result.images[0];
                    } else if (result.image) {
                        imageUrl = result.image;
                    } else if (result.output && result.output[0] && result.output[0].url) {
                        imageUrl = result.output[0].url;
                    }
                    if (imageUrl) {
                        appendToLastAIMessage('生成图片：' + imageUrl, requestConvId);
                    } else {
                        appendToLastAIMessage(JSON.stringify(result, null, 2), requestConvId);
                    }
                }
            }

            if (shouldRetry) {
                addDebugLog('request_retry', {
                    request_id: debugRequestId,
                    conv_id: requestConvId,
                    model: requestBody.model
                }, 'warn');
                continue;
            }
            addDebugLog('request_success', {
                request_id: debugRequestId,
                conv_id: requestConvId,
                model: requestBody.model
            });
            break;

        } catch (e) {
            console.error('请求失败', e);
            addDebugLog('request_error', {
                request_id: debugRequestId,
                conv_id: requestConvId,
                model: requestBody.model,
                attempt_ms: Date.now() - attemptStartedAt,
                message: sanitizeErrorMessage(e.message)
            }, 'error');
            if (autoSwitch && mi < modelsToTry.length - 1 && isRateLimitMessage(e.message)) {
                continue;
            }
            appendToLastAIMessage('\n\n[错误] ' + e.message, requestConvId);
            break;
        }
    }

    addDebugLog('request_end', {
        request_id: debugRequestId,
        conv_id: requestConvId
    });
    finishAIMessage(requestConvId);
}

async function ensurePdfPreparedForRecognition(category, currentUploadMeta, currentPdfText, currentPdfPageImages, currentUploadFile) {
    if (!(category === 'ocr' || category === 'translation')) {
        return { ok: true, pages: currentPdfPageImages };
    }
    if (!currentUploadMeta?.isPdf || currentPdfText || (currentPdfPageImages || []).length > 0) {
        return { ok: true, pages: currentPdfPageImages };
    }
    if (!currentUploadFile) {
        alert('PDF 文件状态丢失，请重新选择文件。');
        return { ok: false, pages: currentPdfPageImages };
    }
    try {
        const { images, renderedPages } = await extractPdfPageImages(currentUploadFile, { maxPages: PDF_SCAN_MAX_PAGES, scale: 1.25, maxDimension: 1360 });
        const pages = images || [];
        window.currentPdfPageImages = pages;
        if (pages.length > 0) {
            console.log(`扫描PDF模式：已渲染 ${renderedPages} 页用于OCR（最多前${PDF_SCAN_MAX_PAGES}页）`);
        }
        return { ok: true, pages };
    } catch (e) {
        alert(`扫描PDF页面失败：${e.message || e}`);
        return { ok: false, pages: currentPdfPageImages };
    }
}

// ---------- 发送请求（使用激活的预设和单词转换）----------
async function send() {
    const msgInput = $('msg');
    const modelSelect = $('model');
    const category = $('category').value;
    const imageMode = $('imageMode')?.value;
    const currentBase64 = window.currentBase64;
    const currentUploadMeta = window.currentUploadMeta || null;
    const currentPdfText = (window.currentPdfText || '').trim();
    let currentPdfPageImages = Array.isArray(window.currentPdfPageImages) ? window.currentPdfPageImages : [];
    const currentUploadFile = $('file-input')?.files?.[0] || null;

    let text = normalizeUserInputText(msgInput.value);

    const pdfPrepare = await ensurePdfPreparedForRecognition(
        category,
        currentUploadMeta,
        currentPdfText,
        currentPdfPageImages,
        currentUploadFile
    );
    if (!pdfPrepare.ok) return;
    currentPdfPageImages = pdfPrepare.pages || [];

    if (category === 'ocr' && !currentBase64) {
        if (currentUploadMeta?.isPdf) {
            if (!currentPdfText && currentPdfPageImages.length === 0) {
                alert('PDF 未提取到文本且无法渲染页面，无法进行OCR。');
                return;
            }
        } else {
            alert(i18n[currentLanguage].ocr_need_image || '请先上传需要识别文字的图片');
            return;
        }
    }
    if (category === 'vision' && !currentBase64) {
        alert(i18n[currentLanguage].vision_need_image || '请先上传需要分析的图片');
        return;
    }
    if (category === 'translation' && !text && !currentBase64 && !(currentUploadMeta?.isPdf && (currentPdfText || currentPdfPageImages.length > 0))) {
        alert(i18n[currentLanguage].translation_need_input || '请输入要翻译的文本或上传含文字的图片');
        return;
    }
    const imageNeedCategories = ['ocr', 'vision', 'translation'];
    if (!text && !imageNeedCategories.includes(category) && (category !== 'image' || imageMode !== 'img2img' || !currentBase64)) {
        alert('请输入提示词或上传图片');
        return;
    }
    if (!modelSelect.value) {
        alert('请先选择模型');
        return;
    }
    if (isReceiving) {
        alert('正在接收回复，请稍候');
        return;
    }

    // 应用单词转换（仅在文生图模式下）
    if (category === 'image' && imageMode === 'text2img') {
        const originalText = text;
        text = applyWordConversion(text);
        if (originalText !== text) {
            console.log('单词转换应用:', originalText, '->', text);
        }
    }

    const requestConvId = currentConvId;
    const debugRequestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const categoryTags = {
        image: `[${imageMode === 'text2img' ? '文生图' : '图生图'}] ${text}`,
        code: `[编程] ${text}`,
        ocr: `[文字识别] ${text || '提取图片文字'}`,
        vision: `[图像理解] ${text || '分析图片内容'}`,
        translation: `[翻译] ${text || '翻译图片中的文字'}`
    };
    const uploadMetaSuffix = buildUploadDisplayMeta(currentBase64, currentUploadMeta, currentPdfPageImages);
    if (categoryTags[category]) {
        addMessageToCurrent(
            'user',
            categoryTags[category] + uploadMetaSuffix,
            requestConvId,
            currentBase64 ? { image: currentBase64 } : {}
        );
    } else {
        const userDisplayText = ((text || '') + uploadMetaSuffix).trim();
        addMessageToCurrent(
            'user',
            userDisplayText,
            requestConvId,
            currentBase64 ? { image: currentBase64 } : {}
        );
    }

    const { requestBody, isChatLike } = buildRequestPayload({
        category,
        imageMode,
        text,
        currentBase64,
        currentUploadMeta,
        currentPdfText,
        currentPdfPageImages,
        modelValue: modelSelect.value
    });
    addDebugLog('request_start', {
        request_id: debugRequestId,
        conv_id: requestConvId,
        ...summarizeRequestBody(requestBody)
    });

    // 清除图片预览
    window.removePreview();
    msgInput.value = '';
    // 重置textarea高度
    msgInput.style.height = 'auto';

    const logEl = $('log');
    const aiDiv = document.createElement('div');
    aiDiv.className = 'ai streaming';
    aiDiv.textContent = '';
    logEl.appendChild(aiDiv);
    logEl.scrollTop = logEl.scrollHeight;

    isReceiving = true;
    $('sendBtn').disabled = true;

    const totalTimeout = (parseInt(localStorage.getItem('timeoutTotal') || '600')) * 1000;
    const idleTimeout = (parseInt(localStorage.getItem('timeoutIdle') || '120')) * 1000;
    await executeRequestWithFallback({
        requestBody,
        isChatLike,
        category,
        requestConvId,
        debugRequestId,
        totalTimeout,
        idleTimeout
    });
}

// 新增：处理textarea按键事件
function handleTextareaKeydown(e) {
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        send();
    }
    // Ctrl+Enter 换行已经在内联脚本中处理
}

// ========== 插件管理函数 ==========
function showPluginManager() {
    hideAllPanels();
    const panel = $('pluginManagerPanel');
    if (!panel) {
        createPluginPanel();
    }
    $('pluginManagerPanel').style.display = 'block';
    $('settingsContentTitle').textContent = i18n[currentLanguage].plugin_manager;
    renderPluginList();
}

function createPluginPanel() {
    const main = document.querySelector('.settings-main');
    const panel = document.createElement('div');
    panel.id = 'pluginManagerPanel';
    panel.style.display = 'none';
    panel.innerHTML = `
        <h3 data-i18n="plugin_manager">🧩 插件管理</h3>
        <p data-i18n="plugin_manager_desc">启用/禁用插件，配置插件设置。</p>
        <div id="pluginList" class="plugin-list"></div>
    `;
    main.appendChild(panel);
}

function renderPluginList() {
    const container = $('pluginList');
    if (!container) return;
    
    // 从 PluginSystem 获取所有插件
    const plugins = PluginSystem.getAllPlugins();
    
    if (plugins.length === 0) {
        container.innerHTML = '<p class="hint" style="padding:20px;">暂无已注册的插件。</p>';
        return;
    }
    
    let html = '';
    plugins.forEach(plugin => {
        const enabled = MainApp.isPluginEnabled(plugin.id);
        html += `
            <div class="plugin-item" style="border:1px solid var(--border); border-radius:var(--radius-md); padding:16px; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:20px;">🧩</span>
                    <div style="flex:1;">
                        <strong>${plugin.name || plugin.id}</strong> 
                        ${plugin.version ? `v${plugin.version}` : ''} 
                        ${plugin.author ? `<span style="color:var(--text-light);">by ${plugin.author}</span>` : ''}
                        <div style="font-size:13px; color:var(--text-light); margin-top:4px;">${plugin.description || ''}</div>
                    </div>
                    <label class="switch">
                        <input type="checkbox" data-plugin-id="${plugin.id}" ${enabled ? 'checked' : ''} onchange="togglePlugin(this)">
                        <span class="slider round"></span>
                    </label>
                    ${plugin.settings ? `<button class="cyoa-btn cyoa-btn-secondary" onclick="configurePlugin('${plugin.id}')">⚙️ 设置</button>` : ''}
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// 切换插件启用状态
window.togglePlugin = function(checkbox) {
    const pluginId = checkbox.dataset.pluginId;
    MainApp.setPluginEnabled(pluginId, checkbox.checked);
};

// 配置插件（调用插件的 renderSettings）
window.configurePlugin = function(pluginId) {
    const plugin = PluginSystem.getPluginInfo(pluginId);
    if (!plugin || !plugin.renderSettings) return;
    
    hideAllPanels();
    let pluginConfigPanel = $('pluginConfigPanel');
    if (!pluginConfigPanel) {
        pluginConfigPanel = document.createElement('div');
        pluginConfigPanel.id = 'pluginConfigPanel';
        document.querySelector('.settings-main').appendChild(pluginConfigPanel);
    }
    pluginConfigPanel.style.display = 'block';
    $('settingsContentTitle').textContent = (plugin.name || pluginId) + ' 设置';
    
    // 调用插件的 renderSettings 方法
    plugin.renderSettings(pluginConfigPanel);
};

// ---------- 设置面板函数 ----------
function openSettings() {
    const modal = $('settingsModal');
    if(!modal) return;

    modal.style.display = 'flex';
    hideAllPanels();
    if($('defaultPlaceholder')) $('defaultPlaceholder').style.display = 'block';
    if($('settingsContentTitle')) $('settingsContentTitle').textContent = i18n[currentLanguage].select_left_function;
    if($('providerListSubmenu')) $('providerListSubmenu').style.display = 'none';
    if($('providerListArrow')) $('providerListArrow').textContent = '▶';
    loadProviderListSubmenu();
    if($('providerListToggle')) $('providerListToggle').onclick = toggleProviderList;
}

function closeSettings() {
    const modal = $('settingsModal');
    if(modal) modal.style.display = 'none';
}

function hideAllPanels() {
    const panels = [
        'providerEditPanel', 'modelTypePanel', 'passwordPanel', 
        'presetManagerPanel', 'timeoutPanel', 'languagePanel', 'profilePanel',
        'pluginManagerPanel', 'pluginConfigPanel', 'defaultPlaceholder',
        'wordConversionPanel', 'autoSwitchPanel', 'costOptimizerPanel',
        'skinPanel', 'ragPanel', 'modeCapabilitiesPanel',
        'debugPanel'
    ];
    panels.forEach(id => {
        const el = $(id);
        if (el) el.style.display = 'none';
    });
}

function showPresetManager() {
    hideAllPanels();
    const panel = $('presetManagerPanel');
    if (panel) {
        panel.style.display = 'block';
        renderPresetList();
        clearPresetForm();
    }
    $('settingsContentTitle').textContent = i18n[currentLanguage].preset_manager;
}

function showTimeoutSettings() {
    hideAllPanels();
    const panel = $('timeoutPanel');
    if (panel) {
        panel.style.display = 'block';
        const total = localStorage.getItem('timeoutTotal') || '600';
        const idle = localStorage.getItem('timeoutIdle') || '120';
        $('timeoutTotal').value = total;
        $('timeoutIdle').value = idle;
    }
    $('settingsContentTitle').textContent = i18n[currentLanguage].timeout_settings;
}

function saveTimeoutSettings() {
    const total = parseInt($('timeoutTotal').value);
    const idle = parseInt($('timeoutIdle').value);
    if (isNaN(total) || total < 10) { alert('总超时必须≥10秒'); return; }
    if (isNaN(idle) || idle < 10) { alert('空闲超时必须≥10秒'); return; }
    localStorage.setItem('timeoutTotal', total);
    localStorage.setItem('timeoutIdle', idle);
    alert(i18n[currentLanguage].timeout_saved);
}

function showLanguageSettings() {
    hideAllPanels();
    const panel = $('languagePanel');
    if (panel) {
        panel.style.display = 'block';
        $('languageSelect').value = currentLanguage;
    }
    $('settingsContentTitle').textContent = i18n[currentLanguage].language;
}

function showProfileSettings() {
    hideAllPanels();
    const panel = $('profilePanel');
    if (panel) panel.style.display = 'block';
    $('settingsContentTitle').textContent = i18n[currentLanguage].chat_profile;

    const profile = loadChatProfileSettings();
    if ($('playerNickname')) $('playerNickname').value = profile.user.name || '';
    if ($('playerAvatar')) $('playerAvatar').value = profile.user.avatar || '';
    if ($('aiNickname')) $('aiNickname').value = profile.assistant.name || '';
    if ($('aiAvatar')) $('aiAvatar').value = profile.assistant.avatar || '';
    if ($('aiUserCallName')) $('aiUserCallName').value = profile.assistant.callUserAs || '';
    if ($('playerAvatar')) $('playerAvatar').oninput = refreshProfileAvatarPreviews;
    if ($('aiAvatar')) $('aiAvatar').oninput = refreshProfileAvatarPreviews;
    refreshProfileAvatarPreviews();
}

function saveProfileSettings() {
    const profile = {
        user: {
            name: ($('playerNickname')?.value || '').trim() || '你',
            avatar: ($('playerAvatar')?.value || '').trim()
        },
        assistant: {
            name: ($('aiNickname')?.value || '').trim() || 'Ada',
            avatar: ($('aiAvatar')?.value || '').trim(),
            callUserAs: ($('aiUserCallName')?.value || '').trim()
        }
    };
    saveChatProfileSettings(profile);
    refreshProfileAvatarPreviews();
    renderCurrentConversation();
    alert(i18n[currentLanguage].save_profile || 'Profile saved');
}

function showDebugSettings() {
    hideAllPanels();
    const panel = $('debugPanel');
    if (panel) {
        panel.style.display = 'block';
        const toggle = $('debugModeToggle');
        if (toggle) toggle.checked = isDebugModeEnabled();
        renderDebugLogs();
        showDebugHelp();
    }
    $('settingsContentTitle').textContent = i18n[currentLanguage].debug_mode;
}

function showAddProvider() {
    hideAllPanels();
    const panel = $('providerEditPanel');
    if (panel) panel.style.display = 'block';
    $('settingsContentTitle').textContent = i18n[currentLanguage].add_provider;
    $('providerId').value = '';
    $('provName').value = '';
    $('provBaseUrl').value = '';
    const apiKeyInput = $('provApiKey');
    apiKeyInput.value = '';
    apiKeyInput.required = true;
    apiKeyInput.placeholder = '';
    $('provModelsPath').value = '/models';
    $('provChatPath').value = '/chat/completions';
    $('provImageGenPath').value = '/images/generations';
    $('provImageEditPath').value = '/images/edits';
    $('provVideoPath').value = '/videos/generations';
    $('provCacheStrategy').value = 'auto';
    const container = $('modelCheckboxList');
    if (container) container.innerHTML = '';
    currentEditingProviderId = null;
    document.querySelectorAll('.provider-item').forEach(item => item.classList.remove('active'));
}

function showEditProvider(id) {
    currentEditingProviderId = id;
    hideAllPanels();
    const panel = $('providerEditPanel');
    if (panel) panel.style.display = 'block';
    $('settingsContentTitle').textContent = i18n[currentLanguage].edit_provider || '编辑供应商';
    editProvider(id);
}

async function loadProviderListSubmenu() {
    const submenu = $('providerListSubmenu');
    if(!submenu) return;

    try {
        const res = await fetch('ai_proxy.php?action=get_providers');
        const rawText = await res.text();
        let raw = null;
        try {
            raw = JSON.parse(rawText);
        } catch (_) {
            const maybeHtml = /<\s*!doctype|<\s*html/i.test(rawText);
            const msg = maybeHtml
                ? '登录态可能已失效（接口返回了HTML）'
                : '接口返回了非 JSON 数据';
            submenu.innerHTML = `<div class="hint" style="padding:8px 12px;">${msg}</div>`;
            return;
        }
        const providerList = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.providers) ? raw.providers : []);
        providers = providerList;

        submenu.innerHTML = '';
        if (!providerList.length) {
            const msg = (raw && raw.error && /unauthorized/i.test(String(raw.error)))
                ? '登录态已失效，请刷新页面重新登录'
                : '暂无供应商';
            submenu.innerHTML = `<div class="hint" style="padding:8px 12px;">${msg}</div>`;
            return;
        }

        providerList.forEach(p => {
            const item = document.createElement('div');
            item.className = 'provider-item';
            item.dataset.id = p.id;

            item.onclick = (e) => {
                e.stopPropagation();
                showEditProvider(p.id);
                document.querySelectorAll('.provider-item').forEach(pi => pi.classList.remove('active'));
                item.classList.add('active');
            };

            item.innerHTML = `
                <span class="provider-name">${p.name}</span>
                <div class="provider-actions">
                    <button onclick="event.stopPropagation();deleteProvider('${p.id}')">🗑️</button>
                </div>
            `;

            submenu.appendChild(item);
        });

    } catch (e) {
        console.error('加载供应商列表失败', e);
    }
}

function toggleProviderList() {
    const submenu = $('providerListSubmenu');
    const arrow = $('providerListArrow');
    if(!submenu || !arrow) return;
    if (submenu.style.display === 'none') {
        submenu.style.display = 'block';
        arrow.textContent = '▼';
    } else {
        submenu.style.display = 'none';
        arrow.textContent = '▶';
    }
}

async function editProvider(id) {
    try {
        const res = await fetch(`ai_proxy.php?action=get_provider&id=${id}`);
        const p = await res.json();
        $('providerId').value = p.id;
        $('provName').value = p.name;
        $('provBaseUrl').value = p.base_url;
        const apiKeyInput = $('provApiKey');
        apiKeyInput.value = '';
        apiKeyInput.required = false;
        apiKeyInput.placeholder = i18n[currentLanguage].api_key_keep_hint || '留空则保持不变';
        $('provModelsPath').value = p.models_path || '/models';
        $('provChatPath').value = p.chat_path || '/chat/completions';
        $('provImageGenPath').value = p.image_gen_path || '/images/generations';
        $('provImageEditPath').value = p.image_edit_path || '/images/edits';
        $('provVideoPath').value = p.video_path || '/videos/generations';
        $('provCacheStrategy').value = p.cache_strategy || 'auto';

        const fullProvider = providers.find(pr => pr.id === id);
        if (fullProvider && fullProvider.all_models && fullProvider.all_models.length > 0) {
            const enabledIds = fullProvider.models ? fullProvider.models.map(m => m.id) : [];
            renderModelCheckboxes(fullProvider.all_models, enabledIds);
        } else {
            const container = $('modelCheckboxList');
            if (container) container.innerHTML = '';
        }
    } catch (e) {
        console.error('编辑供应商失败', e);
    }
}

function renderModelCheckboxes(allModelsList, enabledIds) {
    const container = $('modelCheckboxList');
    if (!container) return;
    container.innerHTML = '';

    const searchInput = $('modelSearchInput');
    if (searchInput) searchInput.value = '';
    updateModelSearchCount(null);

    if (!Array.isArray(allModelsList) || allModelsList.length === 0) {
        container.innerHTML = '<p class="hint" style="color:#999; padding:10px;">暂无模型数据</p>';
        return;
    }
    allModelsList.forEach(modelId => {
        const isChecked = enabledIds.includes(modelId);
        const itemDiv = document.createElement('div');
        itemDiv.className = 'model-checkbox-item' + (isChecked ? ' checked' : '');
        itemDiv.dataset.modelId = modelId.toLowerCase();
        const safeId = `model_${modelId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = safeId;
        checkbox.value = modelId;
        checkbox.checked = isChecked;
        checkbox.addEventListener('change', function() {
            itemDiv.classList.toggle('checked', this.checked);
        });
        const label = document.createElement('label');
        label.htmlFor = safeId;
        label.textContent = modelId;
        itemDiv.addEventListener('click', function(e) {
            if (e.target === checkbox || e.target === label) return;
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        });
        itemDiv.appendChild(checkbox);
        itemDiv.appendChild(label);
        container.appendChild(itemDiv);
    });
}

function filterModelCheckboxes(query) {
    const container = $('modelCheckboxList');
    if (!container) return;
    const items = container.querySelectorAll('.model-checkbox-item');
    const q = (query || '').toLowerCase().trim();
    let visible = 0;
    let total = items.length;

    items.forEach(item => {
        if (!q || item.dataset.modelId.includes(q)) {
            item.style.display = '';
            visible++;
        } else {
            item.style.display = 'none';
        }
    });

    updateModelSearchCount(q ? `${visible} / ${total}` : null);
}

function updateModelSearchCount(text) {
    const el = $('modelSearchCount');
    if (el) el.textContent = text || '';
}

function selectAllModels() {
    const container = $('modelCheckboxList');
    if (!container) return;
    container.querySelectorAll('.model-checkbox-item').forEach(item => {
        if (item.style.display !== 'none') {
            const cb = item.querySelector('input[type="checkbox"]');
            if (cb) { cb.checked = true; item.classList.add('checked'); }
        }
    });
}

function deselectAllModels() {
    const container = $('modelCheckboxList');
    if (!container) return;
    container.querySelectorAll('.model-checkbox-item').forEach(item => {
        if (item.style.display !== 'none') {
            const cb = item.querySelector('input[type="checkbox"]');
            if (cb) { cb.checked = false; item.classList.remove('checked'); }
        }
    });
}

async function saveProvider(event) {
    event.preventDefault();
    const id = $('providerId').value;
    const name = $('provName').value;
    const base_url = $('provBaseUrl').value;
    const api_key = $('provApiKey').value;
    const models_path = $('provModelsPath').value;
    const chat_path = $('provChatPath').value;
    const image_gen_path = $('provImageGenPath').value;
    const image_edit_path = $('provImageEditPath').value;
    const video_path = $('provVideoPath').value;

    const cache_strategy = $('provCacheStrategy').value;

    const data = { name, base_url, api_key, models_path, chat_path,
        image_gen_path, image_edit_path, video_path, cache_strategy };
    if (id) data.id = id;

    try {
        const res = await fetch('ai_proxy.php?action=save_provider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            alert('保存成功');
            await loadProviderListSubmenu();
            if (!id) {
                showEditProvider(result.id);
                document.querySelectorAll('.provider-item').forEach(item => {
                    if (item.dataset.id === result.id) item.classList.add('active');
                });
            } else {
                editProvider(id);
            }
            await loadProviders();
        } else {
            alert('保存失败：' + (result.error || '未知错误'));
        }
    } catch (e) {
        alert('保存失败：网络错误');
    }
}

async function deleteProvider(id) {
    if (!confirm('确定删除此供应商？')) return;
    try {
        const res = await fetch(`ai_proxy.php?action=delete_provider&id=${id}`, { method: 'POST' });
        const result = await res.json();
        if (result.success) {
            await loadProviderListSubmenu();
            if (providers.length > 0) {
                showEditProvider(providers[0].id);
            } else {
                showAddProvider();
            }
            await loadProviders();
        } else {
            alert('删除失败');
        }
    } catch (e) {
        alert('删除失败：网络错误');
    }
}

async function fetchModelsForCurrentProvider() {
    if (!currentEditingProviderId) {
        alert('请先选择或新增供应商');
        return;
    }
    await fetchModelsForProviderId(currentEditingProviderId);
}

async function fetchModelsForProviderId(id) {
    try {
        const res = await fetch(`ai_proxy.php?action=fetch_models&id=${id}`, { method: 'POST' });
        const result = await res.json();
        if (result.success) {
            alert('获取模型成功！');
            const modelList = Array.isArray(result.models) ? result.models : [];
            const provider = providers.find(p => p.id === id);
            const enabledModels = provider && provider.models ? provider.models.map(m => m.id) : [];
            renderModelCheckboxes(modelList, enabledModels);
        } else {
            alert('获取失败：' + (result.error || ''));
        }
    } catch (e) {
        alert('获取失败：网络错误');
    }
}

async function saveSelectedModels() {
    if (!currentEditingProviderId) {
        alert('没有正在编辑的供应商');
        return;
    }
    const container = $('modelCheckboxList');
    if (!container) return;
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const selected = [];
    checkboxes.forEach(cb => { if (cb.checked) selected.push(cb.value); });
    const selectedModels = selected.map(id => ({ id, type: 'chat' }));
    try {
        const res = await fetch('ai_proxy.php?action=update_provider_models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentEditingProviderId, models: selectedModels })
        });
        const result = await res.json();
        if (result.success) {
            alert('模型选择已保存');
            await loadAllModels();
            const currentProviderId = $('providerSelect').value;
            filterModelsByCategory();
            await loadProviderListSubmenu();
            editProvider(currentEditingProviderId);
        } else {
            alert('保存失败：' + (result.error || '未知错误'));
        }
    } catch (e) {
        alert('保存失败：网络错误');
    }
}

function showModelTypeManager() {
    hideAllPanels();
    const panel = $('modelTypePanel');
    if (panel) panel.style.display = 'block';
    $('settingsContentTitle').textContent = i18n[currentLanguage].model_type_manager;
    loadModelTypeList();
}

function getModeCapabilityLabel(mode) {
    const map = {
        chat: i18n[currentLanguage].category_chat || 'Chat',
        code: i18n[currentLanguage].category_code || 'Code',
        image: i18n[currentLanguage].category_image || 'Image',
        video: i18n[currentLanguage].category_video || 'Video',
        ocr: i18n[currentLanguage].category_ocr || 'OCR',
        vision: i18n[currentLanguage].category_vision || 'Vision',
        translation: i18n[currentLanguage].category_translation || 'Translation'
    };
    return map[mode] || mode;
}

function getModeProcessingText(mode) {
    const zh = currentLanguage === 'zh';
    switch (mode) {
        case 'chat':
        case 'code':
            return zh ? '可附图对话' : 'Chat with optional image input';
        case 'image':
            return zh ? '文生图直接生成；图生图使用上传图片生成' : 'Text-to-image or image-to-image generation';
        case 'video':
            return zh ? '根据文本或参考图生成视频' : 'Generate video from text or reference image';
        case 'ocr':
            return zh
                ? `图片直连OCR；PDF先提取文字，若无文字层则渲染前${PDF_SCAN_MAX_PAGES}页做扫描识别`
                : `OCR image directly; for PDF, extract text first, then render first ${PDF_SCAN_MAX_PAGES} pages if scanned`;
        case 'vision':
            return zh ? '图像理解与分析' : 'Visual understanding and analysis';
        case 'translation':
            return zh ? '支持纯文本翻译与图片文字翻译' : 'Supports text translation and translation from image text';
        default:
            return zh ? '按模式配置处理' : 'Processed by mode configuration';
    }
}

function getModeFlagsText(modeConfig) {
    const zh = currentLanguage === 'zh';
    if (!modeConfig || typeof modeConfig !== 'object') {
        return zh ? '无' : 'None';
    }
    const flagLabels = zh
        ? {
            isChatLike: '聊天型',
            requiresImage: '必须图片',
            requiresImageOrPdf: '必须图片或PDF',
            allowTextOnly: '支持纯文本'
        }
        : {
            isChatLike: 'chat-like',
            requiresImage: 'requires image',
            requiresImageOrPdf: 'requires image or PDF',
            allowTextOnly: 'text-only allowed'
        };
    const flags = Object.keys(flagLabels).filter((key) => modeConfig[key] === true);
    if (!flags.length) {
        return zh ? '无' : 'None';
    }
    return flags.map((key) => flagLabels[key]).join(' / ');
}

function buildModeCapabilitiesRows() {
    const config = window.AdaChatModeConfig || {};
    const modeMap = config.modeMap || {};
    const getAccept = typeof config.getUploadAccept === 'function'
        ? config.getUploadAccept
        : (mode) => modeMap[mode]?.uploadAccept || IMAGE_UPLOAD_ACCEPT;
    const modeOrder = ['chat', 'code', 'image', 'video', 'ocr', 'vision', 'translation'];
    const zh = currentLanguage === 'zh';
    const unavailable = zh ? '未配置' : 'Not configured';
    return modeOrder
        .filter((mode) => !!modeMap[mode])
        .map((mode) => {
            const modeConfig = modeMap[mode] || {};
            let uploadText = getAccept(mode, 'text2img') || (zh ? '无需上传' : 'No upload required');
            if (mode === 'image') {
                const text2img = getAccept('image', 'text2img') || (zh ? '无需上传' : 'No upload required');
                const img2img = getAccept('image', 'img2img') || unavailable;
                uploadText = zh ? `文生图：${text2img}；图生图：${img2img}` : `Text2Image: ${text2img}; Image2Image: ${img2img}`;
            }
            return {
                mode,
                modeLabel: getModeCapabilityLabel(mode),
                uploadText,
                processingText: getModeProcessingText(mode),
                flagsText: getModeFlagsText(modeConfig)
            };
        });
}

function generateModeCapabilitiesMarkdown() {
    const rows = buildModeCapabilitiesRows();
    const zh = currentLanguage === 'zh';
    const title = zh ? '### 🧭 模式能力矩阵' : '### 🧭 Mode Capability Matrix';
    const header = zh
        ? '| 模式 | 上传格式 | 处理方式 | 关键开关 |'
        : '| Mode | Upload Formats | Processing | Key Flags |';
    const divider = '|:---|:---|:---|:---|';
    const body = rows.map((row) => `| ${row.modeLabel} | ${row.uploadText} | ${row.processingText} | ${row.flagsText} |`).join('\n');
    return `${title}\n\n${header}\n${divider}\n${body}`;
}

async function copyModeCapabilitiesMarkdown() {
    const markdown = generateModeCapabilitiesMarkdown();
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(markdown);
        } else {
            const ta = document.createElement('textarea');
            ta.value = markdown;
            ta.setAttribute('readonly', 'readonly');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        alert(i18n[currentLanguage].mode_capability_copy_success || 'Copied');
    } catch (_) {
        alert(i18n[currentLanguage].mode_capability_copy_failed || 'Copy failed');
    }
}

function renderModeCapabilitiesPanel() {
    const container = $('modeCapabilitiesTable');
    if (!container) return;
    const rowsData = buildModeCapabilitiesRows();
    const zh = currentLanguage === 'zh';
    const modeHeader = zh ? '模式' : 'Mode';
    const uploadHeader = zh ? '上传格式' : 'Upload Formats';
    const processHeader = zh ? '处理方式' : 'Processing';
    const flagsHeader = i18n[currentLanguage].mode_capability_flags || (zh ? '关键开关' : 'Key Flags');
    const copyLabel = i18n[currentLanguage].mode_capability_copy_md || (zh ? '复制为Markdown' : 'Copy as Markdown');
    const rows = rowsData
        .map((row) => `
            <tr>
                <td>${escapeHtml(row.modeLabel)}</td>
                <td>${escapeHtml(row.uploadText)}</td>
                <td>${escapeHtml(row.processingText)}</td>
                <td>${escapeHtml(row.flagsText)}</td>
            </tr>
        `)
        .join('');

    const footer = zh
        ? '<p class="hint">配置来源：adachat-mode-config.js（只读展示）。</p>'
        : '<p class="hint">Config source: adachat-mode-config.js (read-only view).</p>';

    container.innerHTML = `
        <div class="form-actions" style="justify-content:flex-end; margin-bottom: 8px;">
            <button type="button" class="fetch-models-btn" onclick="copyModeCapabilitiesMarkdown()">${copyLabel}</button>
        </div>
        <table class="form-table">
            <thead>
                <tr>
                    <th>${modeHeader}</th>
                    <th>${uploadHeader}</th>
                    <th>${processHeader}</th>
                    <th>${flagsHeader}</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        ${footer}
    `;
}

function showModeCapabilities() {
    hideAllPanels();
    const panel = $('modeCapabilitiesPanel');
    if (panel) panel.style.display = 'block';
    if ($('settingsContentTitle')) {
        $('settingsContentTitle').textContent = i18n[currentLanguage].mode_capability_matrix || 'Mode Capability Matrix';
    }
    renderModeCapabilitiesPanel();
}

function loadModelTypeList() {
    const container = $('modelTypeList');
    if (!container) return;
    container.innerHTML = '';
    if (!window.allModels || window.allModels.length === 0) {
        container.innerHTML = '<p class="hint">暂无已启用的模型，请先在供应商中启用模型。</p>';
        return;
    }
    const byProvider = {};
    window.allModels.forEach(m => {
        const [pId] = m.value.split('::');
        if (!byProvider[pId]) byProvider[pId] = [];
        byProvider[pId].push(m);
    });
    for (const [pId, models] of Object.entries(byProvider)) {
        const provider = providers.find(p => p.id === pId);
        const providerName = provider ? provider.name : pId;
        const section = document.createElement('div');
        section.className = 'provider-type-section';
        section.innerHTML = `<h5>${providerName}</h5>`;
        models.forEach(m => {
            const row = document.createElement('div');
            row.className = 'model-type-row';
            row.innerHTML = `
                <span class="model-name">${m.label}</span>
                <select class="model-type-select" data-model-value="${m.value}">
                    <option value="chat" ${m.type === 'chat' ? 'selected' : ''}>💬 对话</option>
                    <option value="code" ${m.type === 'code' ? 'selected' : ''}>💻 编程</option>
                    <option value="image" ${m.type === 'image' ? 'selected' : ''}>🎨 图像生成</option>
                    <option value="video" ${m.type === 'video' ? 'selected' : ''}>🎬 视频生成</option>
                    <option value="ocr" ${m.type === 'ocr' ? 'selected' : ''}>📄 文字识别</option>
                    <option value="vision" ${m.type === 'vision' ? 'selected' : ''}>👁️ 图像理解</option>
                    <option value="translation" ${m.type === 'translation' ? 'selected' : ''}>🌐 翻译</option>
                </select>
            `;
            section.appendChild(row);
        });
        container.appendChild(section);
    }
}

async function saveModelTypes() {
    const selects = document.querySelectorAll('.model-type-select');
    const updates = {};
    selects.forEach(select => {
        const modelValue = select.dataset.modelValue;
        const [pId, modelId] = modelValue.split('::');
        const newType = select.value;
        if (!updates[pId]) updates[pId] = [];
        updates[pId].push({ id: modelId, type: newType });
    });
    let successCount = 0;
    for (const [pId, models] of Object.entries(updates)) {
        try {
            const res = await fetch('ai_proxy.php?action=update_provider_models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: pId, models })
            });
            const result = await res.json();
            if (result.success) successCount++;
        } catch (e) {
            console.error('更新失败', e);
        }
    }
    if (successCount === Object.keys(updates).length) {
        alert('所有模型类型已更新');
        await loadAllModels();
        loadModelTypeList();
    } else {
        alert('部分更新失败，请检查');
    }
}

function showPasswordSettings() {
    hideAllPanels();
    const panel = $('passwordPanel');
    if (panel) panel.style.display = 'block';
    $('settingsContentTitle').textContent = i18n[currentLanguage].password_settings;
}

function savePassword() {
    const pwd = $('settingsPassword').value;
    if (pwd) {
        localStorage.setItem('ai_settings_password', pwd);
        alert(i18n[currentLanguage].password_saved);
    } else {
        localStorage.removeItem('ai_settings_password');
        alert(i18n[currentLanguage].password_cleared);
    }
}

function presetProvider(type) {
    showAddProvider();
    let name = '', baseUrl = '', modelsPath = '/models', chatPath = '/chat/completions', 
        imageGenPath = '/images/generations', imageEditPath = '/images/edits', videoPath = '/videos/generations';
    switch(type) {
        case 'silicon':
            name = '硅基流动';
            baseUrl = 'https://api.siliconflow.cn/v1';
            break;
        case 'glm':
            name = '智谱 GLM';
            baseUrl = 'https://open.bigmodel.cn/api/paas/v4';
            break;
        case 'ali':
            name = '阿里通义';
            baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
            break;
        case 'deepseek':
            name = 'Deepseek';
            baseUrl = 'https://api.deepseek.com/v1';
            break;
        case 'baidu':
            name = '百度千帆';
            baseUrl = 'https://qianfan.baidubce.com/v2';
            break;
        case 'volcano':
            name = '火山方舟';
            baseUrl = 'https://ark.cn-beijing.volces.com/api/v3';
            break;
        default: return;
    }
    $('provName').value = name;
    $('provBaseUrl').value = baseUrl;
    $('provModelsPath').value = modelsPath;
    $('provChatPath').value = chatPath;
    $('provImageGenPath').value = imageGenPath;
    $('provImageEditPath').value = imageEditPath;
    $('provVideoPath').value = videoPath;
}

// ---------- 成本优化设置 ----------
async function showCostOptimizer() {
    hideAllPanels();
    const panel = $('costOptimizerPanel');
    if (panel) panel.style.display = 'block';
    $('settingsContentTitle').textContent = '💰 成本优化';

    // 填充廉价模型下拉框
    const lightSelect = $('costRoutingLightModel');
    if (lightSelect) {
        const currentVal = lightSelect.value;
        lightSelect.innerHTML = '<option value="">-- 未配置 --</option>';
        try {
            const res = await fetch('ai_proxy.php?action=list_models');
            const data = await res.json();
            if (data.models) {
                data.models.filter(m => m.type === 'chat').forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.value;
                    opt.textContent = m.label;
                    lightSelect.appendChild(opt);
                });
            }
        } catch (e) { console.error('加载模型列表失败', e); }
        lightSelect.value = currentVal;
    }

    // 加载当前设置
    try {
        const res = await fetch('ai_proxy.php?action=get_cost_settings');
        const data = await res.json();
        if (data.success && data.settings) {
            const s = data.settings;
            $('costSlidingEnabled').checked = s.sliding_window?.enabled ?? true;
            $('costSlidingMaxTokens').value = s.sliding_window?.max_tokens ?? 10000;
            $('costSlidingKeepFirst').value = s.sliding_window?.keep_first_rounds ?? 2;
            $('costSlidingKeepLast').value = s.sliding_window?.keep_last_rounds ?? 5;

            $('costRoutingEnabled').checked = s.model_routing?.enabled ?? false;
            if (lightSelect && s.model_routing?.light_model) {
                lightSelect.value = s.model_routing.light_model;
            }
            $('costRoutingMaxChars').value = s.model_routing?.simple_max_chars ?? 30;
            $('costRoutingKeywords').value = s.model_routing?.complex_keywords ?? '';

            $('costCompressEnabled').checked = s.compress_output?.enabled ?? false;
            $('costCompressInstruction').value = s.compress_output?.instruction ?? '';

            $('costKvEnabled').checked = s.kv_cache?.enabled ?? false;
            $('costKvTtl').value = s.kv_cache?.ttl ?? 3600;
            $('costKvLoose').checked = s.kv_cache?.loose_match ?? false;

            $('costMaxTokensEnabled').checked = s.smart_max_tokens?.enabled ?? false;
            $('costMaxTokensTiers').value = s.smart_max_tokens?.tiers ?? '20:512,100:1024,500:2048,0:4096';

            $('costPromptCompressEnabled').checked = s.prompt_compress?.enabled ?? false;
        }
    } catch (e) { console.error('加载成本设置失败', e); }
}

async function saveCostSettings() {
    const settings = {
        sliding_window: {
            enabled: $('costSlidingEnabled').checked,
            max_tokens: parseInt($('costSlidingMaxTokens').value) || 10000,
            keep_first_rounds: parseInt($('costSlidingKeepFirst').value) || 2,
            keep_last_rounds: parseInt($('costSlidingKeepLast').value) || 5
        },
        model_routing: {
            enabled: $('costRoutingEnabled').checked,
            light_model: $('costRoutingLightModel').value,
            simple_max_chars: parseInt($('costRoutingMaxChars').value) || 30,
            complex_keywords: $('costRoutingKeywords').value
        },
        compress_output: {
            enabled: $('costCompressEnabled').checked,
            instruction: $('costCompressInstruction').value
        },
        kv_cache: {
            enabled: $('costKvEnabled').checked,
            ttl: parseInt($('costKvTtl').value) || 3600,
            loose_match: $('costKvLoose').checked
        },
        smart_max_tokens: {
            enabled: $('costMaxTokensEnabled').checked,
            tiers: $('costMaxTokensTiers').value
        },
        prompt_compress: {
            enabled: $('costPromptCompressEnabled').checked
        }
    };

    try {
        const res = await fetch('ai_proxy.php?action=save_cost_settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
        });
        const data = await res.json();
        if (data.success) {
            alert('成本优化设置已保存');
        } else {
            alert('保存失败: ' + (data.error || '未知错误'));
        }
    } catch (e) {
        alert('保存失败: 网络错误');
    }
}

// ---------- 初始化绑定 ----------
window.addEventListener('load', function() {
    applyThemeSettings(loadThemeSettings());
    loadLanguage();
    loadConversations();
    loadProviders();
    initDragAndDrop();
    initHelpWindowDrag();
    $('category').value = 'chat';
    onCategoryChange();
    const imageModeEl = $('imageMode');
    if (imageModeEl) {
        imageModeEl.addEventListener('change', () => onCategoryChange());
    }
    loadPresets();
    loadWordConversions();

    const autoSwitchToggle = $('autoSwitchToggle');
    if (autoSwitchToggle) {
        autoSwitchToggle.checked = isAutoSwitchEnabled();
    }

    const menuItems = {
        autoSwitchMenuItem: showAutoSwitchSettings,
        presetManagerMenuItem: showPresetManager,
        ragMenuItem: showRagSettings,
        timeoutMenuItem: showTimeoutSettings,
        languageMenuItem: showLanguageSettings,
        profileMenuItem: showProfileSettings,
        skinMenuItem: showSkinSettings,
        pluginManagerMenuItem: showPluginManager,
        wordConversionMenuItem: showWordConversion,
        modeCapabilitiesMenuItem: showModeCapabilities,
        debugMenuItem: showDebugSettings
    };

    Object.entries(menuItems).forEach(([id, handler]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    });
    
    // 延迟检查已注册的插件（给插件加载时间）
    setTimeout(() => {
        const plugins = PluginSystem.getAllPlugins();
        if (plugins.length > 0) {
            console.log(`已加载 ${plugins.length} 个插件:`, plugins.map(p => p.id));
        }
    }, 500);

    loadDebugLogs();
    const debugToggle = $('debugModeToggle');
    if (debugToggle) debugToggle.checked = isDebugModeEnabled();
    loadRagSettings();
    loadRagStore();
    rebuildRagIndex();
    const ragFileInput = $('ragFileInput');
    if (ragFileInput) {
        ragFileInput.addEventListener('change', async (e) => {
            await importRagFiles(e.target.files);
            e.target.value = '';
        });
    }
});

// ---------- 显式挂载所有可能被内联onclick调用的函数到window ----------
window.newChat = newChat;
window.send = send;
window.onCategoryChange = onCategoryChange;
window.onProviderChange = onProviderChange;
window.previewAndCompress = previewAndCompress;
window.openHelpModal = openHelpModal;
window.closeHelpModal = closeHelpModal;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.toggleProviderList = toggleProviderList;
window.showAddProvider = showAddProvider;
window.showModelTypeManager = showModelTypeManager;
window.showPasswordSettings = showPasswordSettings;
window.savePassword = savePassword;
window.saveProvider = saveProvider;
window.deleteProvider = deleteProvider;
window.fetchModelsForCurrentProvider = fetchModelsForCurrentProvider;
window.saveSelectedModels = saveSelectedModels;
window.selectAllModels = selectAllModels;
window.deselectAllModels = deselectAllModels;
window.filterModelCheckboxes = filterModelCheckboxes;
window.saveModelTypes = saveModelTypes;
window.presetProvider = presetProvider;
window.savePreset = savePreset;
window.saveTimeoutSettings = saveTimeoutSettings;
window.saveLanguage = saveLanguage;
window.clearPresetForm = clearPresetForm;
window.showPresetManager = showPresetManager;
window.showTimeoutSettings = showTimeoutSettings;
window.showLanguageSettings = showLanguageSettings;
window.showProfileSettings = showProfileSettings;
window.saveProfileSettings = saveProfileSettings;
window.showSkinSettings = showSkinSettings;
window.saveSkinSettings = saveSkinSettings;
window.onThemePresetChange = onThemePresetChange;
window.showPluginManager = showPluginManager;
window.showDebugSettings = showDebugSettings;
window.toggleDebugMode = toggleDebugMode;
window.exportDebugLogs = exportDebugLogs;
window.clearDebugLogs = clearDebugLogs;
window.refreshDebugLogs = refreshDebugLogs;
window.executeDebugCommand = executeDebugCommand;
window.handleDebugCommandKeydown = handleDebugCommandKeydown;
window.showDebugHelp = showDebugHelp;
window.generateDiagnosticCode = generateDiagnosticCode;
window.togglePlugin = togglePlugin;
window.configurePlugin = configurePlugin;
window.showWordConversion = showWordConversion;
window.saveConversion = saveConversion;
window.clearConversionForm = clearConversionForm;
window.editConversion = editConversion;
window.deleteConversion = deleteConversion;
window.handleTextareaKeydown = handleTextareaKeydown;
window.toggleAutoSwitch = toggleAutoSwitch;
window.showAutoSwitchSettings = showAutoSwitchSettings;
window.showModeCapabilities = showModeCapabilities;
window.copyModeCapabilitiesMarkdown = copyModeCapabilitiesMarkdown;
window.saveAutoSwitchList = saveAutoSwitchList;
window.showRagSettings = showRagSettings;
window.saveRagSettings = saveRagSettings;
window.importRagFiles = importRagFiles;
window.deleteRagDoc = deleteRagDoc;
window.clearRagKnowledge = clearRagKnowledge;
window.showCostOptimizer = showCostOptimizer;
window.saveCostSettings = saveCostSettings;
window.removePreview = window.removePreview || function() {
    const preview = $('preview');
    const previewContainer = $('previewContainer');
    const fileInput = $('file-input');
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }
    if (typeof window.currentBase64 !== 'undefined') {
        window.currentBase64 = "";
    }
    if (typeof window.currentUploadMeta !== 'undefined') {
        window.currentUploadMeta = null;
    }
    if (typeof window.currentPdfText !== 'undefined') {
        window.currentPdfText = '';
    }
    if (typeof window.currentPdfPageImages !== 'undefined') {
        window.currentPdfPageImages = [];
    }
    removeImageMarkerFromInput();
    removeFileMarkerFromInput();
    if (fileInput) fileInput.value = '';
};