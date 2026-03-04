/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
// Plugin runtime moved to adachat-plugin-runtime.js

// ---------- 全局变量 ----------
let conversations = [];
let currentConvId = null;
window.currentBase64 = window.currentBase64 || "";
// 确保 allModels 只声明一次
if (typeof window.allModels === 'undefined') {
    window.allModels = [];
}
window.providers = window.providers || [];
let isReceiving = false;
window.pendingUserEditRestart = window.pendingUserEditRestart || null;

// 预设数据 { id, name, type, content }
var presets = [];
var currentActivePresetId = { system: null, role: null };

// 新增：文生图单词转换数据
var wordConversions = [];
var currentEditingConversionId = null;
const THEME_SETTINGS_KEY = 'theme_settings';
const CHAT_PROFILE_KEY = 'chat_profile_settings';
const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const SETTINGS_GROUP_STATE_KEY = 'adachat_settings_group_state_v1';
const MODE_CONFIG = window.AdaChatModeConfig || {};
const PDF_SCAN_MAX_PAGES = 5;

// 语言包（已拆分到 adachat-i18n.js）
const i18n = window.AdaChatI18n || { zh: {}, en: {} };

var currentLanguage = 'zh';

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

async function copyTextToClipboard(text) {
    const plain = String(text || '').trim();
    if (!plain) return false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(plain);
            return true;
        }
        const ta = document.createElement('textarea');
        ta.value = plain;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
    } catch (_) {
        return false;
    }
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
    conv.messages.forEach((msg, index) => {
        const built = buildMessageRow(msg, { convId: currentConvId, msgIndex: index });
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
        const built = buildMessageRow({ role: 'assistant', content: '' }, { convId, msgIndex: conv.messages.length - 1 });
        lastAiRow = built.row;
        lastAiDiv = built.bubble;
        lastContentEl = built.contentEl;
        logEl.appendChild(lastAiRow);
    } else {
        lastAiDiv = lastAiRow.querySelector('.ai');
        lastContentEl = lastAiRow.querySelector('.msg-content');
    }

    if (!lastAiDiv || !lastContentEl) return;

    lastAiDiv.classList.add('streaming');
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
        // Re-render once so streamed text gets final formatting and action buttons.
        renderCurrentConversation();
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
        window.providers = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.providers) ? raw.providers : []);
        const providerSelect = $('providerSelect');
        if (!providerSelect) return;
        
        providerSelect.innerHTML = '';
        if (window.providers.length > 0) {
            window.providers.forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = p.name;
                providerSelect.appendChild(option);
            });
            providerSelect.value = window.providers[0].id;
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

