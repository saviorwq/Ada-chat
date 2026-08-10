export const STORAGE_KEYS = {
  selectedModel: 'selectedModel',
  temperature: 'samplingTemperature',
  topP: 'samplingTopP',
  maxTokens: 'samplingMaxTokens',
  presencePenalty: 'samplingPresencePenalty',
  frequencyPenalty: 'samplingFrequencyPenalty',
  routeEnabled: 'intentRouteEnabled',
  routeModelImage: 'intentRouteModelImage',
  routeModelVision: 'intentRouteModelVision',
  routeModelOcr: 'intentRouteModelOcr',
  routeModelTranslation: 'intentRouteModelTranslation',
  routeModelCode: 'intentRouteModelCode',
}

const ROUTE_MODEL_KEY_MAP = {
  image: STORAGE_KEYS.routeModelImage,
  vision: STORAGE_KEYS.routeModelVision,
  ocr: STORAGE_KEYS.routeModelOcr,
  translation: STORAGE_KEYS.routeModelTranslation,
  code: STORAGE_KEYS.routeModelCode,
}

const ROUTE_SELECT_ID_MAP = {
  image: 'routeModelImage',
  vision: 'routeModelVision',
  ocr: 'routeModelOcr',
  translation: 'routeModelTranslation',
  code: 'routeModelCode',
}

let allModelsCache = []

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function clamp(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function readNumber(key, min, max, fallback) {
  return clamp(localStorage.getItem(key), min, max, fallback)
}

function readIntOptional(key) {
  const raw = String(localStorage.getItem(key) || '').trim()
  if (!raw) return undefined
  const val = Number.parseInt(raw, 10)
  if (!Number.isFinite(val) || val <= 0) return undefined
  return val
}

function saveInputValue(id, key) {
  const el = document.getElementById(id)
  if (!el) return
  localStorage.setItem(key, String(el.value ?? ''))
}

function readRouteModel(category) {
  const key = ROUTE_MODEL_KEY_MAP[category]
  return key ? String(localStorage.getItem(key) || '').trim() : ''
}

function writeRouteModel(category, value) {
  const key = ROUTE_MODEL_KEY_MAP[category]
  if (!key) return
  if (!value) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, String(value).trim())
}

function modelLabel(model) {
  return String(model?.label || model?.value || '')
}

function modelValue(model) {
  return String(model?.value || '')
}

export function getSamplingSettings() {
  const settings = {
    temperature: readNumber(STORAGE_KEYS.temperature, 0, 2, 0.7),
    top_p: readNumber(STORAGE_KEYS.topP, 0, 1, 1),
    presence_penalty: readNumber(STORAGE_KEYS.presencePenalty, -2, 2, 0),
    frequency_penalty: readNumber(STORAGE_KEYS.frequencyPenalty, -2, 2, 0),
  }

  const maxTokens = readIntOptional(STORAGE_KEYS.maxTokens)
  if (maxTokens) settings.max_tokens = maxTokens

  return settings
}

export function getSelectedModel() {
  return String(localStorage.getItem(STORAGE_KEYS.selectedModel) || '').trim()
}

export function getAllModels() {
  return allModelsCache
}

export function isRouteEnabled() {
  return localStorage.getItem(STORAGE_KEYS.routeEnabled) === '1'
}

export function getRouteDefaultModel(category) {
  return readRouteModel(category)
}

export function modelsByCategory(category) {
  return allModelsCache.filter((m) => (m?.type || 'chat') === category)
}

export async function refreshAllModels() {
  const res = await fetch('ai_proxy.php?action=list_models&_=' + Date.now())
  if (!res.ok) throw new Error(`load models failed (${res.status})`)
  const data = await res.json()
  const models = Array.isArray(data?.models) ? data.models : []
  allModelsCache = models
  return models
}

