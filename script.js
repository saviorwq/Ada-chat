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

// 语言包
const i18n = {
    zh: {
        app_title: "Ada Chat 开发版 V1.0 · 多模态",
        new_chat: "➕ 新建对话",
        settings: "⚙️ 设置",
        upload: "📁 传图",
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
        preset_manager: "预设管理",
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
        language: "切换语言",
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
        delete: "删除",
        edit: "编辑",
        confirm_delete_preset: "确定删除此预设吗？",
        preset_saved: "预设已保存",
        language_saved: "语言已保存，刷新页面生效",
        timeout_saved: "超时设置已保存",
        password_saved: "密码已保存",
        password_cleared: "密码已清除",
        plugin_manager_desc: "启用/禁用插件，配置插件设置",
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
        search_models_placeholder: "🔍 搜索模型名称..."
    },
    en: {
        app_title: "Ada Chat Dev V1.0 · Multimodal",
        new_chat: "➕ New Chat",
        settings: "⚙️ Settings",
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
        preset_manager: "Preset Manager",
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
        language: "Language",
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
        delete: "Delete",
        edit: "Edit",
        confirm_delete_preset: "Delete this preset?",
        preset_saved: "Preset saved",
        language_saved: "Language saved, refresh to apply",
        timeout_saved: "Timeout saved",
        password_saved: "Password saved",
        password_cleared: "Password cleared",
        plugin_manager_desc: "Enable/disable plugins and configure plugin settings",
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
        search_models_placeholder: "🔍 Search model name..."
    }
};

let currentLanguage = 'zh';

// ---------- 工具函数 ----------
function $(id) {
    return document.getElementById(id);
}

function updateUILanguage() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[currentLanguage] && i18n[currentLanguage][key]) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                if (el.getAttribute('placeholder') !== null) {
                    el.setAttribute('placeholder', i18n[currentLanguage][key]);
                }
            } else if (el.tagName === 'OPTION') {
                el.textContent = i18n[currentLanguage][key];
            } else {
                el.textContent = i18n[currentLanguage][key];
            }
        }
    });
    document.title = i18n[currentLanguage].app_title;
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
        if (msg.role === 'user') {
            const userDiv = document.createElement('div');
            userDiv.className = 'user';
            userDiv.textContent = msg.content;
            logEl.appendChild(userDiv);
        } else {
            const aiDiv = document.createElement('div');
            aiDiv.className = 'ai';
            if (msg.content.startsWith('生成图片：')) {
                const imgUrl = msg.content.substring(5);
                const img = document.createElement('img');
                img.src = imgUrl;
                img.style.maxWidth = '100%';
                img.style.maxHeight = '400px';
                img.style.border = '1px solid #10b981';
                img.style.borderRadius = '12px';
                aiDiv.appendChild(img);
            } else {
                aiDiv.textContent = msg.content;
            }
            logEl.appendChild(aiDiv);
        }
    });
    logEl.scrollTop = logEl.scrollHeight;
}

function addMessageToCurrent(role, content) {
    const conv = conversations.find(c => c.id === currentConvId);
    if (!conv) return;
    conv.messages.push({ role, content });
    if (role === 'user') {
        updateConversationTitle(currentConvId, content);
    }
    saveConversations();
    renderCurrentConversation();
}

function appendToLastAIMessage(chunk) {
    const conv = conversations.find(c => c.id === currentConvId);
    if (!conv) return;
    if (conv.messages.length === 0 || conv.messages[conv.messages.length-1].role !== 'assistant') {
        conv.messages.push({ role: 'assistant', content: chunk });
    } else {
        conv.messages[conv.messages.length-1].content += chunk;
    }

    const logEl = $('log');
    let lastAiDiv = logEl.querySelector('.ai:last-child');
    if (!lastAiDiv) {
        lastAiDiv = document.createElement('div');
        lastAiDiv.className = 'ai';
        logEl.appendChild(lastAiDiv);
    }

    if (chunk.startsWith('生成图片：')) {
        const imgUrl = chunk.substring(5);
        lastAiDiv.innerHTML = '';
        const img = document.createElement('img');
        img.src = imgUrl;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '400px';
        img.style.border = '1px solid #10b981';
        img.style.borderRadius = '12px';
        lastAiDiv.appendChild(img);
    } else {
        if (lastAiDiv.innerHTML === '') {
            lastAiDiv.textContent = chunk;
        } else {
            lastAiDiv.textContent += chunk;
        }
    }
    logEl.scrollTop = logEl.scrollHeight;
}

