/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
// RAG settings, indexing and retrieval extracted from script.js

const RAG_SETTINGS_KEY = 'adachat_rag_settings_v1';
const RAG_STORE_KEY = 'adachat_rag_store_v1';
const RAG_MAX_FILE_BYTES = 1024 * 1024; // 1MB per file for localStorage safety

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
    setSettingsMenuActive('ragMenuItem');
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
