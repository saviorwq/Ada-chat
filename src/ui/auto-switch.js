/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 自动切换模型（原 adachat-auto-switch.js）
 * Auto-switch model helpers — globals wired via full-app-entry
 */
import { escapeHtml } from '@/shared/escape-html.js'

function $(id) {
  return document.getElementById(id)
}

function getLang() {
  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.currentLanguage === 'string'
  ) {
    return globalThis.currentLanguage
  }
  return 'zh'
}

function i18nLine(key) {
  const g = typeof globalThis !== 'undefined' ? globalThis : {}
  const pack = g.i18n?.[getLang()] || g.i18n?.en || g.i18n?.zh
  return pack?.[key] ?? key
}

function callHideAllPanels() {
  if (typeof globalThis.hideAllPanels === 'function') globalThis.hideAllPanels()
}

function callSetSettingsMenuActive(menuItemId) {
  if (typeof globalThis.setSettingsMenuActive === 'function') {
    globalThis.setSettingsMenuActive(menuItemId)
  }
}

export function isAutoSwitchEnabled() {
  return localStorage.getItem('autoSwitchModel') === 'true'
}

export function toggleAutoSwitch(checkbox) {
  localStorage.setItem('autoSwitchModel', checkbox.checked ? 'true' : 'false')
  const mainToggle = $('autoSwitchToggle')
  const settingsToggle = $('autoSwitchSettingToggle')
  if (mainToggle && mainToggle !== checkbox)
    mainToggle.checked = checkbox.checked
  if (settingsToggle && settingsToggle !== checkbox)
    settingsToggle.checked = checkbox.checked
}

export function getAutoSwitchList() {
  try {
    return JSON.parse(localStorage.getItem('autoSwitchList') || '[]')
  } catch {
    return []
  }
}

export function getAlternateModels(category, currentModelValue) {
  const userList = getAutoSwitchList()
  if (userList.length > 0) {
    return userList
      .filter((v) => v !== currentModelValue)
      .filter((v) => {
        if (!globalThis.allModels) return false
        const m = globalThis.allModels.find((x) => x.value === v)
        return m && m.type === category
      })
  }
  if (!globalThis.allModels) return []
  return globalThis.allModels
    .filter((m) => m.type === category && m.value !== currentModelValue)
    .map((m) => m.value)
}

export function getModelLabel(modelValue) {
  if (!globalThis.allModels) return modelValue
  const m = globalThis.allModels.find((x) => x.value === modelValue)
  if (m) return m.label
  const parts = modelValue.split('::')
  return parts.length > 1 ? parts[1] : modelValue
}

export function showAutoSwitchSettings() {
  callSetSettingsMenuActive('autoSwitchMenuItem')
  callHideAllPanels()
  const panel = $('autoSwitchPanel')
  if (panel) panel.style.display = 'block'
  const titleEl = $('settingsContentTitle')
  if (titleEl) titleEl.textContent = i18nLine('auto_switch_settings')

  const toggle = $('autoSwitchSettingToggle')
  if (toggle) toggle.checked = isAutoSwitchEnabled()

  renderAutoSwitchModelList()
}