export function hydrateModelSelect(selectEl) {
  if (!selectEl) return []
  const chatModels = modelsByCategory('chat')
  if (chatModels.length === 0) {
    selectEl.innerHTML = '<option value="">暂无可用聊天模型</option>'
    return []
  }

  selectEl.innerHTML = chatModels
    .map(
      (m) =>
        `<option value="${escapeHtml(modelValue(m))}">${escapeHtml(modelLabel(m))}</option>`
    )
    .join('')

  const saved = getSelectedModel()
  const hasSaved = chatModels.some((m) => modelValue(m) === saved)
  selectEl.value = hasSaved ? saved : modelValue(chatModels[0])
  localStorage.setItem(STORAGE_KEYS.selectedModel, selectEl.value)

  return chatModels
}

export function hydrateRouteModelSelects() {
  Object.entries(ROUTE_SELECT_ID_MAP).forEach(([category, selectId]) => {
    const el = document.getElementById(selectId)
    if (!el) return

    const rows = modelsByCategory(category)
    const options = [`<option value="">默认(${category})</option>`]
    rows.forEach((m) => {
      options.push(
        `<option value="${escapeHtml(modelValue(m))}">${escapeHtml(modelLabel(m))}</option>`
      )
    })
    el.innerHTML = options.join('')

    const saved = readRouteModel(category)
    const hasSaved = rows.some((m) => modelValue(m) === saved)
    el.value = hasSaved ? saved : ''
  })
}

export function initSettingsControls() {
  const tempEl = document.getElementById('samplingTemperature')
  const topPEl = document.getElementById('samplingTopP')
  const maxTokensEl = document.getElementById('samplingMaxTokens')
  const presenceEl = document.getElementById('samplingPresencePenalty')
  const frequencyEl = document.getElementById('samplingFrequencyPenalty')
  const modelEl = document.getElementById('modelSelect')
  const routeEnabledEl = document.getElementById('intentRouteEnabled')

  if (tempEl)
    tempEl.value = String(readNumber(STORAGE_KEYS.temperature, 0, 2, 0.7))
  if (topPEl) topPEl.value = String(readNumber(STORAGE_KEYS.topP, 0, 1, 1))
  if (maxTokensEl)
    maxTokensEl.value = String(
      localStorage.getItem(STORAGE_KEYS.maxTokens) || ''
    )
  if (presenceEl)
    presenceEl.value = String(
      readNumber(STORAGE_KEYS.presencePenalty, -2, 2, 0)
    )
  if (frequencyEl)
    frequencyEl.value = String(
      readNumber(STORAGE_KEYS.frequencyPenalty, -2, 2, 0)
    )
  if (routeEnabledEl) routeEnabledEl.checked = isRouteEnabled()

  modelEl?.addEventListener('change', () => {
    localStorage.setItem(
      STORAGE_KEYS.selectedModel,
      String(modelEl.value || '').trim()
    )
  })
  routeEnabledEl?.addEventListener('change', () => {
    localStorage.setItem(
      STORAGE_KEYS.routeEnabled,
      routeEnabledEl.checked ? '1' : '0'
    )
  })

  Object.entries(ROUTE_SELECT_ID_MAP).forEach(([category, selectId]) => {
    document.getElementById(selectId)?.addEventListener('change', (e) => {
      writeRouteModel(category, e.target.value)
    })
  })

  tempEl?.addEventListener('change', () =>
    saveInputValue('samplingTemperature', STORAGE_KEYS.temperature)
  )
  topPEl?.addEventListener('change', () =>
    saveInputValue('samplingTopP', STORAGE_KEYS.topP)
  )
  maxTokensEl?.addEventListener('change', () =>
    saveInputValue('samplingMaxTokens', STORAGE_KEYS.maxTokens)
  )
  presenceEl?.addEventListener('change', () =>
    saveInputValue('samplingPresencePenalty', STORAGE_KEYS.presencePenalty)
  )
  frequencyEl?.addEventListener('change', () =>
    saveInputValue('samplingFrequencyPenalty', STORAGE_KEYS.frequencyPenalty)
  )
}
