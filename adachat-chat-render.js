/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
// Chat render and message action helpers extracted from script.js

function extractKeyHighlights(content) {
    const text = String(content || '');
    if (!text.trim()) return [];
    const highlights = [];
    const seen = new Set();
    const push = (raw) => {
        const cleaned = String(raw || '')
            .replace(/\*\*/g, '')
            .replace(/^[-*]\s+/, '')
            .trim();
        if (!cleaned || cleaned.length < 2) return;
        const normalized = cleaned.toLowerCase();
        if (seen.has(normalized)) return;
        seen.add(normalized);
        highlights.push(cleaned.length > 160 ? `${cleaned.slice(0, 157)}...` : cleaned);
    };

    text.replace(/\*\*([^*\n]{2,120})\*\*/g, (_, m) => {
        push(m);
        return _;
    });

    const markerRegex = /^(重点|关键|结论|建议|注意|TL;DR|Summary|Key Point)\s*[:：]\s*/i;
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        if (markerRegex.test(line)) {
            push(line.replace(markerRegex, ''));
        } else if (/^【[^】]{2,20}】/.test(line)) {
            push(line);
        } else if (/^\d+[.)、]\s+/.test(line) && line.length <= 90) {
            push(line.replace(/^\d+[.)、]\s+/, ''));
        }
        if (highlights.length >= 3) break;
    }
    return highlights.slice(0, 3);
}

function buildKeyHighlightsBlock(content) {
    const highlights = extractKeyHighlights(content);
    if (!highlights.length) return null;
    const pack = document.createElement('div');
    pack.className = 'key-highlight-box';

    const title = document.createElement('div');
    title.className = 'key-highlight-title';
    title.textContent = i18n[currentLanguage].key_highlights_title || 'Key Highlights';
    pack.appendChild(title);

    highlights.forEach((itemText) => {
        const row = document.createElement('div');
        row.className = 'key-highlight-item';

        const textEl = document.createElement('span');
        textEl.className = 'key-highlight-text';
        textEl.textContent = itemText;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'key-copy-btn';
        const copyLabel = i18n[currentLanguage].key_highlights_copy || 'Copy';
        const copiedLabel = i18n[currentLanguage].key_highlights_copied || 'Copied';
        const failedLabel = i18n[currentLanguage].key_highlights_copy_failed || 'Copy failed';
        btn.textContent = copyLabel;

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            const ok = await copyTextToClipboard(itemText);
            btn.textContent = ok ? copiedLabel : failedLabel;
            setTimeout(() => {
                btn.textContent = copyLabel;
                btn.disabled = false;
            }, 1200);
        });

        row.appendChild(textEl);
        row.appendChild(btn);
        pack.appendChild(row);
    });
    return pack;
}

function extractClickableOptions(content) {
    const text = String(content || '');
    if (!text.trim()) return [];
    const options = [];
    const lines = text.split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const m = line.match(/^(\d{1,2})[.)、]\s+(.+)$/);
        if (!m) continue;
        const idx = Number(m[1]);
        if (!Number.isFinite(idx)) continue;
        const label = m[2].trim().replace(/^[\-\*]\s+/, '');
        if (!label) continue;
        options.push({ idx, label });
    }
    if (options.length < 2) return [];
    options.sort((a, b) => a.idx - b.idx);
    for (let i = 0; i < options.length; i++) {
        if (options[i].idx !== i + 1) return [];
    }
    return options.slice(0, 9);
}

function buildAssistantChoicesBlock(content) {
    const choices = extractClickableOptions(content);
    if (!choices.length) return null;

    const box = document.createElement('div');
    box.className = 'choice-option-box';

    const title = document.createElement('div');
    title.className = 'choice-option-title';
    title.textContent = '点击选项继续';
    box.appendChild(title);

    choices.forEach((c) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choice-option-btn';
        btn.textContent = `${c.idx}. ${c.label}`;
        btn.addEventListener('click', async () => {
            if (isReceiving) return;
            const msgInput = $('msg');
            if (!msgInput) return;
            msgInput.value = c.label;
            msgInput.style.height = 'auto';
            msgInput.focus();
            await send();
        });
        box.appendChild(btn);
    });

    return box;
}

