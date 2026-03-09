/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
// Theme/language/preset/word-conversion settings extracted from script.js

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
    setSettingsMenuActive('skinMenuItem');
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
        const conversion = wordConversions.find(c => c.id === editingId);
        if (conversion) {
            conversion.short = short;
            conversion.long = long;
        }
    } else {
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

function showWordConversion() {
    setSettingsMenuActive('wordConversionMenuItem');
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

function getPresetRouteModelFieldMap() {
    return {
        chat: 'presetModelChat',
        code: 'presetModelCode',
        image: 'presetModelImage',
        video: 'presetModelVideo',
        ocr: 'presetModelOcr',
        vision: 'presetModelVision',
        translation: 'presetModelTranslation'
    };
}

function populatePresetRouteModelSelects(selectedMap = {}) {
    const map = getPresetRouteModelFieldMap();
    const all = Array.isArray(window.allModels) ? window.allModels : [];
    Object.entries(map).forEach(([category, elId]) => {
        const el = $(elId);
        if (!el) return;
        el.innerHTML = '';
        const autoOpt = document.createElement('option');
        autoOpt.value = '';
        autoOpt.textContent = currentLanguage === 'zh' ? '（自动）' : '(Auto)';
        el.appendChild(autoOpt);
        all.filter((m) => m.type === category).forEach((m) => {
            const opt = document.createElement('option');
            opt.value = m.value;
            opt.textContent = m.label;
            el.appendChild(opt);
        });
        const selectedValue = String(selectedMap[category] || '');
        if (selectedValue) {
            const exists = Array.from(el.options || []).some((o) => o.value === selectedValue);
            if (!exists) {
                const missing = document.createElement('option');
                missing.value = selectedValue;
                missing.textContent = `${selectedValue} (${currentLanguage === 'zh' ? '已绑定但当前不可用' : 'bound but unavailable'})`;
                el.appendChild(missing);
            }
        }
        el.value = selectedValue;
    });
}

function readPresetRouteModelsFromForm() {
    const map = getPresetRouteModelFieldMap();
    const route = {};
    Object.entries(map).forEach(([category, elId]) => {
        const value = String($(elId)?.value || '').trim();
        if (value) route[category] = value;
    });
    return route;
}

function selectPresetForEdit(id) {
    const preset = presets.find(p => p.id === id);
    if (preset) {
        $('editingPresetId').value = preset.id;
        $('presetName').value = preset.name;
        $('presetType').value = preset.type;
        $('presetContent').value = preset.content;
        populatePresetRouteModelSelects(preset.route_models || {});
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
    populatePresetRouteModelSelects({});
}

function savePreset() {
    const id = $('editingPresetId')?.value || '';
    const name = ($('presetName')?.value || '').trim();
    const type = ($('presetType')?.value || 'system').trim() || 'system';
    const content = ($('presetContent')?.value || '').trim();
    const route_models = readPresetRouteModelsFromForm();
    const hasRouteBinding = Object.keys(route_models).length > 0;
    if (!content && !hasRouteBinding) {
        alert(currentLanguage === 'zh' ? '内容为空时，请至少绑定一个模型。' : 'When content is empty, please bind at least one model.');
        return;
    }

    let finalName = name;
    if (!finalName) {
        const now = new Date();
        const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        finalName = (currentLanguage === 'zh' ? '路由预设 ' : 'Route Preset ') + stamp;
        if ($('presetName')) $('presetName').value = finalName;
    }
    let finalPresetId = id;
    if (id) {
        const preset = presets.find(p => p.id === id);
        if (preset) {
            preset.name = finalName;
            preset.type = type;
            preset.content = content;
            preset.route_models = route_models;
        }
    } else {
        const newId = Date.now().toString();
        finalPresetId = newId;
        presets.push({ id: newId, name: finalName, type, content, route_models });
        if (type === 'system' && !currentActivePresetId.system) currentActivePresetId.system = newId;
        if (type === 'role' && !currentActivePresetId.role) currentActivePresetId.role = newId;
    }
    savePresets();
    renderPresetList();
    if (finalPresetId) {
        selectPresetForEdit(finalPresetId);
    }
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
