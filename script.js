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
const VIDEO_TASK_POLL_INTERVAL_MS = 5000;
const VIDEO_TASK_POLL_MAX_ATTEMPTS = 72;

// 语言包（已拆分到 adachat-i18n.js）
const i18n = window.AdaChatI18n || { zh: {}, en: {} };

var currentLanguage = 'zh';
const UPDATE_CURRENT_VERSION = 'v1.1.0';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_STORAGE_KEYS = {
    auto: 'update_auto_check_enabled',
    lastCheckedAt: 'update_last_checked_at',
    latestTag: 'update_latest_tag',
    latestName: 'update_latest_name',
    latestBody: 'update_latest_body',
    latestUrl: 'update_latest_url',
    latestPublishedAt: 'update_latest_published_at',
    seenTag: 'update_seen_tag'
};
let updateRuntimeState = {
    latestTag: '',
    latestName: '',
    latestBody: '',
    latestUrl: '',
    latestPublishedAt: '',
    hasNew: false
};

// ---------- 工具函数 ----------
function $(id) {
    return document.getElementById(id);
}

function normalizeVersionTag(tag) {
    return String(tag || '').trim().replace(/^v/i, '');
}

function compareSemver(a, b) {
    const pa = normalizeVersionTag(a).split('.').map((x) => parseInt(x, 10));
    const pb = normalizeVersionTag(b).split('.').map((x) => parseInt(x, 10));
    const maxLen = Math.max(pa.length, pb.length);
    for (let i = 0; i < maxLen; i++) {
        const na = Number.isFinite(pa[i]) ? pa[i] : 0;
        const nb = Number.isFinite(pb[i]) ? pb[i] : 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

function isUpdateAutoCheckEnabled() {
    const v = localStorage.getItem(UPDATE_STORAGE_KEYS.auto);
    if (v === null) return true;
    return v === '1';
}

function setUpdateAutoCheckEnabled(enabled) {
    localStorage.setItem(UPDATE_STORAGE_KEYS.auto, enabled ? '1' : '0');
}

function setUpdateIndicators(hasUpdate) {
    const settingsBtn = $('settingsBtn');
    const updateMenuItem = $('updateMenuItem');
    if (settingsBtn) settingsBtn.classList.toggle('has-update', !!hasUpdate);
    if (updateMenuItem) updateMenuItem.classList.toggle('update-available', !!hasUpdate);
}

function updatePanelStatusText(latestInfo = null) {
    const currentVersionEl = $('updateCurrentVersion');
    const latestVersionEl = $('updateLatestVersion');
    const lastCheckedEl = $('updateLastChecked');
    const whatsNewEl = $('updateWhatsNew');
    if (currentVersionEl) currentVersionEl.textContent = UPDATE_CURRENT_VERSION;
    if (latestVersionEl) {
        latestVersionEl.textContent = latestInfo?.tag || localStorage.getItem(UPDATE_STORAGE_KEYS.latestTag) || '-';
    }
    if (lastCheckedEl) {
        const ts = parseInt(localStorage.getItem(UPDATE_STORAGE_KEYS.lastCheckedAt) || '0', 10);
        lastCheckedEl.textContent = ts > 0 ? new Date(ts).toLocaleString() : '-';
    }
    if (whatsNewEl) {
        const body = latestInfo?.body || localStorage.getItem(UPDATE_STORAGE_KEYS.latestBody) || '';
        whatsNewEl.textContent = body.trim() || '-';
    }
}

function markUpdateSeen(tag) {
    const latestTag = tag || localStorage.getItem(UPDATE_STORAGE_KEYS.latestTag) || '';
    if (!latestTag) return;
    localStorage.setItem(UPDATE_STORAGE_KEYS.seenTag, latestTag);
    setUpdateIndicators(false);
}

async function fetchLatestReleaseInfo() {
    const res = await fetch('ai_proxy.php?action=check_update', { method: 'GET' });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data || !data.success || !data.release) {
        throw new Error(data?.message || data?.error || 'update_check_failed');
    }
    return {
        tag: String(data.release.tag || '').trim(),
        name: String(data.release.name || '').trim(),
        body: String(data.release.body || '').trim(),
        url: String(data.release.url || '').trim(),
        publishedAt: String(data.release.publishedAt || '').trim()
    };
}

async function checkForUpdates(options = {}) {
    const { manual = false, force = false } = options;
    const now = Date.now();
    const lastChecked = parseInt(localStorage.getItem(UPDATE_STORAGE_KEYS.lastCheckedAt) || '0', 10);
    const needNetwork = force || !lastChecked || (now - lastChecked) > UPDATE_CHECK_INTERVAL_MS;
    try {
        let info = null;
        if (needNetwork || manual) {
            info = await fetchLatestReleaseInfo();
            localStorage.setItem(UPDATE_STORAGE_KEYS.lastCheckedAt, String(now));
            localStorage.setItem(UPDATE_STORAGE_KEYS.latestTag, info.tag || '');
            localStorage.setItem(UPDATE_STORAGE_KEYS.latestName, info.name || '');
            localStorage.setItem(UPDATE_STORAGE_KEYS.latestBody, info.body || '');
            localStorage.setItem(UPDATE_STORAGE_KEYS.latestUrl, info.url || '');
            localStorage.setItem(UPDATE_STORAGE_KEYS.latestPublishedAt, info.publishedAt || '');
        } else {
            info = {
                tag: localStorage.getItem(UPDATE_STORAGE_KEYS.latestTag) || '',
                name: localStorage.getItem(UPDATE_STORAGE_KEYS.latestName) || '',
                body: localStorage.getItem(UPDATE_STORAGE_KEYS.latestBody) || '',
                url: localStorage.getItem(UPDATE_STORAGE_KEYS.latestUrl) || '',
                publishedAt: localStorage.getItem(UPDATE_STORAGE_KEYS.latestPublishedAt) || ''
            };
        }
        const seenTag = localStorage.getItem(UPDATE_STORAGE_KEYS.seenTag) || '';
        const hasNewVersion = compareSemver(info.tag, UPDATE_CURRENT_VERSION) > 0;
        const shouldBlink = hasNewVersion && info.tag !== seenTag;
        updateRuntimeState = {
            latestTag: info.tag,
            latestName: info.name,
            latestBody: info.body,
            latestUrl: info.url,
            latestPublishedAt: info.publishedAt,
            hasNew: hasNewVersion
        };
        setUpdateIndicators(shouldBlink);
        updatePanelStatusText(info);
        if (manual) {
            if (hasNewVersion) {
                const msg = (i18n[currentLanguage].update_found || '发现新版本：{version}').replace('{version}', info.tag || '-');
                showAppToast(msg, 3000);
            } else {
                showAppToast(i18n[currentLanguage].update_no_new || '当前已是最新版本。', 2400);
            }
        }
        return updateRuntimeState;
    } catch (err) {
        if (manual) {
            const msgTpl = i18n[currentLanguage].update_check_failed || '检查更新失败：{message}';
            showAppToast(msgTpl.replace('{message}', err?.message || String(err)), 2800);
        }
        throw err;
    }
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

function moveConversationToTop(convId) {
    const idx = conversations.findIndex(c => c.id === convId);
    if (idx <= 0) return;
    const [conv] = conversations.splice(idx, 1);
    conversations.unshift(conv);
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
    moveConversationToTop(id);
    saveConversations();
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
    moveConversationToTop(convId);
    if (role === 'user') {
        updateConversationTitle(convId, content);
    }
    saveConversations();
    renderChatList();
    if (convId === currentConvId) {
        renderCurrentConversation();
    }
}

function updateLastAssistantRequestMeta(convId = currentConvId, partial = {}) {
    const conv = conversations.find(c => c.id === convId);
    if (!conv || !Array.isArray(conv.messages) || conv.messages.length === 0) return;
    for (let i = conv.messages.length - 1; i >= 0; i--) {
        const msg = conv.messages[i];
        if (msg && msg.role === 'assistant') {
            msg.requestMeta = { ...(msg.requestMeta || {}), ...(partial || {}) };
            return;
        }
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

function showAppToast(message, durationMs = 2200) {
    const text = String(message || '').trim();
    if (!text) return;
    let container = $('adachatToastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'adachatToastContainer';
        container.className = 'adachat-toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'adachat-toast';
    toast.textContent = text;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 220);
    }, Math.max(1200, durationMs));
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
    const videoOptionsRow = $('videoOptionsRow');
    const modeSelect = $('imageMode');
    const modeHint = modeRow ? modeRow.querySelector('.hint') : null;
    if (modeRow) {
        modeRow.style.display = (category === 'image' || category === 'video') ? 'flex' : 'none';
    }
    if (modeSelect && category === 'image') {
        modeSelect.innerHTML = '<option value="text2img">文生图</option><option value="img2img">图生图</option>';
        modeSelect.value = (imageMode === 'img2img') ? 'img2img' : 'text2img';
        if (modeHint) modeHint.textContent = '≤1MB';
    } else if (modeSelect && category === 'video') {
        modeSelect.innerHTML = '<option value="text2video">文生视频</option><option value="img2video">图生视频</option>';
        modeSelect.value = (imageMode === 'img2video') ? 'img2video' : 'text2video';
        if (modeHint) modeHint.textContent = '可选封面图';
    }
    if (videoOptionsRow) {
        videoOptionsRow.style.display = category === 'video' ? 'flex' : 'none';
    }
    const advInput = $('advancedParamsInput');
    if (advInput) {
        advInput.value = getAdvancedParamsForCategory(category);
    }
    updateUploadAcceptByMode(category, modeSelect?.value || imageMode);
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

function toggleAdvancedParams() {
    const row = $('advancedParamsRow');
    if (!row) return;
    const isOpen = row.style.display === 'block';
    row.style.display = isOpen ? 'none' : 'block';
}

function getAdvancedParamsForCategory(category) {
    try {
        const raw = localStorage.getItem('adachat_advanced_params_v1') || '{}';
        const map = JSON.parse(raw);
        return String(map?.[category] || '');
    } catch (_) {
        return '';
    }
}

function setAdvancedParamsForCategory(category, text) {
    try {
        const raw = localStorage.getItem('adachat_advanced_params_v1') || '{}';
        const map = JSON.parse(raw);
        map[category] = String(text || '');
        localStorage.setItem('adachat_advanced_params_v1', JSON.stringify(map));
    } catch (_) {}
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
            raw.replace(/^\[(文生图|图生图|文生视频|图生视频|视频生成|编程|文字识别|图像理解|翻译)\]\s*/i, '')
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
    let userText = text || '';

    if (isChatLike) {
        const activeSystemId = currentActivePresetId.system;
        const systemPreset = presets.find(p => p.id === activeSystemId && p.type === 'system');

        userText = text || categoryDefaultText[category] || text;
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
        const topP = parseFloat(localStorage.getItem('samplingTopP') || '1');
        if (Number.isFinite(topP)) {
            requestBody.top_p = Math.max(0, Math.min(1, topP));
        }
        const presencePenalty = parseFloat(localStorage.getItem('samplingPresencePenalty') || '0');
        if (Number.isFinite(presencePenalty)) {
            requestBody.presence_penalty = Math.max(-2, Math.min(2, presencePenalty));
        }
        const frequencyPenalty = parseFloat(localStorage.getItem('samplingFrequencyPenalty') || '0');
        if (Number.isFinite(frequencyPenalty)) {
            requestBody.frequency_penalty = Math.max(-2, Math.min(2, frequencyPenalty));
        }
        const maxTokensRaw = (localStorage.getItem('samplingMaxTokens') || '').trim();
        if (maxTokensRaw !== '') {
            const mt = parseInt(maxTokensRaw, 10);
            if (Number.isFinite(mt) && mt > 0) {
                requestBody.max_tokens = mt;
            }
        }
        const stopRaw = localStorage.getItem('samplingStopSequences') || '';
        const stopList = stopRaw
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(Boolean)
            .slice(0, 8);
        if (stopList.length) {
            requestBody.stop = stopList;
        }
    }
    if (category === 'image') {
        requestBody.mode = imageMode;
        if (imageMode === 'img2img' && currentBase64) {
            requestBody.image = currentBase64;
        }
    } else if (category === 'video') {
        requestBody.mode = imageMode || 'text2video';
        if (requestBody.mode === 'img2video' && currentBase64) {
            requestBody.image = currentBase64;
        }
        const duration = parseInt($('videoDuration')?.value || '', 10);
        if (Number.isFinite(duration) && duration > 0) requestBody.video_duration = duration;
        const fps = parseInt($('videoFps')?.value || '', 10);
        if (Number.isFinite(fps) && fps > 0) requestBody.video_fps = fps;
        const frames = parseInt($('videoFrames')?.value || '', 10);
        if (Number.isFinite(frames) && frames > 0) requestBody.video_num_frames = frames;
        const size = String($('videoSize')?.value || '').trim();
        if (/^\d{2,5}x\d{2,5}$/.test(size)) requestBody.video_size = size;
    } else if (isChatLike) {
        requestBody.messages = finalMessages;
        if (typeof buildRagRequestPayload === 'function') {
            requestBody.rag = buildRagRequestPayload(userText);
        }
    } else {
        requestBody.prompt = text;
    }

    // 高级参数透传：用户可输入任意 JSON 键值，按供应商能力自行消费
    const advancedRaw = String($('advancedParamsInput')?.value || '').trim();
    if (advancedRaw) {
        try {
            const obj = JSON.parse(advancedRaw);
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                Object.keys(obj).forEach((k) => {
                    if (k === 'model' || k === 'task') return;
                    requestBody[k] = obj[k];
                });
            }
        } catch (_) {
            // 由 send() 入口统一做报错提示，这里静默
        }
    }

    return { requestBody, isChatLike };
}

function sleepMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function extractVideoUrlFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const direct = [
        payload.video_url,
        payload.video,
        payload.url,
        payload.output_url,
        payload.result_url,
        payload.download_url
    ];
    for (const item of direct) {
        if (typeof item === 'string' && /^https?:\/\//i.test(item)) return item;
    }
    for (const value of Object.values(payload)) {
        if (Array.isArray(value)) {
            for (const child of value) {
                const nested = extractVideoUrlFromPayload(child);
                if (nested) return nested;
            }
        } else if (value && typeof value === 'object') {
            const nested = extractVideoUrlFromPayload(value);
            if (nested) return nested;
        }
    }
    return '';
}

function extractVideoTaskIdFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const direct = [
        payload.task_id,
        payload.id,
        payload.job_id,
        payload.taskId
    ];
    for (const item of direct) {
        if (item !== undefined && item !== null) {
            const text = String(item).trim();
            if (text) return text;
        }
    }
    for (const value of Object.values(payload)) {
        if (Array.isArray(value)) {
            for (const child of value) {
                const nested = extractVideoTaskIdFromPayload(child);
                if (nested) return nested;
            }
        } else if (value && typeof value === 'object') {
            const nested = extractVideoTaskIdFromPayload(value);
            if (nested) return nested;
        }
    }
    return '';
}

function normalizeTaskStatusText(input) {
    return String(input || '').trim().toLowerCase();
}

function isVideoTaskFailed(payload, statusText = '') {
    const status = normalizeTaskStatusText(statusText || payload?.status || payload?.state || payload?.task_status || payload?.phase);
    const failedStates = new Set(['failed', 'error', 'canceled', 'cancelled', 'rejected', 'timeout', 'expired']);
    if (failedStates.has(status)) return true;
    if (payload && typeof payload === 'object' && payload.error) return true;
    return false;
}

async function pollVideoTaskUntilDone(ctx) {
    const {
        requestConvId,
        debugRequestId,
        modelValue,
        taskId,
        requestBody
    } = ctx;
    if (!taskId || !modelValue) return { ok: false, reason: 'missing_task_or_model' };

    for (let attempt = 1; attempt <= VIDEO_TASK_POLL_MAX_ATTEMPTS; attempt++) {
        try {
            const pollPayload = {
                model: modelValue,
                task_id: taskId
            };
            const pollBridgeFields = [
                'video_poll_url', 'video_status_path', 'video_poll_method', 'video_poll_body',
                'poll_url', 'status_path', 'poll_method', 'poll_body'
            ];
            pollBridgeFields.forEach((k) => {
                if (Object.prototype.hasOwnProperty.call(requestBody || {}, k)) {
                    pollPayload[k] = requestBody[k];
                }
            });

            const res = await fetch('ai_proxy.php?action=video_task_status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pollPayload)
            });
            if (!res.ok) {
                throw new Error(`poll HTTP ${res.status}`);
            }
            const pollJson = await res.json();
            if (!pollJson || pollJson.success === false) {
                throw new Error(String(pollJson?.error || pollJson?.message || 'poll_failed'));
            }
            const data = pollJson.data || {};
            const videoUrl = pollJson.video_url || extractVideoUrlFromPayload(data);
            const statusText = normalizeTaskStatusText(
                pollJson.status || data.status || data.state || data.task_status || data.phase
            );
            if (videoUrl) {
                addDebugLog('video_task_poll_done', {
                    request_id: debugRequestId,
                    conv_id: requestConvId,
                    task_id: taskId,
                    attempt,
                    status: statusText || 'done'
                });
                return { ok: true, videoUrl, status: statusText, data };
            }
            if (pollJson.is_failed || isVideoTaskFailed(data, statusText)) {
                const errMsg = String(data.error || pollJson.error || statusText || 'video_task_failed');
                return { ok: false, failed: true, status: statusText, error: errMsg, data };
            }
            if (attempt === 1 || attempt % 3 === 0) {
                const showStatus = statusText || (i18n[currentLanguage].video_task_status_processing || 'processing');
                const tpl = i18n[currentLanguage].video_task_processing_msg || 'Video task processing ({attempt}/{max}): {status}';
                const msg = tpl
                    .replace('{attempt}', String(attempt))
                    .replace('{max}', String(VIDEO_TASK_POLL_MAX_ATTEMPTS))
                    .replace('{status}', showStatus);
                appendToLastAIMessage(`\n${msg}`, requestConvId);
            }
        } catch (e) {
            if (attempt === VIDEO_TASK_POLL_MAX_ATTEMPTS) {
                return { ok: false, reason: 'poll_exception', error: String(e?.message || e) };
            }
        }
        await sleepMs(VIDEO_TASK_POLL_INTERVAL_MS);
    }
    return { ok: false, reason: 'poll_timeout' };
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
            updateLastAssistantRequestMeta(requestConvId, { model: modelsToTry[mi] });
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
                const ctype = String(response.headers.get('content-type') || '').toLowerCase();
                const isSSE = ctype.includes('text/event-stream');
                let streamContent = '';

                // Fallback path: some providers return non-SSE JSON even when stream=true.
                if (!isSSE) {
                    const raw = await response.text();
                    let parsed = null;
                    try { parsed = JSON.parse(raw); } catch (_) {}
                    const msgText = parsed?.choices?.[0]?.message?.content
                        || parsed?.choices?.[0]?.delta?.content
                        || parsed?.error
                        || '';
                    if (msgText) {
                        streamContent = String(msgText);
                        appendToLastAIMessage(streamContent, requestConvId);
                    } else if (raw && raw.trim()) {
                        streamContent = raw.trim();
                        appendToLastAIMessage(streamContent, requestConvId);
                    } else {
                        appendToLastAIMessage('[空响应]', requestConvId);
                    }
                } else {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder('utf-8');
                    let buffer = '';
                    let rawStreamText = '';
                    const startTime = Date.now();

                    const consumeLine = (line) => {
                        const trimmed = String(line || '').trim();
                        if (!trimmed.startsWith('data:')) return;
                        const data = trimmed.substring(5).trim();
                        if (!data || data === '[DONE]') return;
                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta;
                            const msg = parsed.choices?.[0]?.message;
                            const textChunk = delta?.content || delta?.reasoning_content || msg?.content || '';
                            if (textChunk) {
                                streamContent += textChunk;
                                appendToLastAIMessage(textChunk, requestConvId);
                            }
                        } catch (e) {
                            console.warn('解析流数据失败', e, data);
                        }
                    };

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
                        const chunkText = decoder.decode(value, { stream: true });
                        rawStreamText += chunkText;
                        buffer += chunkText;
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';
                        for (const line of lines) {
                            consumeLine(line);
                        }
                    }

                    // Flush tail buffer without trailing newline.
                    if (buffer && buffer.trim()) {
                        consumeLine(buffer);
                    }

                    // Last fallback for non-standard streaming payloads.
                    if (!streamContent && rawStreamText.trim()) {
                        let parsed = null;
                        try { parsed = JSON.parse(rawStreamText); } catch (_) {}
                        const msgText = parsed?.choices?.[0]?.message?.content
                            || parsed?.choices?.[0]?.delta?.content
                            || '';
                        if (msgText) {
                            streamContent = String(msgText);
                            appendToLastAIMessage(streamContent, requestConvId);
                        }
                    }
                }

                // If stream path produced no visible text, retry once in non-stream mode.
                if (!shouldRetry && (!streamContent || !String(streamContent).trim())) {
                    addDebugLog('stream_empty_fallback_start', {
                        request_id: debugRequestId,
                        conv_id: requestConvId,
                        model: requestBody.model
                    }, 'warn');
                    try {
                        const fallbackBody = { ...requestBody, stream: false };
                        const fallbackRes = await fetch('ai_proxy.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(fallbackBody)
                        });
                        const fallbackRaw = await fallbackRes.text();
                        let fallbackJson = null;
                        try { fallbackJson = JSON.parse(fallbackRaw); } catch (_) {}
                        const fallbackText =
                            fallbackJson?.choices?.[0]?.message?.content ||
                            fallbackJson?.choices?.[0]?.delta?.content ||
                            fallbackJson?.error ||
                            (fallbackRaw || '').trim();
                        if (fallbackText) {
                            streamContent = String(fallbackText);
                            appendToLastAIMessage(streamContent, requestConvId);
                        } else {
                            appendToLastAIMessage('[空回复]', requestConvId);
                        }
                        addDebugLog('stream_empty_fallback_done', {
                            request_id: debugRequestId,
                            conv_id: requestConvId,
                            model: requestBody.model,
                            content_length: (streamContent || '').length
                        }, 'warn');
                    } catch (fallbackErr) {
                        addDebugLog('stream_empty_fallback_error', {
                            request_id: debugRequestId,
                            conv_id: requestConvId,
                            model: requestBody.model,
                            message: sanitizeErrorMessage(fallbackErr?.message || String(fallbackErr))
                        }, 'error');
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
                    let videoUrl = '';
                    let taskId = '';
                    if (result.data && result.data[0] && result.data[0].url) {
                        imageUrl = result.data[0].url;
                    } else if (result.images && result.images[0]) {
                        imageUrl = result.images[0];
                    } else if (result.image) {
                        imageUrl = result.image;
                    } else if (result.output && result.output[0] && result.output[0].url) {
                        imageUrl = result.output[0].url;
                    }
                    if (category === 'video') {
                        videoUrl = extractVideoUrlFromPayload(result);
                        taskId = extractVideoTaskIdFromPayload(result);
                    }
                    if (imageUrl) {
                        appendToLastAIMessage('生成图片：' + imageUrl, requestConvId);
                    } else if (videoUrl && /^https?:\/\//i.test(String(videoUrl))) {
                        appendToLastAIMessage('生成视频：' + videoUrl, requestConvId);
                    } else if (taskId) {
                        const submittedTpl = i18n[currentLanguage].video_task_submitted_msg || 'Video task submitted, task ID: {taskId}';
                        appendToLastAIMessage(submittedTpl.replace('{taskId}', String(taskId)), requestConvId);
                        const pollRet = await pollVideoTaskUntilDone({
                            requestConvId,
                            debugRequestId,
                            modelValue: requestBody.model,
                            taskId,
                            requestBody
                        });
                        if (pollRet?.ok && pollRet.videoUrl) {
                            const doneTpl = i18n[currentLanguage].video_generated_msg || 'Video generated: {url}';
                            appendToLastAIMessage('\n' + doneTpl.replace('{url}', String(pollRet.videoUrl)), requestConvId);
                        } else if (pollRet?.failed) {
                            const failTpl = i18n[currentLanguage].video_task_failed_msg || 'Video task failed: {error}';
                            appendToLastAIMessage('\n' + failTpl.replace('{error}', String(pollRet.error || pollRet.status || 'unknown')), requestConvId);
                        } else if (pollRet?.reason === 'poll_timeout') {
                            appendToLastAIMessage('\n' + (i18n[currentLanguage].video_task_timeout_msg || 'Video task is still running, please retry later (polling limit reached).'), requestConvId);
                        } else if (pollRet?.error) {
                            const errTpl = i18n[currentLanguage].video_task_poll_error_msg || 'Video polling error: {error}';
                            appendToLastAIMessage('\n' + errTpl.replace('{error}', String(pollRet.error)), requestConvId);
                        }
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

function pickFallbackModelForCategory(category, preferredProviderId) {
    const models = Array.isArray(window.allModels) ? window.allModels : [];
    const inPreferred = preferredProviderId
        ? models.find((m) => m.type === category && String(m.value || '').startsWith(preferredProviderId + '::'))
        : null;
    if (inPreferred) return inPreferred.value;
    const any = models.find((m) => m.type === category);
    return any ? any.value : '';
}

function getModelLabelByValue(modelValue) {
    if (!modelValue) return '';
    const models = Array.isArray(window.allModels) ? window.allModels : [];
    const hit = models.find((m) => m.value === modelValue);
    return hit ? hit.label : '';
}

function getCategoryDisplayName(category) {
    const keyMap = {
        image: 'category_image',
        vision: 'category_vision',
        ocr: 'category_ocr',
        translation: 'category_translation',
        code: 'category_code'
    };
    const key = keyMap[category];
    return (key && i18n[currentLanguage] && i18n[currentLanguage][key]) || category;
}

function buildProfessionalLeadIn(category, modelValue) {
    const modelLabel = getModelLabelByValue(modelValue) || String(modelValue || '').split('::').pop() || (currentLanguage === 'zh' ? '已选模型' : 'selected model');
    const categoryLabel = getCategoryDisplayName(category);
    if (currentLanguage === 'zh') {
        return `好的，我这就帮你调用「${modelLabel}」处理「${categoryLabel}」任务。\n以下是结果：\n`;
    }
    return `Sure — I'll use "${modelLabel}" for the "${categoryLabel}" task.\nHere is the result:\n`;
}

function detectChatIntentRoute(text, hasImage, hasPdf) {
    const input = String(text || '').toLowerCase();
    const hasCodeWord = /(写代码|代码|debug|修复|报错|函数|脚本|sql|python|javascript|typescript|java|c\+\+|regex|编程)/i.test(input);
    const hasDrawWord = /(画|画图|绘制|生成图片|做图|生图|生图工具|图像生成|文生图|海报|插画|画一张|draw|image|illustration|poster|出图|渲染|生成一张|来一张|做一张|开始生成)/i.test(input);
    const hasGenericGenerateWord = /(生成|generate)/i.test(input);
    const hasOcrWord = /(识别文字|提取文字|ocr|读图中文字|图片文字|扫描文字)/i.test(input);
    const hasTranslateWord = /(翻译|translate|译成|翻成)/i.test(input);
    const hasVisionWord = /(识图|看图|分析图片|分析这张图|图里有什么|describe image|analyze image|视觉分析)/i.test(input);

    if (hasImage || hasPdf) {
        if (hasTranslateWord) return { category: 'translation', reason: 'image_translation', confidence: 'high' };
        if (hasOcrWord) return { category: 'ocr', reason: 'image_ocr', confidence: 'high' };
        if (hasVisionWord) return { category: 'vision', reason: 'image_vision', confidence: 'high' };
        if (input.trim()) return { category: 'vision', reason: 'image_default_vision', confidence: 'low' };
    }
    if (hasDrawWord) return { category: 'image', reason: 'text2img', confidence: 'high' };
    if (!hasCodeWord && !hasTranslateWord && !hasOcrWord && hasGenericGenerateWord) {
        return { category: 'image', reason: 'generic_generate', confidence: 'low' };
    }
    if (hasCodeWord) return { category: 'code', reason: 'coding', confidence: 'high' };
    return null;
}

// ---------- 发送请求（使用激活的预设和单词转换）----------
async function send() {
    const msgInput = $('msg');
    const modelSelect = $('model');
    let category = $('category').value;
    let imageMode = $('imageMode')?.value;
    const currentBase64 = window.currentBase64;
    const currentUploadMeta = window.currentUploadMeta || null;
    const currentPdfText = (window.currentPdfText || '').trim();
    let currentPdfPageImages = Array.isArray(window.currentPdfPageImages) ? window.currentPdfPageImages : [];
    const currentUploadFile = $('file-input')?.files?.[0] || null;

    let text = normalizeUserInputText(msgInput.value);

    const isGameModeActive = document.body.classList.contains('game-mode-active') || document.body.classList.contains('cyoa-game-mode');
    const autoRouteEnabled = localStorage.getItem('intentRouteEnabled') === '1';
    const hasUploadImage = !!currentBase64;
    const hasUploadPdf = !!currentUploadMeta?.isPdf;
    let routeInfo = null;
    let resolvedModelValue = modelSelect.value;
    let resolvedProviderId = $('providerSelect')?.value || '';

    if (!isGameModeActive && category === 'chat') {
        routeInfo = detectChatIntentRoute(text, hasUploadImage, hasUploadPdf);
        if (routeInfo && routeInfo.category) {
            const isHardImageRoute = routeInfo.category === 'image' && routeInfo.confidence === 'high';
            const shouldRoute = isHardImageRoute || autoRouteEnabled;
            if (!shouldRoute) {
                routeInfo = null;
            } else {
                category = routeInfo.category;
            if (category === 'image') {
                imageMode = 'text2img';
                if ($('imageMode')) $('imageMode').value = 'text2img';
            }
            resolvedModelValue = pickFallbackModelForCategory(category, resolvedProviderId);
            if (resolvedModelValue && resolvedModelValue.includes('::')) {
                resolvedProviderId = resolvedModelValue.split('::')[0];
            }
            const routeTargetLabel = getCategoryDisplayName(routeInfo.category);
            const routeModelLabel = getModelLabelByValue(resolvedModelValue) || resolvedModelValue || 'Auto';
            const lowConfidence = routeInfo.confidence === 'low';
            if (lowConfidence) {
                const tpl = i18n[currentLanguage].intent_route_confirm_low
                    || '检测到可能是 {target} 任务，准备使用模型：{model}。是否继续？';
                const msg = tpl
                    .replace('{target}', routeTargetLabel)
                    .replace('{model}', routeModelLabel);
                if (!confirm(msg)) {
                    return;
                }
            }
            const hitTpl = i18n[currentLanguage].intent_route_hit || '自动路由：{target} · 模型：{model}';
            const hitMsg = hitTpl
                .replace('{target}', routeTargetLabel)
                .replace('{model}', routeModelLabel);
            addDebugLog('intent_route_hit', {
                target_category: routeInfo.category,
                confidence: routeInfo.confidence || 'high',
                model: resolvedModelValue,
                source: isHardImageRoute
                    ? 'hard_image_route'
                    : 'global_auto_route'
            });
            showAppToast(hitMsg);
            }
        }
    }

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
    if (category === 'video' && imageMode === 'img2video' && !currentBase64) {
        alert(i18n[currentLanguage].video_img2video_need_image || 'Please upload an image first for img2video mode');
        return;
    }
    const imageNeedCategories = ['ocr', 'vision', 'translation'];
    if (!text && !imageNeedCategories.includes(category)
        && (category !== 'image' || imageMode !== 'img2img' || !currentBase64)
        && (category !== 'video' || imageMode !== 'img2video' || !currentBase64)) {
        alert('请输入提示词或上传图片');
        return;
    }
    if (!resolvedModelValue) {
        alert('请先选择模型');
        return;
    }
    if (isReceiving) {
        alert('正在接收回复，请稍候');
        return;
    }
    const advancedRaw = String($('advancedParamsInput')?.value || '').trim();
    if (advancedRaw) {
        try { JSON.parse(advancedRaw); }
        catch (_) {
            alert(i18n[currentLanguage].advanced_params_json_invalid || 'Advanced Params JSON is invalid. Please fix it before sending.');
            return;
        }
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
        modelValue: resolvedModelValue
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
    const reqModelValue = requestBuildContext.modelValue || resolvedModelValue;

    const categoryTags = {
        image: `[${reqImageMode === 'text2img' ? '文生图' : '图生图'}] ${reqText}`,
        video: `[${reqImageMode === 'img2video' ? '图生视频' : '文生视频'}] ${reqText}`,
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
                    provider: resolvedProviderId || $('providerSelect')?.value || '',
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
                    provider: resolvedProviderId || $('providerSelect')?.value || '',
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

    if (reqCategory !== 'chat') {
        const assistantRequestMeta = {
            category: reqCategory,
            imageMode: reqImageMode || '',
            provider: resolvedProviderId || $('providerSelect')?.value || '',
            model: reqModelValue || ''
        };
        // Keep lead-in and real result in ONE assistant bubble for better continuity.
        addMessageToCurrent('assistant', buildProfessionalLeadIn(reqCategory, reqModelValue), requestConvId, { requestMeta: assistantRequestMeta });
    }

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
        'skinPanel', 'ragPanel', 'modeCapabilitiesPanel', 'updatePanel',
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
        const targetPresetId = currentActivePresetId?.system || currentActivePresetId?.role || '';
        if (targetPresetId && typeof selectPresetForEdit === 'function') {
            selectPresetForEdit(targetPresetId);
        } else {
            clearPresetForm();
        }
    }
    $('settingsContentTitle').textContent = i18n[currentLanguage].preset_manager;
}

function showModelGeneralSettings() {
    setSettingsMenuActive('timeoutMenuItem');
    hideAllPanels();
    const panel = $('timeoutPanel');
    if (panel) {
        panel.style.display = 'block';
        const total = localStorage.getItem('timeoutTotal') || '600';
        const idle = localStorage.getItem('timeoutIdle') || '120';
        const temp = localStorage.getItem('samplingTemperature') || '0.7';
        const topP = localStorage.getItem('samplingTopP') || '1';
        const maxTokens = localStorage.getItem('samplingMaxTokens') || '';
        const presencePenalty = localStorage.getItem('samplingPresencePenalty') || '0';
        const frequencyPenalty = localStorage.getItem('samplingFrequencyPenalty') || '0';
        const stopSeq = localStorage.getItem('samplingStopSequences') || '';
        const intentRouteEnabled = localStorage.getItem('intentRouteEnabled') === '1';
        $('timeoutTotal').value = total;
        $('timeoutIdle').value = idle;
        if ($('samplingTemperature')) $('samplingTemperature').value = temp;
        if ($('samplingTopP')) $('samplingTopP').value = topP;
        if ($('samplingMaxTokens')) $('samplingMaxTokens').value = maxTokens;
        if ($('samplingPresencePenalty')) $('samplingPresencePenalty').value = presencePenalty;
        if ($('samplingFrequencyPenalty')) $('samplingFrequencyPenalty').value = frequencyPenalty;
        if ($('samplingStopSequences')) $('samplingStopSequences').value = stopSeq;
        if ($('intentRouteEnabled')) $('intentRouteEnabled').checked = intentRouteEnabled;
    }
    $('settingsContentTitle').textContent = i18n[currentLanguage].timeout_settings;
}

async function showUpdateCenter() {
    setSettingsMenuActive('updateMenuItem');
    hideAllPanels();
    const panel = $('updatePanel');
    if (panel) panel.style.display = 'block';
    $('settingsContentTitle').textContent = i18n[currentLanguage].update_center || 'Update Center';
    if ($('updateAutoCheck')) $('updateAutoCheck').checked = isUpdateAutoCheckEnabled();
    updatePanelStatusText();
    try {
        await checkForUpdates({ manual: false, force: false });
    } catch (_) {}
    markUpdateSeen(updateRuntimeState.latestTag);
}

function saveModelGeneralSettings() {
    const total = parseInt($('timeoutTotal').value);
    const idle = parseInt($('timeoutIdle').value);
    const temp = parseFloat($('samplingTemperature')?.value ?? '0.7');
    const topP = parseFloat($('samplingTopP')?.value ?? '1');
    const maxTokensRaw = ($('samplingMaxTokens')?.value ?? '').trim();
    const presencePenalty = parseFloat($('samplingPresencePenalty')?.value ?? '0');
    const frequencyPenalty = parseFloat($('samplingFrequencyPenalty')?.value ?? '0');
    const stopSeq = ($('samplingStopSequences')?.value ?? '').trim();
    const intentRouteEnabled = !!$('intentRouteEnabled')?.checked;
    if (isNaN(total) || total < 10) { alert('总超时必须≥10秒'); return; }
    if (isNaN(idle) || idle < 10) { alert('空闲超时必须≥10秒'); return; }
    if (!Number.isFinite(temp) || temp < 0 || temp > 2) { alert('温度必须在 0.0 到 2.0 之间'); return; }
    if (!Number.isFinite(topP) || topP < 0 || topP > 1) { alert('Top P 必须在 0.0 到 1.0 之间'); return; }
    if (!Number.isFinite(presencePenalty) || presencePenalty < -2 || presencePenalty > 2) { alert('Presence Penalty 必须在 -2.0 到 2.0 之间'); return; }
    if (!Number.isFinite(frequencyPenalty) || frequencyPenalty < -2 || frequencyPenalty > 2) { alert('Frequency Penalty 必须在 -2.0 到 2.0 之间'); return; }
    if (maxTokensRaw !== '') {
        const maxTokens = parseInt(maxTokensRaw, 10);
        if (!Number.isFinite(maxTokens) || maxTokens < 1) {
            alert('Max Tokens 必须是正整数，或留空');
            return;
        }
    }
    localStorage.setItem('timeoutTotal', total);
    localStorage.setItem('timeoutIdle', idle);
    localStorage.setItem('samplingTemperature', String(temp));
    localStorage.setItem('samplingTopP', String(topP));
    localStorage.setItem('samplingMaxTokens', maxTokensRaw);
    localStorage.setItem('samplingPresencePenalty', String(presencePenalty));
    localStorage.setItem('samplingFrequencyPenalty', String(frequencyPenalty));
    localStorage.setItem('samplingStopSequences', stopSeq);
    localStorage.setItem('intentRouteEnabled', intentRouteEnabled ? '1' : '0');
    alert(i18n[currentLanguage].timeout_saved);
}

async function checkForUpdatesManual() {
    showAppToast(i18n[currentLanguage].update_checking || 'Checking for updates...', 1400);
    try {
        await checkForUpdates({ manual: true, force: true });
    } catch (_) {}
}

function saveUpdateSettings() {
    const enabled = !!$('updateAutoCheck')?.checked;
    setUpdateAutoCheckEnabled(enabled);
    showAppToast(i18n[currentLanguage].update_settings_saved || 'Saved', 1200);
}

function openLatestReleasePage() {
    const url = updateRuntimeState.latestUrl || localStorage.getItem(UPDATE_STORAGE_KEYS.latestUrl) || 'https://github.com/saviorwq/Ada-chat/releases/latest';
    window.open(url, '_blank', 'noopener');
}

// Backward compatibility for older inline handlers/extensions.
const showTimeoutSettings = showModelGeneralSettings;
const saveTimeoutSettings = saveModelGeneralSettings;

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

async function safeExitAndShutdown() {
    const msg = currentLanguage === 'zh'
        ? '将退出登录并尝试停止本地 Ada Chat 服务，是否继续？'
        : 'This will sign out and try to stop the local Ada Chat service. Continue?';
    if (!confirm(msg)) return;
    try {
        const res = await fetch('ai_proxy.php?action=safe_exit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (_) {}
        if (!data || !data.success) {
            alert((currentLanguage === 'zh' ? '安全退出失败：' : 'Safe exit failed: ') + (data?.error || 'unknown_error'));
            return;
        }
        const okMsg = currentLanguage === 'zh'
            ? '已执行安全退出。页面将返回登录页，服务会在几秒内停止。'
            : 'Safe exit requested. Redirecting to login; service will stop in a few seconds.';
        alert(okMsg);
        setTimeout(() => {
            window.location.href = 'login.php?logout=1';
            setTimeout(() => { try { window.close(); } catch (_) {} }, 250);
        }, 150);
    } catch (e) {
        alert((currentLanguage === 'zh' ? '安全退出失败：' : 'Safe exit failed: ') + (e?.message || e));
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
    const advancedParamsInput = $('advancedParamsInput');
    if (advancedParamsInput) {
        advancedParamsInput.addEventListener('input', () => {
            setAdvancedParamsForCategory($('category')?.value || 'chat', advancedParamsInput.value);
        });
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
        timeoutMenuItem: showModelGeneralSettings,
        updateMenuItem: showUpdateCenter,
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
    const ragFolderInput = $('ragFolderInput');
    if (ragFolderInput) {
        ragFolderInput.addEventListener('change', async (e) => {
            await importRagFolder(e.target.files);
            e.target.value = '';
        });
    }

    if ($('updateAutoCheck')) {
        $('updateAutoCheck').addEventListener('change', saveUpdateSettings);
    }
    updatePanelStatusText();
    if (isUpdateAutoCheckEnabled()) {
        setTimeout(() => {
            checkForUpdates({ manual: false, force: false }).catch(() => {});
        }, 1200);
    } else {
        setUpdateIndicators(false);
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
window.addManualModelToSelection = addManualModelToSelection;
window.toggleAdvancedParams = toggleAdvancedParams;
window.saveSelectedModels = saveSelectedModels;
window.selectAllModels = selectAllModels;
window.deselectAllModels = deselectAllModels;
window.filterModelCheckboxes = filterModelCheckboxes;
window.saveModelTypes = saveModelTypes;
window.presetProvider = presetProvider;
window.savePreset = savePreset;
window.saveModelGeneralSettings = saveModelGeneralSettings;
window.saveTimeoutSettings = saveModelGeneralSettings;
window.saveLanguage = saveLanguage;
window.clearPresetForm = clearPresetForm;
window.showPresetManager = showPresetManager;
window.showModelGeneralSettings = showModelGeneralSettings;
window.showTimeoutSettings = showModelGeneralSettings;
window.showLanguageSettings = showLanguageSettings;
window.showUpdateCenter = showUpdateCenter;
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
window.importRagFolder = importRagFolder;
window.deleteRagDoc = deleteRagDoc;
window.clearRagKnowledge = clearRagKnowledge;
window.rebuildRagVectorIndex = rebuildRagVectorIndex;
window.checkRagVectorStatus = checkRagVectorStatus;
window.installRagVectorDeps = installRagVectorDeps;
window.toggleRagEmbedModelCustomInput = toggleRagEmbedModelCustomInput;
window.showCostOptimizer = showCostOptimizer;
window.saveCostSettings = saveCostSettings;
window.checkForUpdatesManual = checkForUpdatesManual;
window.openLatestReleasePage = openLatestReleasePage;
window.saveUpdateSettings = saveUpdateSettings;
window.safeExitAndShutdown = safeExitAndShutdown;
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