function getUserTextForRegenerate(userContent) {
    const stripped = String(userContent || '')
        .replace(/^\[(文生图|图生图|编程|文字识别|图像理解|翻译)\]\s*/i, '');
    return normalizeUserInputText(stripped);
}

async function restartFromUserMessage(convId, userIdx, editedText = null) {
    if (isReceiving) return;
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;
    const userMsg = conv.messages[userIdx];
    if (!userMsg || userMsg.role !== 'user') return;

    const meta = userMsg?.requestMeta || {};
    const isImageTask = meta.category === 'image';
    const isTextToImage = isImageTask && meta.imageMode === 'text2img';
    if (userMsg?.image && !isTextToImage) {
        alert(i18n[currentLanguage].msg_action_regen_unsupported || 'Regenerate for image-based messages is not supported yet.');
        return;
    }

    const inputText = normalizeUserInputText(
        editedText == null ? getUserTextForRegenerate(userMsg?.content || '') : editedText
    );
    if (!inputText) return;

    if (meta.category && $('category')) $('category').value = meta.category;
    if (meta.provider && $('providerSelect')) $('providerSelect').value = meta.provider;
    if (meta.imageMode && $('imageMode')) $('imageMode').value = meta.imageMode;
    if (meta.model && $('model')) $('model').value = meta.model;
    onCategoryChange();

    conv.messages = conv.messages.slice(0, userIdx);
    saveConversations();
    currentConvId = convId;
    renderChatList();
    renderCurrentConversation();

    const msgInput = $('msg');
    if (msgInput) {
        msgInput.value = inputText;
        msgInput.style.height = 'auto';
    }
    if (typeof window.removePreview === 'function') window.removePreview();
    window.currentBase64 = '';
    window.currentUploadMeta = null;
    window.currentPdfText = '';
    window.currentPdfPageImages = [];
    await send();
}

function buildAssistantActionBar(msg, ctx = {}) {
    if (msg?.role !== 'assistant') return null;
    const actionBar = document.createElement('div');
    actionBar.className = 'msg-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'msg-action-btn';
    copyBtn.title = i18n[currentLanguage].msg_action_copy || 'Copy response';
    copyBtn.setAttribute('aria-label', copyBtn.title);
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', async () => {
        const copiedLabel = i18n[currentLanguage].msg_action_copied || 'Copied';
        const baseLabel = '📋';
        copyBtn.disabled = true;
        const ok = await copyTextToClipboard(msg?.content || '');
        copyBtn.textContent = ok ? '✅' : '⚠️';
        copyBtn.title = ok ? copiedLabel : (i18n[currentLanguage].key_highlights_copy_failed || 'Copy failed');
        setTimeout(() => {
            copyBtn.textContent = baseLabel;
            copyBtn.title = i18n[currentLanguage].msg_action_copy || 'Copy response';
            copyBtn.disabled = false;
        }, 1200);
    });

    const regenBtn = document.createElement('button');
    regenBtn.type = 'button';
    regenBtn.className = 'msg-action-btn';
    regenBtn.title = i18n[currentLanguage].msg_action_regen || 'Regenerate';
    regenBtn.setAttribute('aria-label', regenBtn.title);
    regenBtn.textContent = '🔄';
    regenBtn.addEventListener('click', async () => {
        if (isReceiving) return;
        const convId = ctx.convId || currentConvId;
        const conv = conversations.find(c => c.id === convId);
        if (!conv) return;
        const assistantIdx = Number.isInteger(ctx.msgIndex) ? ctx.msgIndex : conv.messages.length - 1;
        let userIdx = -1;
        for (let i = assistantIdx - 1; i >= 0; i--) {
            if (conv.messages[i]?.role === 'user') {
                userIdx = i;
                break;
            }
        }
        if (userIdx < 0) return;
        const userMsg = conv.messages[userIdx];
        const meta = userMsg?.requestMeta || {};
        const isImageTask = meta.category === 'image';
        const isTextToImage = isImageTask && meta.imageMode === 'text2img';
        if (userMsg?.image && !isTextToImage) {
            alert(i18n[currentLanguage].msg_action_regen_unsupported || 'Regenerate for image-based messages is not supported yet.');
            return;
        }
        const inputText = getUserTextForRegenerate(userMsg?.content || '');
        if (!inputText) return;

        if (meta.category && $('category')) $('category').value = meta.category;
        if (meta.provider && $('providerSelect')) $('providerSelect').value = meta.provider;
        if (meta.imageMode && $('imageMode')) $('imageMode').value = meta.imageMode;
        if (meta.model && $('model')) $('model').value = meta.model;
        onCategoryChange();

        conv.messages = conv.messages.slice(0, userIdx);
        saveConversations();
        currentConvId = convId;
        renderChatList();
        renderCurrentConversation();

        const msgInput = $('msg');
        if (msgInput) {
            msgInput.value = inputText;
            msgInput.style.height = 'auto';
        }
        if (typeof window.removePreview === 'function') window.removePreview();
        window.currentBase64 = '';
        window.currentUploadMeta = null;
        window.currentPdfText = '';
        window.currentPdfPageImages = [];
        await send();
    });

    actionBar.appendChild(regenBtn);
    actionBar.appendChild(copyBtn);
    return actionBar;
}