function finishAIMessage() {
    const conv = conversations.find(c => c.id === currentConvId);
    if (conv) {
        saveConversations();
    }
    const lastAiDiv = $('log').querySelector('.ai:last-child');
    if (lastAiDiv) {
        lastAiDiv.classList.remove('streaming');
    }
    isReceiving = false;
    $('sendBtn').disabled = false;
}

// ---------- 供应商和模型逻辑 ----------
async function loadProviders() {
    try {
        const res = await fetch('ai_proxy.php?action=get_providers');
        providers = await res.json();
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
    const modeRow = $('modeRow');
    if (modeRow) {
        modeRow.style.display = category === 'image' ? 'flex' : 'none';
    }
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
        if (file.type.startsWith('image/')) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            $('file-input').files = dataTransfer.files;
            previewAndCompress();
        } else {
            alert('请拖拽图片文件');
        }
    }
}

function previewAndCompress() {
    const file = $('file-input').files[0];
    if (!file) return;

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
            const preview = $('preview');
            if (preview) {
                preview.src = window.currentBase64;
                preview.style.display = 'block';
                $('previewContainer').style.display = 'flex';
            }
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

// ---------- 发送请求（使用激活的预设和单词转换）----------
async function send() {
    const msgInput = $('msg');
    const modelSelect = $('model');
    const category = $('category').value;
    const imageMode = $('imageMode')?.value;
    const currentBase64 = window.currentBase64;

    let text = msgInput.value;

    if (category === 'ocr' && !currentBase64) {
        alert(i18n[currentLanguage].ocr_need_image || '请先上传需要识别文字的图片');
        return;
    }
    if (category === 'vision' && !currentBase64) {
        alert(i18n[currentLanguage].vision_need_image || '请先上传需要分析的图片');
        return;
    }
    if (category === 'translation' && !text && !currentBase64) {
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

    const categoryTags = {
        image: `[${imageMode === 'text2img' ? '文生图' : '图生图'}] ${text}`,
        code: `[编程] ${text}`,
        ocr: `[文字识别] ${text || '提取图片文字'}`,
        vision: `[图像理解] ${text || '分析图片内容'}`,
        translation: `[翻译] ${text || '翻译图片中的文字'}`
    };
    if (categoryTags[category]) {
        addMessageToCurrent('user', categoryTags[category] + (currentBase64 ? ' (图片)' : ''));
    } else {
        addMessageToCurrent('user', text);
    }

    let finalPrompt = text;
    let finalMessages = null;

    const chatLikeCategories = ['chat', 'code', 'ocr', 'vision', 'translation'];
    const categorySystemPrompts = {
        code: "你是一个高级编程助手。请根据用户需求生成高质量代码，或对用户提供的代码进行分析、优化、调试。回复中使用 Markdown 代码块格式，注明编程语言。解释要简明扼要。",
        ocr: "你是一个专业的文字识别(OCR)助手。请准确识别用户上传图片中的所有文字内容，严格按照原始排版格式输出，不要遗漏任何文字，不要添加额外解释。",
        vision: "你是一个专业的图像分析助手，擅长视觉理解。根据用户的指令分析上传的图片。你可以：分析服装穿搭与造型风格、描述场景与物体、解读图表数据、鉴别物品、评估设计等。请给出准确、详细且有条理的分析结果。",
        translation: "你是一个专业翻译助手。请将用户提供的文本翻译为目标语言。如果用户没有指定目标语言：中文内容翻译为英文，其他语言翻译为中文。保持原文的格式和语气，翻译要自然流畅。如果用户上传了图片，请先识别图中文字再进行翻译。"
    };
    const categoryDefaultText = {
        ocr: '请识别这张图片中的所有文字，按原始排版输出。',
        vision: '请详细分析这张图片的内容。',
        translation: '请翻译这张图片中的所有文字。'
    };

    if (chatLikeCategories.includes(category)) {
        const activeSystemId = currentActivePresetId.system;
        const systemPreset = presets.find(p => p.id === activeSystemId && p.type === 'system');

        let userText = text || categoryDefaultText[category] || text;

        let content = [{ type: "text", text: userText }];
        if (currentBase64) {
            content.push({ type: "image_url", image_url: { url: currentBase64 } });
        }
        finalMessages = [];
        if (categorySystemPrompts[category]) {
            finalMessages.push({ role: "system", content: categorySystemPrompts[category] });
        } else if (systemPreset) {
            finalMessages.push({ role: "system", content: systemPreset.content });
        }
        finalMessages.push({ role: "user", content: content });
    } else if (category === 'image') {
        const activeRoleId = currentActivePresetId.role;
        const rolePreset = presets.find(p => p.id === activeRoleId && p.type === 'role');
        if (rolePreset) {
            finalPrompt = rolePreset.content + "\n" + text;
        }
    }

    const isChatLike = chatLikeCategories.includes(category);
    const requestBody = {
        model: modelSelect.value,
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

    const autoSwitch = isAutoSwitchEnabled();
    let modelsToTry = [requestBody.model];
    if (autoSwitch) {
        modelsToTry = [...modelsToTry, ...getAlternateModels(category, requestBody.model)];
    }

    const allow = await PluginSystem.runHook("beforeSend", requestBody);
    if (!allow) {
        console.log("发送被插件拦截");
        isReceiving = false;
        $('sendBtn').disabled = false;
        return;
    }

    for (let mi = 0; mi < modelsToTry.length; mi++) {
        requestBody.model = modelsToTry[mi];

        if (mi > 0) {
            const label = getModelLabel(modelsToTry[mi]);
            appendToLastAIMessage('\n' + i18n[currentLanguage].auto_switch_notice + label + '\n');
            showAutoSwitchToast(label);
            const modelSelect = $('model');
            if (modelSelect) modelSelect.value = modelsToTry[mi];
        }

        let shouldRetry = false;

        try {
            const response = await fetch('ai_proxy.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
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
                                        appendToLastAIMessage(textChunk);
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
            } else if (!shouldRetry) {
                const result = await response.json();
                if (result.error) {
                    if (autoSwitch && mi < modelsToTry.length - 1 && isRateLimitMessage(result.error)) {
                        appendToLastAIMessage('[' + result.error + ']');
                        shouldRetry = true;
                    } else {
                        appendToLastAIMessage('错误：' + result.error);
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
                        appendToLastAIMessage('生成图片：' + imageUrl);
                    } else {
                        appendToLastAIMessage(JSON.stringify(result, null, 2));
                    }
                }
            }

            if (shouldRetry) continue;
            break;

        } catch (e) {
            console.error('请求失败', e);
            if (autoSwitch && mi < modelsToTry.length - 1 && isRateLimitMessage(e.message)) {
                continue;
            }
            appendToLastAIMessage('\n\n[错误] ' + e.message);
            break;
        }
    }

    finishAIMessage();
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
    if($('providerListSubmenu')) $('providerListSubmenu').style.display = 'block';
    if($('providerListArrow')) $('providerListArrow').textContent = '▼';
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
        'presetManagerPanel', 'timeoutPanel', 'languagePanel',
        'pluginManagerPanel', 'pluginConfigPanel', 'defaultPlaceholder',
        'wordConversionPanel', 'autoSwitchPanel', 'costOptimizerPanel'
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
        const providerList = await res.json();
        providers = providerList;

        submenu.innerHTML = '';

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
    loadLanguage();
    loadConversations();
    loadProviders();
    initDragAndDrop();
    $('category').value = 'chat';
    loadPresets();
    loadWordConversions();

    const autoSwitchToggle = $('autoSwitchToggle');
    if (autoSwitchToggle) {
        autoSwitchToggle.checked = isAutoSwitchEnabled();
    }

    const menuItems = {
        autoSwitchMenuItem: showAutoSwitchSettings,
        presetManagerMenuItem: showPresetManager,
        timeoutMenuItem: showTimeoutSettings,
        languageMenuItem: showLanguageSettings,
        pluginManagerMenuItem: showPluginManager,
        wordConversionMenuItem: showWordConversion
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
});

// ---------- 显式挂载所有可能被内联onclick调用的函数到window ----------
window.newChat = newChat;
window.send = send;
window.onCategoryChange = onCategoryChange;
window.onProviderChange = onProviderChange;
window.previewAndCompress = previewAndCompress;
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
window.showPluginManager = showPluginManager;
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
window.saveAutoSwitchList = saveAutoSwitchList;
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
    if (fileInput) fileInput.value = '';
};