function buildHistoryMessagesForRequest(convId) {
    const conv = conversations.find(c => c.id === convId);
    if (!conv || !Array.isArray(conv.messages) || conv.messages.length === 0) return [];

    // Exclude the latest user message, which will be rebuilt with current upload context.
    const source = conv.messages.slice(0, -1);
    const history = [];

    for (const msg of source) {
        if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) continue;
        if (msg.role === 'assistant') {
            const text = String(msg.content || '').trim();
            if (!text) continue;
            history.push({ role: 'assistant', content: text });
            continue;
        }

        // Normalize UI markers and category prefixes in stored user display text.
        const raw = String(msg.content || '');
        const cleaned = normalizeUserInputText(
            raw.replace(/^\[(文生图|图生图|编程|文字识别|图像理解|翻译)\]\s*/i, '')
        );
        const hasImage = typeof msg.image === 'string' && msg.image.startsWith('data:image/');
        if (hasImage) {
            const content = [];
            if (cleaned) content.push({ type: 'text', text: cleaned });
            content.push({ type: 'image_url', image_url: { url: msg.image } });
            history.push({ role: 'user', content });
        } else if (cleaned) {
            history.push({ role: 'user', content: cleaned });
        }
    }
    return history;
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
        currentPdfPageImages,
        convId
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
        finalMessages.push(...buildHistoryMessagesForRequest(convId));
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
        stream: isChatLike,
        // Default client marker for first-party Ada Chat requests.
        client: 'adachat'
    };
    if (isChatLike) {
        const t = parseFloat(localStorage.getItem('samplingTemperature') || '0.7');
        if (Number.isFinite(t)) {
            requestBody.temperature = Math.max(0, Math.min(2, t));
        }
    }
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
            const responseHeaders = {};
            try {
                response.headers.forEach((value, key) => {
                    responseHeaders[key] = value;
                });
            } catch {}
            await PluginSystem.runHook("afterResponse", {
                requestBody,
                response: {
                    status: response.status,
                    ok: response.ok,
                    headers: responseHeaders
                },
                category,
                isChatLike,
                requestConvId,
                requestId: debugRequestId,
                attemptIndex: mi
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
    if (
        window.pendingUserEditRestart &&
        window.pendingUserEditRestart.convId === requestConvId
    ) {
        const conv = conversations.find(c => c.id === requestConvId);
        if (conv && Number.isInteger(window.pendingUserEditRestart.userIdx) && window.pendingUserEditRestart.userIdx >= 0) {
            conv.messages = conv.messages.slice(0, window.pendingUserEditRestart.userIdx);
            saveConversations();
            renderChatList();
            renderCurrentConversation();
        }
        window.pendingUserEditRestart = null;
    }
    const requestBuildContext = {
        category,
        imageMode,
        text,
        currentBase64,
        currentUploadMeta,
        currentPdfText,
        currentPdfPageImages,
        modelValue: modelSelect.value
    };
    const allowBuild = await PluginSystem.runHook("beforeBuildRequest", requestBuildContext);
    if (!allowBuild) {
        console.log("构建请求被插件拦截");
        addDebugLog('request_blocked_by_plugin', {
            request_id: debugRequestId,
            conv_id: requestConvId,
            stage: 'beforeBuildRequest'
        }, 'warn');
        return;
    }
    const reqCategory = requestBuildContext.category;
    const reqImageMode = requestBuildContext.imageMode;
    const reqText = requestBuildContext.text;
    const reqCurrentBase64 = requestBuildContext.currentBase64;
    const reqCurrentUploadMeta = requestBuildContext.currentUploadMeta;
    const reqCurrentPdfText = requestBuildContext.currentPdfText;
    const reqCurrentPdfPageImages = Array.isArray(requestBuildContext.currentPdfPageImages) ? requestBuildContext.currentPdfPageImages : [];
    const reqModelValue = requestBuildContext.modelValue || modelSelect.value;

    const categoryTags = {
        image: `[${reqImageMode === 'text2img' ? '文生图' : '图生图'}] ${reqText}`,
        code: `[编程] ${reqText}`,
        ocr: `[文字识别] ${reqText || '提取图片文字'}`,
        vision: `[图像理解] ${reqText || '分析图片内容'}`,
        translation: `[翻译] ${reqText || '翻译图片中的文字'}`
    };
    const uploadMetaSuffix = buildUploadDisplayMeta(reqCurrentBase64, reqCurrentUploadMeta, reqCurrentPdfPageImages);
    if (categoryTags[reqCategory]) {
        addMessageToCurrent(
            'user',
            categoryTags[reqCategory] + uploadMetaSuffix,
            requestConvId,
            {
                ...(reqCurrentBase64 ? { image: reqCurrentBase64 } : {}),
                requestMeta: {
                    category: reqCategory,
                    imageMode: reqImageMode || '',
                    provider: $('providerSelect')?.value || '',
                    model: reqModelValue || ''
                }
            }
        );
    } else {
        const userDisplayText = ((reqText || '') + uploadMetaSuffix).trim();
        addMessageToCurrent(
            'user',
            userDisplayText,
            requestConvId,
            {
                ...(reqCurrentBase64 ? { image: reqCurrentBase64 } : {}),
                requestMeta: {
                    category: reqCategory,
                    imageMode: reqImageMode || '',
                    provider: $('providerSelect')?.value || '',
                    model: reqModelValue || ''
                }
            }
        );
    }

    const { requestBody, isChatLike } = buildRequestPayload({
        category: reqCategory,
        imageMode: reqImageMode,
        text: reqText,
        currentBase64: reqCurrentBase64,
        currentUploadMeta: reqCurrentUploadMeta,
        currentPdfText: reqCurrentPdfText,
        currentPdfPageImages: reqCurrentPdfPageImages,
        modelValue: reqModelValue,
        convId: requestConvId
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

    isReceiving = true;
    $('sendBtn').disabled = true;

    const totalTimeout = (parseInt(localStorage.getItem('timeoutTotal') || '600')) * 1000;
    const idleTimeout = (parseInt(localStorage.getItem('timeoutIdle') || '120')) * 1000;
    await executeRequestWithFallback({
        requestBody,
        isChatLike,
        category: reqCategory,
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
    setSettingsMenuActive('pluginManagerMenuItem');
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
        const safeName = escapeHtml(plugin.name || plugin.id);
        const safeVersion = escapeHtml(plugin.version || '');
        const safeAuthor = escapeHtml(plugin.author || '');
        const safeDescription = escapeHtml(plugin.description || '');
        const enabled = MainApp.isPluginEnabled(plugin.id);
        html += `
            <div class="plugin-item" style="border:1px solid var(--border); border-radius:var(--radius-md); padding:16px; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:20px;">🧩</span>
                    <div style="flex:1;">
                        <strong>${safeName}</strong> 
                        ${safeVersion ? `v${safeVersion}` : ''} 
                        ${safeAuthor ? `<span style="color:var(--text-light);">by ${safeAuthor}</span>` : ''}
                        <div style="font-size:13px; color:var(--text-light); margin-top:4px;">${safeDescription}</div>
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
    
    setSettingsMenuActive('pluginManagerMenuItem');
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
    initializeSettingsGroups();
    clearSettingsMenuActive();
}

function closeSettings() {
    const modal = $('settingsModal');
    if(modal) modal.style.display = 'none';
}

function getSettingsGroupDefinitions() {
    return [
        { groupId: 'settingsGroupModelSubmenu', arrowId: 'settingsGroupModelArrow', defaultOpen: true },
        { groupId: 'settingsGroupCapabilitySubmenu', arrowId: 'settingsGroupCapabilityArrow', defaultOpen: true },
        { groupId: 'settingsGroupUiSubmenu', arrowId: 'settingsGroupUiArrow', defaultOpen: false },
        { groupId: 'settingsGroupDevSubmenu', arrowId: 'settingsGroupDevArrow', defaultOpen: false }
    ];
}

function loadSettingsGroupState() {
    try {
        const raw = localStorage.getItem(SETTINGS_GROUP_STATE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveSettingsGroupState() {
    const state = {};
    getSettingsGroupDefinitions().forEach(({ groupId }) => {
        const groupEl = $(groupId);
        if (!groupEl) return;
        state[groupId] = groupEl.style.display !== 'none';
    });
    localStorage.setItem(SETTINGS_GROUP_STATE_KEY, JSON.stringify(state));
}

function setSettingsGroupExpanded(groupId, arrowId, open) {
    const groupEl = $(groupId);
    const arrowEl = $(arrowId);
    if (!groupEl || !arrowEl) return;
    groupEl.style.display = open ? 'block' : 'none';
    arrowEl.textContent = open ? '▼' : '▶';
}

function toggleSettingsGroup(groupId, arrowId) {
    const groupEl = $(groupId);
    if (!groupEl) return;
    const isOpen = groupEl.style.display !== 'none';
    setSettingsGroupExpanded(groupId, arrowId, !isOpen);
    saveSettingsGroupState();
}

function initializeSettingsGroups() {
    const saved = loadSettingsGroupState();
    getSettingsGroupDefinitions().forEach(({ groupId, arrowId, defaultOpen }) => {
        const open = typeof saved[groupId] === 'boolean' ? saved[groupId] : defaultOpen;
        setSettingsGroupExpanded(groupId, arrowId, open);
    });
}

function clearSettingsMenuActive() {
    document.querySelectorAll('.settings-group-submenu .menu-item.active').forEach((el) => {
        el.classList.remove('active');
    });
}

function setSettingsMenuActive(menuItemId) {
    clearSettingsMenuActive();
    const el = $(menuItemId);
    if (!el) return;
    el.classList.add('active');

    const parentGroup = el.closest('.settings-group-submenu');
    if (!parentGroup || !parentGroup.id) return;

    const groupDef = getSettingsGroupDefinitions().find((x) => x.groupId === parentGroup.id);
    if (!groupDef) return;

    setSettingsGroupExpanded(groupDef.groupId, groupDef.arrowId, true);
    saveSettingsGroupState();
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
    setSettingsMenuActive('presetManagerMenuItem');
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
    setSettingsMenuActive('timeoutMenuItem');
    hideAllPanels();
    const panel = $('timeoutPanel');
    if (panel) {
        panel.style.display = 'block';
        const total = localStorage.getItem('timeoutTotal') || '600';
        const idle = localStorage.getItem('timeoutIdle') || '120';
        const temp = localStorage.getItem('samplingTemperature') || '0.7';
        $('timeoutTotal').value = total;
        $('timeoutIdle').value = idle;
        if ($('samplingTemperature')) $('samplingTemperature').value = temp;
    }
    $('settingsContentTitle').textContent = i18n[currentLanguage].timeout_settings;
}

function saveTimeoutSettings() {
    const total = parseInt($('timeoutTotal').value);
    const idle = parseInt($('timeoutIdle').value);
    const temp = parseFloat($('samplingTemperature')?.value ?? '0.7');
    if (isNaN(total) || total < 10) { alert('总超时必须≥10秒'); return; }
    if (isNaN(idle) || idle < 10) { alert('空闲超时必须≥10秒'); return; }
    if (!Number.isFinite(temp) || temp < 0 || temp > 2) { alert('温度必须在 0.0 到 2.0 之间'); return; }
    localStorage.setItem('timeoutTotal', total);
    localStorage.setItem('timeoutIdle', idle);
    localStorage.setItem('samplingTemperature', String(temp));
    alert(i18n[currentLanguage].timeout_saved);
}

function showLanguageSettings() {
    setSettingsMenuActive('languageMenuItem');
    hideAllPanels();
    const panel = $('languagePanel');
    if (panel) {
        panel.style.display = 'block';
        $('languageSelect').value = currentLanguage;
    }
    $('settingsContentTitle').textContent = i18n[currentLanguage].language;
}

function showProfileSettings() {
    setSettingsMenuActive('profileMenuItem');
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
    setSettingsMenuActive('debugMenuItem');
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

function showPasswordSettings() {
    setSettingsMenuActive('passwordMenuItem');
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
    setSettingsMenuActive('costOptimizerMenuItem');
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
        addProviderMenuItem: showAddProvider,
        modelTypeManagerMenuItem: showModelTypeManager,
        autoSwitchMenuItem: showAutoSwitchSettings,
        presetManagerMenuItem: showPresetManager,
        ragMenuItem: showRagSettings,
        timeoutMenuItem: showTimeoutSettings,
        languageMenuItem: showLanguageSettings,
        profileMenuItem: showProfileSettings,
        skinMenuItem: showSkinSettings,
        costOptimizerMenuItem: showCostOptimizer,
        passwordMenuItem: showPasswordSettings,
        pluginManagerMenuItem: showPluginManager,
        wordConversionMenuItem: showWordConversion,
        modeCapabilitiesMenuItem: showModeCapabilities,
        debugMenuItem: showDebugSettings
    };

    Object.entries(menuItems).forEach(([id, handler]) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', () => {
                setSettingsMenuActive(id);
                handler();
            });
        }
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
window.openSupportModal = openSupportModal;
window.closeSupportModal = closeSupportModal;
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
window.toggleSettingsGroup = toggleSettingsGroup;
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