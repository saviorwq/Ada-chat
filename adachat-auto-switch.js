/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
// Auto-switch model helpers extracted from script.js

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

function showAutoSwitchSettings() {
    setSettingsMenuActive('autoSwitchMenuItem');
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
    const modelMap = new Map(allModels.map(m => [m.value, m]));
    const ordered = [];

    savedList.forEach(v => {
        if (modelMap.has(v)) ordered.push(modelMap.get(v));
    });
    allModels.forEach(m => {
        if (!savedList.includes(m.value)) ordered.push(m);
    });

    const grouped = {};
    ordered.forEach(m => {
        if (!grouped[m.type]) grouped[m.type] = [];
        grouped[m.type].push(m);
    });

    const typeLabels = {
        chat: { zh: '💬 对话', en: '💬 Chat' },
        code: { zh: '💻 编程', en: '💻 Code' },
        image: { zh: '🎨 图像', en: '🎨 Image' },
        video: { zh: '🎬 视频', en: '🎬 Video' },
        ocr: { zh: '📄 OCR', en: '📄 OCR' },
        vision: { zh: '👁️ 图像理解', en: '👁️ Vision' },
        translation: { zh: '🌐 翻译', en: '🌐 Translation' }
    };

    container.innerHTML = '';

    Object.keys(grouped).forEach(type => {
        const section = document.createElement('div');
        section.className = 'auto-switch-type-group';

        const title = document.createElement('div');
        title.className = 'auto-switch-type-title';
        const label = typeLabels[type] ? typeLabels[type][currentLanguage] || typeLabels[type].en : type;
        title.textContent = label;
        section.appendChild(title);

        const group = document.createElement('div');
        group.className = 'auto-switch-model-group';

        grouped[type].forEach(m => {
            const item = document.createElement('div');
            item.className = 'auto-switch-model-item';
            item.draggable = true;
            item.dataset.value = m.value;
            item.innerHTML = `
                <label>
                    <input type="checkbox" ${savedList.includes(m.value) ? 'checked' : ''} />
                    <span class="model-name">${escapeHtml(m.label)}</span>
                </label>
                <span class="model-provider">${escapeHtml(getProviderNameForModel(m.value))}</span>
                <span class="drag-handle">↕</span>
            `;

            item.addEventListener('dragstart', () => item.classList.add('dragging'));
            item.addEventListener('dragend', () => item.classList.remove('dragging'));

            group.appendChild(item);
        });

        group.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = group.querySelector('.dragging');
            if (!dragging) return;
            const afterElement = getDragAfterElement(group, e.clientY);
            if (afterElement == null) group.appendChild(dragging);
            else group.insertBefore(dragging, afterElement);
        });

        section.appendChild(group);
        container.appendChild(section);
    });
}

function getDragAfterElement(container, y) {
    const elements = [...container.querySelectorAll('.auto-switch-model-item:not(.dragging)')];
    return elements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        }
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function getProviderNameForModel(modelValue) {
    const [pId] = modelValue.split('::');
    const p = (window.providers || []).find(p => p.id === pId);
    return p ? p.name : pId;
}

function saveAutoSwitchList() {
    const checkedValues = [];
    document.querySelectorAll('#autoSwitchModelList .auto-switch-model-item').forEach(item => {
        const checked = item.querySelector('input[type="checkbox"]').checked;
        if (checked) checkedValues.push(item.dataset.value);
    });
    localStorage.setItem('autoSwitchList', JSON.stringify(checkedValues));
    alert(i18n[currentLanguage].auto_switch_saved);
}

function isRateLimitMessage(text) {
    const t = String(text || '').toLowerCase();
    return (
        t.includes('429') ||
        t.includes('rate limit') ||
        t.includes('too many requests') ||
        t.includes('请求过于频繁') ||
        t.includes('限流') ||
        t.includes('频率限制')
    );
}

function showAutoSwitchToast(modelLabel) {
    const toast = document.createElement('div');
    toast.className = 'auto-switch-toast';
    toast.textContent = i18n[currentLanguage].auto_switch_notice + modelLabel;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}