function buildUserActionBar(msg, ctx = {}) {
    if (msg?.role !== 'user') return null;
    const actionBar = document.createElement('div');
    actionBar.className = 'msg-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'msg-action-btn';
    copyBtn.title = i18n[currentLanguage].msg_action_copy || 'Copy message';
    copyBtn.setAttribute('aria-label', copyBtn.title);
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', async () => {
        copyBtn.disabled = true;
        const ok = await copyTextToClipboard(msg?.content || '');
        copyBtn.textContent = ok ? '✅' : '⚠️';
        setTimeout(() => {
            copyBtn.textContent = '📋';
            copyBtn.disabled = false;
        }, 1200);
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'msg-action-btn';
    editBtn.title = '放入输入框编辑并重开分支';
    editBtn.setAttribute('aria-label', editBtn.title);
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => {
        if (isReceiving) return;
        const convId = ctx.convId || currentConvId;
        const conv = conversations.find(c => c.id === convId);
        if (!conv) return;
        const userIdx = Number.isInteger(ctx.msgIndex) ? ctx.msgIndex : -1;
        if (userIdx < 0) return;
        const source = getUserTextForRegenerate(msg?.content || '');
        const meta = msg?.requestMeta || conv.messages[userIdx]?.requestMeta || {};
        if (meta.category && $('category')) $('category').value = meta.category;
        if (meta.provider && $('providerSelect')) $('providerSelect').value = meta.provider;
        if (meta.imageMode && $('imageMode')) $('imageMode').value = meta.imageMode;
        if (meta.model && $('model')) $('model').value = meta.model;
        onCategoryChange();

        const msgInput = $('msg');
        if (!msgInput) return;
        msgInput.value = source;
        msgInput.style.height = 'auto';
        msgInput.focus();
        const len = msgInput.value.length;
        try { msgInput.setSelectionRange(len, len); } catch {}

        window.pendingUserEditRestart = { convId, userIdx };
    });

    actionBar.appendChild(editBtn);
    actionBar.appendChild(copyBtn);
    return actionBar;
}

function buildMessageRow(msg, ctx = {}) {
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
    const userActions = buildUserActionBar(msg, ctx);
    if (userActions) wrap.appendChild(userActions);
    const actions = buildAssistantActionBar(msg, ctx);
    if (actions) wrap.appendChild(actions);
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
        if (msg?.role === 'assistant') {
            const textNode = document.createElement('div');
            textNode.textContent = content || '';
            contentEl.appendChild(textNode);
            const choiceBlock = buildAssistantChoicesBlock(content);
            if (choiceBlock) contentEl.appendChild(choiceBlock);
            const keyBlock = buildKeyHighlightsBlock(content);
            if (keyBlock) contentEl.appendChild(keyBlock);
        } else {
            contentEl.textContent = content || '';
        }
    }
}
