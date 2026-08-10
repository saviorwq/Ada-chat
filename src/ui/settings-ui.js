/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 主题 / 语言 / 预设 / 文生图单词转换（原 adachat-settings-ui.js）
 * Theme, language, presets, word-conversion — syncs with globalThis (full-app-entry shim)
 */
const THEME_SETTINGS_KEY = 'theme_settings'

function $(id) {
  return document.getElementById(id)
}

function getLang() {
  return typeof globalThis.currentLanguage === 'string'
    ? globalThis.currentLanguage
    : 'zh'
}

/** 与 globalThis.AdaChatI18n 同一引用（installFullAppGlobals 挂载） */
function getI18n() {
  return globalThis.AdaChatI18n || globalThis.i18n || { zh: {}, en: {} }
}

function line(key) {
  const pack = getI18n()[getLang()] || getI18n().en || getI18n().zh || {}
  return pack[key] ?? key
}

function callHideAllPanels() {
  if (typeof globalThis.hideAllPanels === 'function') globalThis.hideAllPanels()
}

function callSetSettingsMenuActive(menuItemId) {
  if (typeof globalThis.setSettingsMenuActive === 'function') {
    globalThis.setSettingsMenuActive(menuItemId)
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  if (!m) return null
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  }
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((x) => clamp(x, 0, 255).toString(16).padStart(2, '0')).join('')}`
}

function shiftColor(hex, amount) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return rgbToHex(rgb.r + amount, rgb.g + amount, rgb.b + amount)
}

function mixColor(hex1, hex2, ratio = 0.5) {
  const a = hexToRgb(hex1)
  const b = hexToRgb(hex2)
  if (!a || !b) return hex1
  const t = clamp(ratio, 0, 1)
  return rgbToHex(
    Math.round(a.r + (b.r - a.r) * t),
    Math.round(a.g + (b.g - a.g) * t),
    Math.round(a.b + (b.b - a.b) * t)
  )
}

function getDefaultThemeSettings() {
  return {
    preset: 'light',
    primary: '#10b981',
    bg: '#f9fafc',
    text: '#1e293b',
  }
}

export function loadThemeSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(THEME_SETTINGS_KEY) || 'null')
    return { ...getDefaultThemeSettings(), ...(saved || {}) }
  } catch {
    return getDefaultThemeSettings()
  }
}

export function applyThemeSettings(settings) {
  const body = document.body
  if (!body) return
  const root = document.documentElement
  const s = { ...getDefaultThemeSettings(), ...(settings || {}) }

  if (s.preset === 'dark') {
    body.setAttribute('data-theme', 'dark')
    root.style.removeProperty('--primary')
    root.style.removeProperty('--primary-dark')
    root.style.removeProperty('--primary-light')
    root.style.removeProperty('--bg')
    root.style.removeProperty('--bg-light')
    root.style.removeProperty('--text')
    root.style.removeProperty('--text-light')
    root.style.removeProperty('--body-bg-start')
    root.style.removeProperty('--body-bg-end')
    root.style.removeProperty('--surface-muted')
    return
  }

  if (s.preset === 'custom') {
    body.setAttribute('data-theme', 'custom')
    const primary = s.primary || '#10b981'
    const bg = s.bg || '#f9fafc'
    const text = s.text || '#1e293b'
    root.style.setProperty('--primary', primary)
    root.style.setProperty('--primary-dark', shiftColor(primary, -26))
    root.style.setProperty('--primary-light', shiftColor(primary, 22))
    root.style.setProperty('--bg', bg)
    root.style.setProperty('--bg-light', mixColor(bg, '#ffffff', 0.7))
    root.style.setProperty('--border', mixColor(bg, '#64748b', 0.25))
    root.style.setProperty('--border-dark', mixColor(bg, '#334155', 0.35))
    root.style.setProperty('--text', text)
    root.style.setProperty('--text-light', mixColor(text, '#94a3b8', 0.55))
    root.style.setProperty('--body-bg-start', mixColor(bg, '#ffffff', 0.3))
    root.style.setProperty('--body-bg-end', mixColor(bg, '#cbd5e1', 0.35))
    root.style.setProperty('--surface-muted', mixColor(bg, '#e2e8f0', 0.45))
    return
  }

  body.setAttribute('data-theme', 'light')
  root.style.removeProperty('--primary')
  root.style.removeProperty('--primary-dark')
  root.style.removeProperty('--primary-light')
  root.style.removeProperty('--bg')
  root.style.removeProperty('--bg-light')
  root.style.removeProperty('--border')
  root.style.removeProperty('--border-dark')
  root.style.removeProperty('--text')
  root.style.removeProperty('--text-light')
  root.style.removeProperty('--body-bg-start')
  root.style.removeProperty('--body-bg-end')
  root.style.removeProperty('--surface-muted')
}

export function onThemePresetChange() {
  const preset = $('themePreset')?.value || 'light'
  const disabled = preset !== 'custom'
  ;['themePrimary', 'themeBg', 'themeText'].forEach((id) => {
    const el = $(id)
    if (el) el.disabled = disabled
  })
}

export function showSkinSettings() {
  callSetSettingsMenuActive('skinMenuItem')
  callHideAllPanels()
  const panel = $('skinPanel')
  if (panel) panel.style.display = 'block'
  const titleEl = $('settingsContentTitle')
  if (titleEl) titleEl.textContent = line('skin_mode')

  const s = loadThemeSettings()
  if ($('themePreset')) $('themePreset').value = s.preset
  if ($('themePrimary')) $('themePrimary').value = s.primary
  if ($('themeBg')) $('themeBg').value = s.bg
  if ($('themeText')) $('themeText').value = s.text
  onThemePresetChange()
}

export function saveSkinSettings() {
  const settings = {
    preset: $('themePreset')?.value || 'light',
    primary: $('themePrimary')?.value || '#10b981',
    bg: $('themeBg')?.value || '#f9fafc',
    text: $('themeText')?.value || '#1e293b',
  }
  localStorage.setItem(THEME_SETTINGS_KEY, JSON.stringify(settings))
  applyThemeSettings(settings)
  alert(line('save_skin') || 'Skin saved')
}

export function updateUILanguage() {
  const i18n = getI18n()
  const lang = getLang()
  const elements = document.querySelectorAll('[data-i18n]')
  elements.forEach((el) => {
    const key = el.getAttribute('data-i18n')
    const value =
      (i18n[lang] && i18n[lang][key]) || (i18n.en && i18n.en[key]) || null
    if (value) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.getAttribute('placeholder') !== null) {
          el.setAttribute('placeholder', value)
        }
      } else if (el.tagName === 'OPTION') {
        el.textContent = value
      } else {
        el.textContent = value
      }
    }
  })
  document.title =
    (i18n[lang] && i18n[lang].app_title) || i18n.en.app_title || ''
}

function saveWordConversions() {
  localStorage.setItem(
    'word_conversions',
    JSON.stringify(globalThis.wordConversions || [])
  )
}

export function loadWordConversions() {
  const saved = localStorage.getItem('word_conversions')
  globalThis.wordConversions = saved
    ? JSON.parse(saved)
    : [
        {
          id: '1',
          short: '猫',
          long: 'A beautiful fluffy cat sitting on a windowsill, sunlight streaming in, soft focus, 4k, highly detailed, photorealistic',
        },
        {
          id: '2',
          short: '狗',
          long: 'A cute dog playing in a grassy field, golden hour lighting, shallow depth of field, professional photography, 8k',
        },
        {
          id: '3',
          short: '风景',
          long: 'A breathtaking landscape with mountains, lake, and forest, dramatic sky, sunset colors, ultra wide angle, highly detailed, atmospheric',
        },
        {
          id: '4',
          short: 'cat',
          long: 'A majestic cat with intricate fur details, studio lighting, professional portrait, 4k, sharp focus, bokeh background',
        },
        {
          id: '5',
          short: 'dog',
          long: 'A happy dog running through autumn leaves, warm tones, motion blur, professional photography, cinematic composition',
        },
      ]
}

export function renderConversionList() {
  const container = $('conversionList')
  if (!container) return

  const wordConversions = globalThis.wordConversions || []
  if (wordConversions.length === 0) {
    container.innerHTML =
      '<p class="hint" style="padding:20px; text-align:center;">暂无转换规则，请添加</p>'
    return
  }

  container.innerHTML = ''
  wordConversions.forEach((conversion) => {
    const item = document.createElement('div')
    item.className = 'conversion-item'

    const shortSpan = document.createElement('span')
    shortSpan.className = 'conversion-short'
    shortSpan.textContent = conversion.short

    const longSpan = document.createElement('span')
    longSpan.className = 'conversion-long'
    longSpan.textContent = conversion.long

    const actionsDiv = document.createElement('div')
    actionsDiv.className = 'conversion-actions'
    actionsDiv.innerHTML = `
            <button class="edit-conversion" title="${line('edit')}">✏️</button>
            <button class="delete-conversion" title="${line('delete')}">🗑️</button>
        `

    actionsDiv
      .querySelector('.edit-conversion')
      .addEventListener('click', (e) => {
        e.stopPropagation()
        editConversion(conversion.id)
      })

    actionsDiv
      .querySelector('.delete-conversion')
      .addEventListener('click', (e) => {
        e.stopPropagation()
        deleteConversion(conversion.id)
      })

    item.appendChild(shortSpan)
    item.appendChild(longSpan)
    item.appendChild(actionsDiv)
    container.appendChild(item)
  })
}

export function editConversion(id) {
  const wordConversions = globalThis.wordConversions || []
  const conversion = wordConversions.find((c) => c.id === id)
  if (conversion) {
    globalThis.currentEditingConversionId = id
    $('editingConversionId').value = id
    $('conversionShort').value = conversion.short
    $('conversionLong').value = conversion.long

    const titleEl = $('conversionFormTitle')
    if (titleEl) {
      titleEl.textContent = `${line('add_edit_conversion')} - ${conversion.short}`
    }
  }
}

export function deleteConversion(id) {
  if (!confirm(line('confirm_delete_conversion'))) return
  globalThis.wordConversions = (globalThis.wordConversions || []).filter(
    (c) => c.id !== id
  )
  saveWordConversions()
  renderConversionList()
  if (globalThis.currentEditingConversionId === id) {
    clearConversionForm()
  }
}

export function clearConversionForm() {
  globalThis.currentEditingConversionId = null
  $('editingConversionId').value = ''
  $('conversionShort').value = ''
  $('conversionLong').value = ''

  const titleEl = $('conversionFormTitle')
  if (titleEl) {
    titleEl.textContent = line('add_edit_conversion')
  }
}

export function saveConversion() {
  const short = $('conversionShort').value.trim()
  const long = $('conversionLong').value.trim()

  if (!short || !long) {
    alert('短词和详细Prompt都不能为空')
    return
  }

  const editingId = $('editingConversionId').value
  if (!globalThis.wordConversions) globalThis.wordConversions = []
  const list = globalThis.wordConversions

  if (editingId) {
    const conversion = list.find((c) => c.id === editingId)
    if (conversion) {
      conversion.short = short
      conversion.long = long
    }
  } else {
    const newId = Date.now().toString()
    list.push({ id: newId, short, long })
  }

  saveWordConversions()
  renderConversionList()
  clearConversionForm()
  alert(line('conversion_saved'))
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function applyWordConversion(text) {
  const wordConversions = globalThis.wordConversions || []
  if (!text || wordConversions.length === 0) return text

  let result = text
  const sortedConversions = [...wordConversions].sort(
    (a, b) => b.short.length - a.short.length
  )

  for (const conversion of sortedConversions) {
    const escaped = escapeRegExp(conversion.short)
    const regex = new RegExp(
      `\\b${escaped}\\b|(?<=[^a-zA-Z])${escaped}(?=[^a-zA-Z])`,
      'g'
    )
    result = result.replace(regex, conversion.long)
  }

  return result
}

export function showWordConversion() {
  callSetSettingsMenuActive('wordConversionMenuItem')
  callHideAllPanels()
  const panel = $('wordConversionPanel')
  if (panel) {
    panel.style.display = 'block'
    renderConversionList()
    clearConversionForm()
  }
  $('settingsContentTitle').textContent = line('word_conversion')
}

export function savePresets() {
  localStorage.setItem('ai_presets', JSON.stringify(globalThis.presets || []))
  localStorage.setItem(
    'ai_active_preset_ids',
    JSON.stringify(globalThis.currentActivePresetId || {})
  )
}

export function loadPresets() {
  const saved = localStorage.getItem('ai_presets')
  globalThis.presets = saved
    ? JSON.parse(saved)
    : [
        {
          id: '1',
          name: '通用助手',
          type: 'system',
          content: '你是一个乐于助人的助手。',
        },
        {
          id: '2',
          name: '写实人像',
          type: 'role',
          content:
            'A realistic portrait of a person, detailed skin texture, natural lighting, 4k.',
        },
      ]
  const active = localStorage.getItem('ai_active_preset_ids')
  if (active) {
    globalThis.currentActivePresetId = JSON.parse(active)
  } else {
    const sys = globalThis.presets.find((p) => p.type === 'system')
    const role = globalThis.presets.find((p) => p.type === 'role')
    globalThis.currentActivePresetId = {
      system: sys ? sys.id : null,
      role: role ? role.id : null,
    }
  }
}

export function renderPresetList() {
  const container = $('presetList')
  if (!container) return
  const presets = globalThis.presets || []
  const currentActivePresetId = globalThis.currentActivePresetId || {
    system: null,
    role: null,
  }
  const lang = getLang()

  container.innerHTML = ''
  presets.forEach((preset) => {
    const item = document.createElement('div')
    item.className = `preset-item ${
      (preset.type === 'system' &&
        currentActivePresetId.system === preset.id) ||
      (preset.type === 'role' && currentActivePresetId.role === preset.id)
        ? 'active'
        : ''
    }`
    item.dataset.id = preset.id
    item.dataset.type = preset.type
    item.onclick = () => selectPresetForEdit(preset.id)

    const nameSpan = document.createElement('span')
    nameSpan.className = 'preset-name'
    nameSpan.textContent = preset.name

    const typeSpan = document.createElement('span')
    typeSpan.className = 'preset-type-badge'
    typeSpan.textContent =
      preset.type === 'system'
        ? lang === 'zh'
          ? '系统'
          : 'System'
        : lang === 'zh'
          ? '角色'
          : 'Role'

    const actionsDiv = document.createElement('div')
    actionsDiv.className = 'preset-actions'
    actionsDiv.innerHTML = `
            <button class="activate-preset" title="${line('activate')}">⭐</button>
            <button class="edit-preset" title="${line('edit')}">✏️</button>
            <button class="delete-preset" title="${line('delete')}">🗑️</button>
        `
    actionsDiv
      .querySelector('.activate-preset')
      .addEventListener('click', (e) => {
        e.stopPropagation()
        activatePreset(preset.id, preset.type)
      })
    actionsDiv.querySelector('.edit-preset').addEventListener('click', (e) => {
      e.stopPropagation()
      selectPresetForEdit(preset.id)
    })
    actionsDiv
      .querySelector('.delete-preset')
      .addEventListener('click', (e) => {
        e.stopPropagation()
        deletePreset(preset.id)
      })

    item.appendChild(nameSpan)
    item.appendChild(typeSpan)
    item.appendChild(actionsDiv)
    container.appendChild(item)
  })
}

export function getPresetRouteModelFieldMap() {
  return {
    chat: 'presetModelChat',
    code: 'presetModelCode',
    image: 'presetModelImage',
    video: 'presetModelVideo',
    ocr: 'presetModelOcr',
    vision: 'presetModelVision',
    translation: 'presetModelTranslation',
  }
}

export function populatePresetRouteModelSelects(selectedMap = {}) {
  const map = getPresetRouteModelFieldMap()
  const all = Array.isArray(globalThis.allModels) ? globalThis.allModels : []
  const lang = getLang()
  Object.entries(map).forEach(([category, elId]) => {
    const el = $(elId)
    if (!el) return
    el.innerHTML = ''
    const autoOpt = document.createElement('option')
    autoOpt.value = ''
    autoOpt.textContent = lang === 'zh' ? '（自动）' : '(Auto)'
    el.appendChild(autoOpt)
    all
      .filter((m) => m.type === category)
      .forEach((m) => {
        const opt = document.createElement('option')
        opt.value = m.value
        opt.textContent = m.label
        el.appendChild(opt)
      })
    const selectedValue = String(selectedMap[category] || '')
    if (selectedValue) {
      const exists = Array.from(el.options || []).some(
        (o) => o.value === selectedValue
      )
      if (!exists) {
        const missing = document.createElement('option')
        missing.value = selectedValue
        missing.textContent = `${selectedValue} (${lang === 'zh' ? '已绑定但当前不可用' : 'bound but unavailable'})`
        el.appendChild(missing)
      }
    }
    el.value = selectedValue
  })
}

export function readPresetRouteModelsFromForm() {
  const map = getPresetRouteModelFieldMap()
  const route = {}
  Object.entries(map).forEach(([category, elId]) => {
    const value = String($(elId)?.value || '').trim()
    if (value) route[category] = value
  })
  return route
}

export function selectPresetForEdit(id) {
  const presets = globalThis.presets || []
  const preset = presets.find((p) => p.id === id)
  if (preset) {
    $('editingPresetId').value = preset.id
    $('presetName').value = preset.name
    $('presetType').value = preset.type
    $('presetContent').value = preset.content
    populatePresetRouteModelSelects(preset.route_models || {})
  }
}

export function activatePreset(id, type) {
  const currentActivePresetId = globalThis.currentActivePresetId || {
    system: null,
    role: null,
  }
  if (type === 'system') {
    currentActivePresetId.system = id
  } else if (type === 'role') {
    currentActivePresetId.role = id
  }
  globalThis.currentActivePresetId = currentActivePresetId
  savePresets()
  renderPresetList()
  alert(line('preset_saved'))
}

export function deletePreset(id) {
  if (!confirm(line('confirm_delete_preset'))) return
  globalThis.presets = (globalThis.presets || []).filter((p) => p.id !== id)
  const cap = globalThis.currentActivePresetId || { system: null, role: null }
  if (cap.system === id) cap.system = null
  if (cap.role === id) cap.role = null
  globalThis.currentActivePresetId = cap
  savePresets()
  renderPresetList()
  clearPresetForm()
}

export function clearPresetForm() {
  $('editingPresetId').value = ''
  $('presetName').value = ''
  $('presetType').value = 'system'
  $('presetContent').value = ''
  populatePresetRouteModelSelects({})
}

export function savePreset() {
  const id = $('editingPresetId')?.value || ''
  const name = ($('presetName')?.value || '').trim()
  const type = ($('presetType')?.value || 'system').trim() || 'system'
  const content = ($('presetContent')?.value || '').trim()
  const route_models = readPresetRouteModelsFromForm()
  const hasRouteBinding = Object.keys(route_models).length > 0
  const lang = getLang()

  if (!content && !hasRouteBinding) {
    alert(
      lang === 'zh'
        ? '内容为空时，请至少绑定一个模型。'
        : 'When content is empty, please bind at least one model.'
    )
    return
  }

  let finalName = name
  if (!finalName) {
    const now = new Date()
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    finalName = (lang === 'zh' ? '路由预设 ' : 'Route Preset ') + stamp
    if ($('presetName')) $('presetName').value = finalName
  }

  let presets = globalThis.presets || []
  let currentActivePresetId = globalThis.currentActivePresetId || {
    system: null,
    role: null,
  }
  let finalPresetId = id

  if (id) {
    const preset = presets.find((p) => p.id === id)
    if (preset) {
      preset.name = finalName
      preset.type = type
      preset.content = content
      preset.route_models = route_models
    }
  } else {
    const newId = Date.now().toString()
    finalPresetId = newId
    presets = [
      ...presets,
      { id: newId, name: finalName, type, content, route_models },
    ]
    if (type === 'system' && !currentActivePresetId.system)
      currentActivePresetId.system = newId
    if (type === 'role' && !currentActivePresetId.role)
      currentActivePresetId.role = newId
  }

  globalThis.presets = presets
  globalThis.currentActivePresetId = currentActivePresetId

  savePresets()
  renderPresetList()
  if (finalPresetId) {
    selectPresetForEdit(finalPresetId)
  }
  alert(line('preset_saved'))
}

export function loadLanguage() {
  const i18n = getI18n()
  const lang = localStorage.getItem('ui_language')
  if (lang && i18n[lang]) {
    globalThis.currentLanguage = lang
  }
  updateUILanguage()
  const langSelect = $('languageSelect')
  if (langSelect) langSelect.value = globalThis.currentLanguage
}

export function saveLanguage() {
  const lang = $('languageSelect').value
  localStorage.setItem('ui_language', lang)
  globalThis.currentLanguage = lang
  updateUILanguage()
  alert(line('language_saved'))
  renderPresetList()
  renderConversionList()
}
