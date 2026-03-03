/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
// Provider editing, model selection/types and mode-capability panel extracted from script.js

const MODE_CAPABILITY_CONFIG = window.AdaChatModeConfig || {};
const MODE_CAPABILITY_IMAGE_ACCEPT = MODE_CAPABILITY_CONFIG.IMAGE_ACCEPT || '.jpg,.jpeg,.png,.webp,.gif';
const MODE_CAPABILITY_PDF_SCAN_MAX_PAGES = 5;

window.providers = window.providers || [];
window.currentEditingProviderId = window.currentEditingProviderId || null;

function showAddProvider() {
    setSettingsMenuActive('addProviderMenuItem');
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
    window.currentEditingProviderId = null;
    document.querySelectorAll('.provider-item').forEach(item => item.classList.remove('active'));
}

function showEditProvider(id) {
    window.currentEditingProviderId = id;
    hideAllPanels();
    const panel = $('providerEditPanel');
    if (panel) panel.style.display = 'block';
    $('settingsContentTitle').textContent = i18n[currentLanguage].edit_provider || '编辑供应商';
    editProvider(id);
}

async function loadProviderListSubmenu() {
    const submenu = $('providerListSubmenu');
    if (!submenu) return;

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
        window.providers = providerList;

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
    if (!submenu || !arrow) return;
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

        const fullProvider = (window.providers || []).find(pr => pr.id === id);
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
    const altElements = document.querySelectorAll('[data-i18n-alt]');
    altElements.forEach(el => {
        const key = el.getAttribute('data-i18n-alt');
        const value =
            (i18n[currentLanguage] && i18n[currentLanguage][key]) ||
            (i18n.en && i18n.en[key]) ||
            null;
        if (value) el.setAttribute('alt', value);
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

    const data = { name, base_url, api_key, models_path, chat_path, image_gen_path, image_edit_path, video_path, cache_strategy };
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
            if ((window.providers || []).length > 0) {
                showEditProvider(window.providers[0].id);
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
    if (!window.currentEditingProviderId) {
        alert('请先选择或新增供应商');
        return;
    }
    await fetchModelsForProviderId(window.currentEditingProviderId);
}

async function fetchModelsForProviderId(id) {
    try {
        const res = await fetch(`ai_proxy.php?action=fetch_models&id=${id}`, { method: 'POST' });
        const result = await res.json();
        if (result.success) {
            alert('获取模型成功！');
            const modelList = Array.isArray(result.models) ? result.models : [];
            const provider = (window.providers || []).find(p => p.id === id);
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
    if (!window.currentEditingProviderId) {
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
            body: JSON.stringify({ id: window.currentEditingProviderId, models: selectedModels })
        });
        const result = await res.json();
        if (result.success) {
            alert('模型选择已保存');
            await loadAllModels();
            filterModelsByCategory();
            await loadProviderListSubmenu();
            editProvider(window.currentEditingProviderId);
        } else {
            alert('保存失败：' + (result.error || '未知错误'));
        }
    } catch (e) {
        alert('保存失败：网络错误');
    }
}

function showModelTypeManager() {
    setSettingsMenuActive('modelTypeManagerMenuItem');
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
                ? `图片直连OCR；PDF先提取文字，若无文字层则渲染前${MODE_CAPABILITY_PDF_SCAN_MAX_PAGES}页做扫描识别`
                : `OCR image directly; for PDF, extract text first, then render first ${MODE_CAPABILITY_PDF_SCAN_MAX_PAGES} pages if scanned`;
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
    const modeMap = MODE_CAPABILITY_CONFIG.modeMap || {};
    const getAccept = typeof MODE_CAPABILITY_CONFIG.getUploadAccept === 'function'
        ? MODE_CAPABILITY_CONFIG.getUploadAccept
        : (mode) => modeMap[mode]?.uploadAccept || MODE_CAPABILITY_IMAGE_ACCEPT;
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
        const ok = await copyTextToClipboard(markdown);
        if (!ok) throw new Error('copy_failed');
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
    setSettingsMenuActive('modeCapabilitiesMenuItem');
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
        const provider = (window.providers || []).find(p => p.id === pId);
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