export function renderAutoSwitchModelList() {
  const container = $('autoSwitchModelList')
  if (!container) return

  const allModels = globalThis.allModels || []
  if (allModels.length === 0) {
    container.innerHTML = `<p class="hint" style="padding:20px; text-align:center;">${escapeHtml(i18nLine('auto_switch_no_models'))}</p>`
    return
  }

  const savedList = getAutoSwitchList()
  const modelMap = new Map(allModels.map((m) => [m.value, m]))
  const ordered = []

  savedList.forEach((v) => {
    if (modelMap.has(v)) ordered.push(modelMap.get(v))
  })
  allModels.forEach((m) => {
    if (!savedList.includes(m.value)) ordered.push(m)
  })

  const grouped = {}
  ordered.forEach((m) => {
    if (!grouped[m.type]) grouped[m.type] = []
    grouped[m.type].push(m)
  })

  const typeLabels = {
    chat: { zh: '💬 对话', en: '💬 Chat' },
    code: { zh: '💻 编程', en: '💻 Code' },
    image: { zh: '🎨 图像', en: '🎨 Image' },
    video: { zh: '🎬 视频', en: '🎬 Video' },
    ocr: { zh: '📄 OCR', en: '📄 OCR' },
    vision: { zh: '👁️ 图像理解', en: '👁️ Vision' },
    translation: { zh: '🌐 翻译', en: '🌐 Translation' },
  }

  const lang = getLang()
  container.innerHTML = ''

  Object.keys(grouped).forEach((type) => {
    const section = document.createElement('div')
    section.className = 'auto-switch-type-group'

    const title = document.createElement('div')
    title.className = 'auto-switch-type-title'
    const label = typeLabels[type]
      ? typeLabels[type][lang] || typeLabels[type].en
      : type
    title.textContent = label
    section.appendChild(title)

    const group = document.createElement('div')
    group.className = 'auto-switch-model-group'

    grouped[type].forEach((m) => {
      const item = document.createElement('div')
      item.className = 'auto-switch-model-item'
      item.draggable = true
      item.dataset.value = m.value
      item.innerHTML = `
                <label>
                    <input type="checkbox" ${savedList.includes(m.value) ? 'checked' : ''} />
                    <span class="model-name">${escapeHtml(m.label)}</span>
                </label>
                <span class="model-provider">${escapeHtml(getProviderNameForModel(m.value))}</span>
                <span class="drag-handle">↕</span>
            `

      item.addEventListener('dragstart', () => item.classList.add('dragging'))
      item.addEventListener('dragend', () => item.classList.remove('dragging'))

      group.appendChild(item)
    })

    group.addEventListener('dragover', (e) => {
      e.preventDefault()
      const dragging = group.querySelector('.dragging')
      if (!dragging) return
      const afterElement = getDragAfterElement(group, e.clientY)
      if (afterElement == null) group.appendChild(dragging)
      else group.insertBefore(dragging, afterElement)
    })

    section.appendChild(group)
    container.appendChild(section)
  })
}

function getDragAfterElement(container, y) {
  const elements = [
    ...container.querySelectorAll('.auto-switch-model-item:not(.dragging)'),
  ]
  return elements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect()
      const offset = y - box.top - box.height / 2
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child }
      }
      return closest
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element
}

function getProviderNameForModel(modelValue) {
  const [pId] = modelValue.split('::')
  const p = (globalThis.providers || []).find((x) => x.id === pId)
  return p ? p.name : pId
}

export function saveAutoSwitchList() {
  const checkedValues = []
  document
    .querySelectorAll('#autoSwitchModelList .auto-switch-model-item')
    .forEach((item) => {
      const checked = item.querySelector('input[type="checkbox"]').checked
      if (checked) checkedValues.push(item.dataset.value)
    })
  localStorage.setItem('autoSwitchList', JSON.stringify(checkedValues))
  alert(i18nLine('auto_switch_saved'))
}

export function isRateLimitMessage(text) {
  const t = String(text || '').toLowerCase()
  return (
    t.includes('429') ||
    t.includes('rate limit') ||
    t.includes('too many requests') ||
    t.includes('请求过于频繁') ||
    t.includes('限流') ||
    t.includes('频率限制')
  )
}

/**
 * 可自动切换的瞬态供应商错误（限流 / 网关抖动 / 超时）
 * Transient provider errors eligible for auto-switch
 */
export function isTransientProviderError(text) {
  if (isRateLimitMessage(text)) return true
  const t = String(text || '').toLowerCase()
  return (
    t.includes('502') ||
    t.includes('503') ||
    t.includes('504') ||
    t.includes('408') ||
    t.includes('timeout') ||
    t.includes('timed out') ||
    t.includes('超时') ||
    t.includes('econnreset') ||
    t.includes('connection reset') ||
    t.includes('连接重置') ||
    t.includes('temporarily unavailable') ||
    t.includes('bad gateway') ||
    t.includes('service unavailable') ||
    t.includes('gateway timeout') ||
    t.includes('upstream') ||
    t.includes('cloudflare')
  )
}

export function showAutoSwitchToast(modelLabel) {
  const toast = document.createElement('div')
  toast.className = 'auto-switch-toast'
  toast.textContent = i18nLine('auto_switch_notice') + modelLabel
  document.body.appendChild(toast)
  setTimeout(() => toast.classList.add('show'), 10)
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 300)
  }, 2000)
}
