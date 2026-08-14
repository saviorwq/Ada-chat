/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * Provider / models / mode-capability（原 adachat-provider-models.js）
 */
import { escapeHtml } from '@/shared/escape-html.js'

function $(id) {
  return document.getElementById(id)
}
function getLang() {
  return typeof globalThis.currentLanguage === 'string'
    ? globalThis.currentLanguage
    : 'zh'
}
function getI18n() {
  return globalThis.AdaChatI18n || globalThis.i18n || { zh: {}, en: {} }
}
function pack() {
  const i18n = getI18n()
  return i18n[getLang()] || i18n.en || {}
}
function getModeCapabilityConfig() {
  return globalThis.AdaChatModeConfig || {}
}
function getModeCapabilityImageAccept() {
  return getModeCapabilityConfig().IMAGE_ACCEPT || '.jpg,.jpeg,.png,.webp,.gif'
}
const MODE_CAPABILITY_PDF_SCAN_MAX_PAGES = 5

globalThis.providers = globalThis.providers || []
globalThis.currentEditingProviderId =
  globalThis.currentEditingProviderId || null

function _postHeaders(includeJson) {
  const h = includeJson !== false ? { 'Content-Type': 'application/json' } : {}
  const meta = document.querySelector('meta[name="csrf-token"]')
  if (meta) h['X-CSRF-Token'] = meta.content
  return h
}

function onProviderDeploymentTypeChange() {
  const typeEl = $('provDeploymentType')
  const engineEl = $('provInferenceEngine')
  const apiKeyInput = $('provApiKey')
  const apiKeyLabel = document.querySelector('th[data-i18n="api_key"]')
  const hintEl = $('providerDeploymentHint')
  const baseUrlRow = $('provBaseUrlRow')
  const modelsDirRow = $('provModelsDirRow')
  const engineRow = $('provInferenceEngineRow')
  const fetchBtn = document.querySelector('.fetch-models-btn')
  if (!typeEl || !apiKeyInput) return

  const isLocal = typeEl.value === 'local'
  const isDirect =
    isLocal && (!engineEl || engineEl.value === 'direct' || engineEl.value === '')

  apiKeyInput.required = !isLocal && !$('providerId').value
  if (apiKeyLabel) {
    apiKeyLabel.textContent = isLocal
      ? pack().api_key_optional || 'API Key (optional)'
      : pack().api_key || 'API Key*'
  }
  if (hintEl) {
    hintEl.textContent = isDirect
      ? pack().provider_deployment_hint_local_direct ||
        '本地直连模式：将 .gguf / safetensors 放入模型目录后点击扫描，无需 Ollama。'
      : isLocal
        ? pack().provider_deployment_hint_local ||
          '本地 HTTP 模式：需兼容 OpenAI API 的本地服务（如 LM Studio）。'
        : pack().provider_deployment_hint_cloud ||
          'Cloud mode usually requires an API key.'
  }
  if (baseUrlRow) {
    baseUrlRow.style.display = isDirect ? 'none' : ''
  }
  if (modelsDirRow) {
    // 本地 HTTP/Vulkan 也需要 models_dir，用于递归扫描子文件夹里的 GGUF
    // Local HTTP/Vulkan also needs models_dir for recursive GGUF discovery
    modelsDirRow.style.display = isLocal ? '' : 'none'
  }
  if (engineRow) engineRow.style.display = isLocal ? '' : 'none'
  if ($('provBaseUrl') && isDirect) {
    $('provBaseUrl').value = 'direct://local'
  }
  if (fetchBtn) {
    fetchBtn.textContent = isLocal
      ? pack().scan_local_models || '扫描本地模型'
      : pack().fetch_models || '获取最新模型'
  }
  const depsRow = $('provLocalDepsRow')
  if (depsRow) {
    depsRow.style.display = isDirect ? '' : 'none'
    if (isDirect) {
      refreshLocalInferenceStatus()
    }
  }
}

export async function refreshLocalInferenceStatus() {
  const el = $('localInferenceStatus')
  if (!el) return
  el.innerHTML = ''
  el.textContent = pack().local_inference_checking || '检测中…'
  el.style.color = '#888'
  try {
    const res = await fetch('ai_proxy.php?action=local_inference_status', {
      credentials: 'same-origin',
    })
    const data = await res.json()
    if (!data.success) {
      const detail = data.detail || data.error || ''
      if (detail === 'exec_disabled' || data.exec_available === false) {
        el.textContent =
          pack().local_inference_exec_disabled ||
          'PHP exec 被禁用，无法启动本地推理'
      } else {
        el.textContent =
          (pack().local_inference_missing ||
            '未安装本地推理库') +
          ' — pip install -r requirements-local-inference.txt'
      }
      el.style.color = '#dc2626'
      return
    }
    const st = data.status || {}
    if (st.exec_available === false) {
      el.textContent =
        pack().local_inference_exec_disabled ||
        'PHP exec 被禁用'
      el.style.color = '#dc2626'
      return
    }
    const ready = st.ready || st.llama_cpp || st.transformers
    if (ready) {
      el.textContent =
        pack().local_inference_ready || '✅ 本地推理就绪'
      el.style.color = '#059669'
      const hint = document.createElement('div')
      hint.className = 'hint local-video-hint'
      hint.style.marginTop = '6px'
      hint.textContent =
        pack().local_inference_video_hint ||
        '（文生视频本地：requirements-local-video.txt）'
      el.appendChild(hint)
    } else {
      el.textContent =
        (pack().local_inference_missing ||
          'pip install -r requirements-local-inference.txt') +
        ''
      el.style.color = '#dc2626'
    }
  } catch (e) {
    el.textContent = '检测失败: ' + (e.message || String(e))
    el.style.color = '#dc2626'
  }
}

globalThis.refreshLocalInferenceStatus = refreshLocalInferenceStatus

export { onProviderDeploymentTypeChange }

export function showAddProvider() {
  globalThis.setSettingsMenuActive('addProviderMenuItem')
  globalThis.hideAllPanels()
  const panel = $('providerEditPanel')
  if (panel) panel.style.display = 'block'
  $('settingsContentTitle').textContent = pack().add_provider
  $('providerId').value = ''
  $('provName').value = ''
  $('provBaseUrl').value = ''
  const apiKeyInput = $('provApiKey')
  apiKeyInput.value = ''
  apiKeyInput.required = true
  apiKeyInput.placeholder = ''
  if ($('provDeploymentType')) $('provDeploymentType').value = 'cloud'
  if ($('provInferenceEngine')) $('provInferenceEngine').value = 'http'
  if ($('provModelsDir')) $('provModelsDir').value = ''
  $('provModelsPath').value = '/models'
  $('provChatPath').value = '/chat/completions'
  $('provImageGenPath').value = '/images/generations'
  $('provImageEditPath').value = '/images/edits'
  $('provVideoPath').value = '/videos/generations'
  $('provCacheStrategy').value = 'auto'
  const container = $('modelCheckboxList')
  if (container) container.innerHTML = ''
  globalThis.currentEditingProviderId = null
  document
    .querySelectorAll('.provider-item')
    .forEach((item) => item.classList.remove('active'))
  onProviderDeploymentTypeChange()
}

export function showEditProvider(id) {
  globalThis.currentEditingProviderId = id
  globalThis.hideAllPanels()
  const panel = $('providerEditPanel')
  if (panel) panel.style.display = 'block'
  $('settingsContentTitle').textContent = pack().edit_provider || '编辑供应商'
  editProvider(id)
}

export async function loadProviderListSubmenu() {
  const submenu = $('providerListSubmenu')
  if (!submenu) return

  try {
    const res = await fetch('ai_proxy.php?action=get_providers')
    const rawText = await res.text()
    let raw = null
    try {
      raw = JSON.parse(rawText)
    } catch {
      const maybeHtml = /<\s*!doctype|<\s*html/i.test(rawText)
      const msg = maybeHtml
        ? '登录态可能已失效（接口返回了HTML）'
        : '接口返回了非 JSON 数据'
      submenu.innerHTML = `<div class="hint" style="padding:8px 12px;">${msg}</div>`
      return
    }
    const providerList = Array.isArray(raw)
      ? raw
      : raw && Array.isArray(raw.providers)
        ? raw.providers
        : []
    globalThis.providers = providerList

    submenu.innerHTML = ''
    if (!providerList.length) {
      const msg =
        raw && raw.error && /unauthorized/i.test(String(raw.error))
          ? '登录态已失效，请刷新页面重新登录'
          : '暂无供应商'
      submenu.innerHTML = `<div class="hint" style="padding:8px 12px;">${msg}</div>`
      return
    }

    providerList.forEach((p) => {
      const item = document.createElement('div')
      item.className = 'provider-item'
      item.dataset.id = p.id

      item.onclick = (e) => {
        e.stopPropagation()
        showEditProvider(p.id)
        document
          .querySelectorAll('.provider-item')
          .forEach((pi) => pi.classList.remove('active'))
        item.classList.add('active')
      }

      item.innerHTML = `
                <span class="provider-name">${p.name}</span>
                <div class="provider-actions">
                    <button onclick="event.stopPropagation();deleteProvider('${p.id}')">🗑️</button>
                </div>
            `

      submenu.appendChild(item)
    })
  } catch (e) {
    console.error('加载供应商列表失败', e)
  }
}

export function toggleProviderList() {
  const submenu = $('providerListSubmenu')
  const arrow = $('providerListArrow')
  if (!submenu || !arrow) return
  if (submenu.style.display === 'none') {
    submenu.style.display = 'block'
    arrow.textContent = '▼'
  } else {
    submenu.style.display = 'none'
    arrow.textContent = '▶'
  }
}

export async function editProvider(id) {
  try {
    const res = await fetch(`ai_proxy.php?action=get_provider&id=${id}`)
    const p = await res.json()
    $('providerId').value = p.id
    $('provName').value = p.name
    $('provBaseUrl').value = p.base_url
    const apiKeyInput = $('provApiKey')
    apiKeyInput.value = ''
    apiKeyInput.required = false
    apiKeyInput.placeholder = pack().api_key_keep_hint || '留空则保持不变'
    if ($('provDeploymentType')) {
      $('provDeploymentType').value = p.deployment_type || 'cloud'
    }
    if ($('provInferenceEngine')) {
      $('provInferenceEngine').value = p.inference_engine || (p.deployment_type === 'local' ? 'direct' : 'http')
    }
    if ($('provModelsDir')) {
      $('provModelsDir').value = p.models_dir || ''
    }
    $('provModelsPath').value = p.models_path || '/models'
    $('provChatPath').value = p.chat_path || '/chat/completions'
    $('provImageGenPath').value = p.image_gen_path || '/images/generations'
    $('provImageEditPath').value = p.image_edit_path || '/images/edits'
    $('provVideoPath').value = p.video_path || '/videos/generations'
    $('provCacheStrategy').value = p.cache_strategy || 'auto'

    const fullProvider = (globalThis.providers || []).find((pr) => pr.id === id)
    if (
      fullProvider &&
      ((fullProvider.all_model_objs &&
        fullProvider.all_model_objs.length > 0) ||
        (fullProvider.all_models && fullProvider.all_models.length > 0))
    ) {
      const enabledMap = {}
      ;(fullProvider.models || []).forEach((m) => {
        if (!m || !m.id) return
        enabledMap[String(m.id)] = String(m.type || 'chat')
      })
      const allList =
        fullProvider.all_model_objs || fullProvider.all_models || []
      renderModelCheckboxes(allList, enabledMap)
    } else {
      const container = $('modelCheckboxList')
      if (container) container.innerHTML = ''
    }
    onProviderDeploymentTypeChange()
  } catch (e) {
    console.error('编辑供应商失败', e)
  }
}

export function renderModelCheckboxes(allModelsList, enabledModelMap) {
  const container = $('modelCheckboxList')
  if (!container) return
  container.innerHTML = ''

  const searchInput = $('modelSearchInput')
  if (searchInput) searchInput.value = ''
  updateModelSearchCount(null)

  if (!Array.isArray(allModelsList) || allModelsList.length === 0) {
    container.innerHTML =
      '<p class="hint" style="color:#999; padding:10px;">暂无模型数据</p>'
    return
  }
  const enabledMap = enabledModelMap || {}
  allModelsList.forEach((modelItem) => {
    const modelId =
      typeof modelItem === 'string' ? modelItem : String(modelItem?.id || '')
    if (!modelId) return
    const inferredType =
      typeof modelItem === 'string' ? 'chat' : String(modelItem?.type || 'chat')
    const selectedType = String(enabledMap[modelId] || inferredType || 'chat')
    const isChecked = Object.prototype.hasOwnProperty.call(enabledMap, modelId)
    const itemDiv = document.createElement('div')
    itemDiv.className = 'model-checkbox-item' + (isChecked ? ' checked' : '')
    itemDiv.dataset.modelId = modelId.toLowerCase()
    itemDiv.dataset.defaultType = selectedType
    const safeId = `model_${modelId.replace(/[^a-zA-Z0-9]/g, '_')}`
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.id = safeId
    checkbox.value = modelId
    checkbox.checked = isChecked
    checkbox.addEventListener('change', function () {
      itemDiv.classList.toggle('checked', this.checked)
    })
    const label = document.createElement('label')
    label.htmlFor = safeId
    label.textContent = modelId
    const badge = document.createElement('span')
    badge.className = 'auto-switch-type-badge'
    badge.style.marginLeft = '8px'
    badge.textContent = selectedType
    badge.title = `auto type: ${selectedType}`
    itemDiv.addEventListener('click', function (e) {
      if (e.target === checkbox || e.target === label) return
      checkbox.checked = !checkbox.checked
      checkbox.dispatchEvent(new Event('change'))
    })
    itemDiv.appendChild(checkbox)
    itemDiv.appendChild(label)
    itemDiv.appendChild(badge)
    container.appendChild(itemDiv)
  })
}

export function filterModelCheckboxes(query) {
  const container = $('modelCheckboxList')
  if (!container) return
  const items = container.querySelectorAll('.model-checkbox-item')
  const q = (query || '').toLowerCase().trim()
  let visible = 0
  let total = items.length

  items.forEach((item) => {
    if (!q || item.dataset.modelId.includes(q)) {
      item.style.display = ''
      visible++
    } else {
      item.style.display = 'none'
    }
  })

  updateModelSearchCount(q ? `${visible} / ${total}` : null)
}

export function updateModelSearchCount(text) {
  const el = $('modelSearchCount')
  if (el) el.textContent = text || ''
}

export function selectAllModels() {
  const container = $('modelCheckboxList')
  if (!container) return
  container.querySelectorAll('.model-checkbox-item').forEach((item) => {
    if (item.style.display !== 'none') {
      const cb = item.querySelector('input[type="checkbox"]')
      if (cb) {
        cb.checked = true
        item.classList.add('checked')
      }
    }
  })
  const altElements = document.querySelectorAll('[data-i18n-alt]')
  altElements.forEach((el) => {
    const key = el.getAttribute('data-i18n-alt')
    const i18nObj = getI18n()
    const lang = getLang()
    const value =
      (i18nObj[lang] && i18nObj[lang][key]) ||
      (i18nObj.en && i18nObj.en[key]) ||
      null
    if (value) el.setAttribute('alt', value)
  })
}

export function deselectAllModels() {
  const container = $('modelCheckboxList')
  if (!container) return
  container.querySelectorAll('.model-checkbox-item').forEach((item) => {
    if (item.style.display !== 'none') {
      const cb = item.querySelector('input[type="checkbox"]')
      if (cb) {
        cb.checked = false
        item.classList.remove('checked')
      }
    }
  })
}

export async function saveProvider(event) {
  event.preventDefault()
  const id = $('providerId').value
  const name = $('provName').value
  const base_url = $('provBaseUrl').value
  const api_key = $('provApiKey').value
  const models_path = $('provModelsPath').value
  const chat_path = $('provChatPath').value
  const image_gen_path = $('provImageGenPath').value
  const image_edit_path = $('provImageEditPath').value
  const video_path = $('provVideoPath').value
  const deployment_type = $('provDeploymentType')?.value || 'cloud'
  const inference_engine = $('provInferenceEngine')?.value || (deployment_type === 'local' ? 'direct' : 'http')
  const models_dir = $('provModelsDir')?.value?.trim() || ''

  const cache_strategy = $('provCacheStrategy').value

  const data = {
    name,
    base_url: base_url || (deployment_type === 'local' && inference_engine === 'direct' ? 'direct://local' : base_url),
    api_key,
    models_path,
    chat_path,
    image_gen_path,
    image_edit_path,
    video_path,
    cache_strategy,
    deployment_type,
    inference_engine,
    models_dir,
  }
  if (id) data.id = id

  try {
    const res = await fetch('ai_proxy.php?action=save_provider', {
      method: 'POST',
      headers: _postHeaders(),
      body: JSON.stringify(data),
      credentials: 'same-origin',
    })
    const result = await res.json()
    if (result.success) {
      alert('保存成功')
      await loadProviderListSubmenu()
      if (!id) {
        showEditProvider(result.id)
        document.querySelectorAll('.provider-item').forEach((item) => {
          if (item.dataset.id === result.id) item.classList.add('active')
        })
      } else {
        editProvider(id)
      }
      await globalThis.loadProviders()
    } else {
      alert('保存失败：' + (result.error || '未知错误'))
    }
  } catch (e) {
    alert('保存失败：网络错误')
  }
}

export async function deleteProvider(id) {
  if (!confirm('确定删除此供应商？')) return
  try {
    const res = await fetch(
      `ai_proxy.php?action=delete_provider&id=${encodeURIComponent(id)}`,
      {
        method: 'POST',
        headers: _postHeaders(false),
        credentials: 'same-origin',
      }
    )
    const result = await res.json()
    if (result.success) {
      await loadProviderListSubmenu()
      if ((globalThis.providers || []).length > 0) {
        showEditProvider(globalThis.providers[0].id)
      } else {
        showAddProvider()
      }
      await globalThis.loadProviders()
    } else {
      alert('删除失败')
    }
  } catch (e) {
    alert('删除失败：网络错误')
  }
}

export async function fetchModelsForCurrentProvider() {
  if (!globalThis.currentEditingProviderId) {
    alert('请先选择或新增供应商')
    return
  }
  await fetchModelsForProviderId(globalThis.currentEditingProviderId)
}

export async function fetchModelsForProviderId(id) {
  try {
    const res = await fetch(
      `ai_proxy.php?action=fetch_models&id=${encodeURIComponent(id)}`,
      {
        method: 'POST',
        headers: _postHeaders(false),
        credentials: 'same-origin',
      }
    )
    const result = await res.json()
    if (result.success) {
      const scanned = result.source === 'local_scan'
      let msg = scanned ? '本地模型扫描完成！' : '获取模型成功！'
      if (result.hint) {
        msg += '\n\n' + String(result.hint)
      }
      if (typeof result.image_models === 'number' && result.image_models > 0) {
        msg += '\n文生图模型：' + result.image_models + ' 个（标签 image）'
      }
      if (Array.isArray(result.image_loras) && result.image_loras.length > 0) {
        msg += '\nLoRA：' + result.image_loras.length + ' 个'
        const provider = (globalThis.providers || []).find((p) => p.id === id)
        if (provider) provider.image_loras = result.image_loras
        if (!globalThis.imageLorasByProvider) globalThis.imageLorasByProvider = {}
        globalThis.imageLorasByProvider[id] = result.image_loras
        if (typeof globalThis.refreshImageLoraUi === 'function') {
          globalThis.refreshImageLoraUi()
        }
      }
      alert(msg)
      const modelList =
        Array.isArray(result.model_objects) && result.model_objects.length > 0
          ? result.model_objects
          : Array.isArray(result.models)
            ? result.models
            : []
      const provider = (globalThis.providers || []).find((p) => p.id === id)
      const enabledMap = {}
      ;(provider?.models || []).forEach((m) => {
        if (!m || !m.id) return
        enabledMap[String(m.id)] = String(m.type || 'chat')
      })
      renderModelCheckboxes(modelList, enabledMap)
    } else {
      alert('获取失败：' + (result.error || ''))
    }
  } catch (e) {
    alert('获取失败：网络错误')
  }
}

export async function saveSelectedModels() {
  if (!globalThis.currentEditingProviderId) {
    alert('没有正在编辑的供应商')
    return
  }
  const container = $('modelCheckboxList')
  if (!container) return
  const checkboxes = container.querySelectorAll('input[type="checkbox"]')
  const selectedModels = []
  checkboxes.forEach((cb) => {
    if (!cb.checked) return
    const row = cb.closest('.model-checkbox-item')
    const modelType = String(row?.dataset?.defaultType || 'chat')
    selectedModels.push({ id: cb.value, type: modelType })
  })
  try {
    const res = await fetch('ai_proxy.php?action=update_provider_models', {
      method: 'POST',
      headers: _postHeaders(),
      body: JSON.stringify({
        id: globalThis.currentEditingProviderId,
        models: selectedModels,
      }),
      credentials: 'same-origin',
    })
    const result = await res.json()
    if (result.success) {
      alert('模型选择已保存')
      await globalThis.loadAllModels()
      globalThis.filterModelsByCategory()
      await loadProviderListSubmenu()
      editProvider(globalThis.currentEditingProviderId)
    } else {
      alert('保存失败：' + (result.error || '未知错误'))
    }
  } catch (e) {
    alert('保存失败：网络错误')
  }
}

export function showModelTypeManager() {
  globalThis.setSettingsMenuActive('modelTypeManagerMenuItem')
  globalThis.hideAllPanels()
  const panel = $('modelTypePanel')
  if (panel) panel.style.display = 'block'
  $('settingsContentTitle').textContent = pack().model_type_manager
  loadModelTypeList()
}

export function getModeCapabilityLabel(mode) {
  const map = {
    chat: pack().category_chat || 'Chat',
    code: pack().category_code || 'Code',
    image: pack().category_image || 'Image',
    video: pack().category_video || 'Video',
    ocr: pack().category_ocr || 'OCR',
    vision: pack().category_vision || 'Vision',
    translation: pack().category_translation || 'Translation',
  }
  return map[mode] || mode
}

export function getModeProcessingText(mode) {
  const zh = getLang() === 'zh'
  switch (mode) {
    case 'chat':
    case 'code':
      return zh ? '可附图对话' : 'Chat with optional image input'
    case 'image':
      return zh
        ? '文生图直接生成；图生图使用上传图片生成'
        : 'Text-to-image or image-to-image generation'
    case 'video':
      return zh
        ? '根据文本或参考图生成视频'
        : 'Generate video from text or reference image'
    case 'ocr':
      return zh
        ? `图片直连OCR；PDF先提取文字，若无文字层则渲染前${MODE_CAPABILITY_PDF_SCAN_MAX_PAGES}页做扫描识别`
        : `OCR image directly; for PDF, extract text first, then render first ${MODE_CAPABILITY_PDF_SCAN_MAX_PAGES} pages if scanned`
    case 'vision':
      return zh ? '图像理解与分析' : 'Visual understanding and analysis'
    case 'translation':
      return zh
        ? '支持纯文本翻译与图片文字翻译'
        : 'Supports text translation and translation from image text'
    default:
      return zh ? '按模式配置处理' : 'Processed by mode configuration'
  }
}

export function getModeFlagsText(modeConfig) {
  const zh = getLang() === 'zh'
  if (!modeConfig || typeof modeConfig !== 'object') {
    return zh ? '无' : 'None'
  }
  const flagLabels = zh
    ? {
        isChatLike: '聊天型',
        requiresImage: '必须图片',
        requiresImageOrPdf: '必须图片或PDF',
        allowTextOnly: '支持纯文本',
      }
    : {
        isChatLike: 'chat-like',
        requiresImage: 'requires image',
        requiresImageOrPdf: 'requires image or PDF',
        allowTextOnly: 'text-only allowed',
      }
  const flags = Object.keys(flagLabels).filter(
    (key) => modeConfig[key] === true
  )
  if (!flags.length) {
    return zh ? '无' : 'None'
  }
  return flags.map((key) => flagLabels[key]).join(' / ')
}

function buildModeCapabilitiesRows() {
  const MODE_CAPABILITY_CONFIG = getModeCapabilityConfig()
  const modeMap = MODE_CAPABILITY_CONFIG.modeMap || {}
  const getAccept =
    typeof MODE_CAPABILITY_CONFIG.getUploadAccept === 'function'
      ? MODE_CAPABILITY_CONFIG.getUploadAccept
      : (mode) => modeMap[mode]?.uploadAccept || getModeCapabilityImageAccept()
  const modeOrder = [
    'chat',
    'code',
    'image',
    'video',
    'ocr',
    'vision',
    'translation',
  ]
  const zh = getLang() === 'zh'
  const unavailable = zh ? '未配置' : 'Not configured'
  return modeOrder
    .filter((mode) => !!modeMap[mode])
    .map((mode) => {
      const modeConfig = modeMap[mode] || {}
      let uploadText =
        getAccept(mode, 'text2img') || (zh ? '无需上传' : 'No upload required')
      if (mode === 'image') {
        const text2img =
          getAccept('image', 'text2img') ||
          (zh ? '无需上传' : 'No upload required')
        const img2img = getAccept('image', 'img2img') || unavailable
        uploadText = zh
          ? `文生图：${text2img}；图生图：${img2img}`
          : `Text2Image: ${text2img}; Image2Image: ${img2img}`
      }
      return {
        mode,
        modeLabel: getModeCapabilityLabel(mode),
        uploadText,
        processingText: getModeProcessingText(mode),
        flagsText: getModeFlagsText(modeConfig),
      }
    })
}

export function generateModeCapabilitiesMarkdown() {
  const rows = buildModeCapabilitiesRows()
  const zh = getLang() === 'zh'
  const title = zh ? '### 🧭 模式能力矩阵' : '### 🧭 Mode Capability Matrix'
  const header = zh
    ? '| 模式 | 上传格式 | 处理方式 | 关键开关 |'
    : '| Mode | Upload Formats | Processing | Key Flags |'
  const divider = '|:---|:---|:---|:---|'
  const body = rows
    .map(
      (row) =>
        `| ${row.modeLabel} | ${row.uploadText} | ${row.processingText} | ${row.flagsText} |`
    )
    .join('\n')
  return `${title}\n\n${header}\n${divider}\n${body}`
}

export async function copyModeCapabilitiesMarkdown() {
  const markdown = generateModeCapabilitiesMarkdown()
  try {
    const ok = await globalThis.copyTextToClipboard(markdown)
    if (!ok) throw new Error('copy_failed')
    alert(pack().mode_capability_copy_success || 'Copied')
  } catch {
    alert(pack().mode_capability_copy_failed || 'Copy failed')
  }
}

export function renderModeCapabilitiesPanel() {
  const container = $('modeCapabilitiesTable')
  if (!container) return
  const rowsData = buildModeCapabilitiesRows()
  const zh = getLang() === 'zh'
  const modeHeader = zh ? '模式' : 'Mode'
  const uploadHeader = zh ? '上传格式' : 'Upload Formats'
  const processHeader = zh ? '处理方式' : 'Processing'
  const flagsHeader =
    pack().mode_capability_flags || (zh ? '关键开关' : 'Key Flags')
  const copyLabel =
    pack().mode_capability_copy_md ||
    (zh ? '复制为Markdown' : 'Copy as Markdown')
  const rows = rowsData
    .map(
      (row) => `
            <tr>
                <td>${escapeHtml(row.modeLabel)}</td>
                <td>${escapeHtml(row.uploadText)}</td>
                <td>${escapeHtml(row.processingText)}</td>
                <td>${escapeHtml(row.flagsText)}</td>
            </tr>
        `
    )
    .join('')

  const footer = zh
    ? '<p class="hint">配置来源：src/config/mode-config.js（只读展示）。</p>'
    : '<p class="hint">Config source: src/config/mode-config.js (read-only view).</p>'

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
    `
}

export function showModeCapabilities() {
  globalThis.setSettingsMenuActive('modeCapabilitiesMenuItem')
  globalThis.hideAllPanels()
  const panel = $('modeCapabilitiesPanel')
  if (panel) panel.style.display = 'block'
  if ($('settingsContentTitle')) {
    $('settingsContentTitle').textContent =
      pack().mode_capability_matrix || 'Mode Capability Matrix'
  }
  renderModeCapabilitiesPanel()
}

export function loadModelTypeList() {
  const container = $('modelTypeList')
  if (!container) return
  container.innerHTML = ''
  if (!globalThis.allModels || globalThis.allModels.length === 0) {
    container.innerHTML =
      '<p class="hint">暂无已启用的模型，请先在供应商中启用模型。</p>'
    return
  }
  const byProvider = {}
  globalThis.allModels.forEach((m) => {
    const [pId] = m.value.split('::')
    if (!byProvider[pId]) byProvider[pId] = []
    byProvider[pId].push(m)
  })
  for (const [pId, models] of Object.entries(byProvider)) {
    const provider = (globalThis.providers || []).find((p) => p.id === pId)
    const providerName = provider ? provider.name : pId
    const section = document.createElement('div')
    section.className = 'provider-type-section'
    section.innerHTML = `<h5>${providerName}</h5>`
    models.forEach((m) => {
      const row = document.createElement('div')
      row.className = 'model-type-row'
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
                    <option value="embedding" ${m.type === 'embedding' ? 'selected' : ''}>🧬 向量</option>
                </select>
            `
      section.appendChild(row)
    })
    container.appendChild(section)
  }
}

export async function saveModelTypes() {
  const selects = document.querySelectorAll('.model-type-select')
  const updates = {}
  selects.forEach((select) => {
    const modelValue = select.dataset.modelValue
    const [pId, modelId] = modelValue.split('::')
    const newType = select.value
    if (!updates[pId]) updates[pId] = []
    updates[pId].push({ id: modelId, type: newType })
  })
  let successCount = 0
  for (const [pId, models] of Object.entries(updates)) {
    try {
      const res = await fetch('ai_proxy.php?action=update_provider_models', {
        method: 'POST',
        headers: _postHeaders(),
        body: JSON.stringify({ id: pId, models }),
        credentials: 'same-origin',
      })
      const result = await res.json()
      if (result.success) successCount++
    } catch (e) {
      console.error('更新失败', e)
    }
  }
  if (successCount === Object.keys(updates).length) {
    alert('所有模型类型已更新')
    await globalThis.loadAllModels()
    loadModelTypeList()
  } else {
    alert('部分更新失败，请检查')
  }
}

// ---------- 主界面：供应商下拉与按类别筛选模型（原 script.js）----------
/**
 * Main chat bar: load providers / models from ai_proxy（与 globalThis.allModels、applyPresetBoundChatModel 配合）
 */

function _setProviderSelectMessage(text, isError = false) {
  const providerSelect = $('providerSelect')
  if (!providerSelect) return
  providerSelect.innerHTML = ''
  const option = document.createElement('option')
  option.value = ''
  option.textContent = text
  providerSelect.appendChild(option)
  if (isError) {
    providerSelect.style.borderColor = '#dc2626'
  } else {
    providerSelect.style.borderColor = ''
  }
}

export async function loadProviders() {
  const providerSelect = $('providerSelect')
  if (!providerSelect) return

  _setProviderSelectMessage(pack().loading_providers || '加载供应商中...')

  try {
    const res = await fetch('ai_proxy.php?action=get_providers&_=' + Date.now(), {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const rawText = await res.text()
    let raw = null
    try {
      raw = JSON.parse(rawText)
    } catch (_) {
      const maybeHtml = /<\s*!doctype|<\s*html/i.test(rawText)
      const hint = maybeHtml
        ? '（返回了 HTML，可能登录已过期，请刷新或重新登录）'
        : '（响应不是有效 JSON）'
      throw new Error('供应商接口异常 HTTP ' + res.status + hint)
    }

    if (!res.ok) {
      const errMsg =
        (raw && (raw.error || raw.message)) ||
        'HTTP ' + res.status
      throw new Error(String(errMsg))
    }

    if (raw && raw.success === false && raw.error) {
      throw new Error(String(raw.error))
    }

    globalThis.providers = Array.isArray(raw)
      ? raw
      : raw && Array.isArray(raw.providers)
        ? raw.providers
        : []

    providerSelect.innerHTML = ''
    providerSelect.style.borderColor = ''

    if (globalThis.providers.length > 0) {
      globalThis.providers.forEach((p) => {
        const option = document.createElement('option')
        option.value = p.id
        option.textContent = p.name
        providerSelect.appendChild(option)
      })
      providerSelect.value = globalThis.providers[0].id
      try {
        await loadAllModels()
        filterModelsByCategory()
      } catch (modelErr) {
        console.error('加载模型列表失败', modelErr)
        const modelSelect = $('model')
        if (modelSelect) {
          modelSelect.innerHTML =
            '<option value="">模型列表加载失败，请刷新页面</option>'
        }
      }
      const applyPreset = globalThis.applyPresetBoundChatModel
      if (typeof applyPreset === 'function') applyPreset(true)
    } else {
      if (raw && raw.error && /unauthorized/i.test(String(raw.error))) {
        _setProviderSelectMessage(
          pack().provider_login_required || '请先登录后刷新页面',
          true
        )
      } else {
        _setProviderSelectMessage(
          pack().provider_none || '暂无供应商，请先在设置中添加',
          false
        )
      }
    }
  } catch (e) {
    console.error('加载供应商失败', e)
    _setProviderSelectMessage(
      (pack().provider_load_failed || '供应商加载失败，点击 🔄 重试') +
        ' — ' +
        (e.message || String(e)),
      true
    )
    if (typeof globalThis.showAppToast === 'function') {
      globalThis.showAppToast(
        pack().provider_load_failed || '供应商加载失败，请刷新页面或重新登录'
      )
    }
  }
}

globalThis.loadProviders = loadProviders

export async function loadAllModels() {
  try {
    const res = await fetch('ai_proxy.php?action=list_models&_=' + Date.now(), {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const data = await res.json()
    globalThis.allModels =
      data.models || (data.success === false ? [] : data.models) || []
    globalThis.imageLorasByProvider =
      data && typeof data.image_loras === 'object' && data.image_loras
        ? data.image_loras
        : {}
    // 合并到 providers，供下拉读取 / Merge into providers for LoRA dropdown
    ;(globalThis.providers || []).forEach((p) => {
      if (!p || !p.id) return
      const list = globalThis.imageLorasByProvider[p.id]
      if (Array.isArray(list)) p.image_loras = list
    })
    refreshImageLoraUi()
  } catch (e) {
    console.error('加载模型失败', e)
    globalThis.allModels = []
    throw e
  }
}

/** 图像分类下刷新 LoRA 下拉；无文件时隐藏 / Refresh LoRA UI for image category */
export function refreshImageLoraUi() {
  const loraRow = $('loraRow')
  const loraSelect = $('imageLora')
  if (!loraRow || !loraSelect) return

  const category = $('category')?.value
  const providerId = $('providerSelect')?.value
  const prev = String(loraSelect.value || '')

  let loras = []
  if (providerId) {
    const fromMap = globalThis.imageLorasByProvider?.[providerId]
    const fromProv = (globalThis.providers || []).find((p) => p.id === providerId)
      ?.image_loras
    loras = Array.isArray(fromMap)
      ? fromMap
      : Array.isArray(fromProv)
        ? fromProv
        : []
  }

  const show = category === 'image' && loras.length > 0
  loraRow.style.display = show ? 'flex' : 'none'
  if (!show) {
    loraSelect.value = ''
    return
  }

  const noneLabel = pack().lora_none || '无 LoRA'
  loraSelect.innerHTML = ''
  const noneOpt = document.createElement('option')
  noneOpt.value = ''
  noneOpt.textContent = noneLabel
  loraSelect.appendChild(noneOpt)

  loras.forEach((L) => {
    const id = typeof L === 'string' ? L : String(L?.id || '')
    if (!id) return
    const opt = document.createElement('option')
    opt.value = id
    // 显示短名（最后一段路径） / Short label from path tail
    const short = id.includes('/') ? id.split('/').pop() : id
    opt.textContent = short || id
    opt.title = id
    loraSelect.appendChild(opt)
  })

  if (prev && [...loraSelect.options].some((o) => o.value === prev)) {
    loraSelect.value = prev
  } else {
    loraSelect.value = ''
  }
}

export function filterModelsByCategory() {
  const category = $('category')?.value
  const providerId = $('providerSelect')?.value
  if (!providerId) return

  const modelSelect = $('model')
  if (!modelSelect) return

  modelSelect.innerHTML = ''

  const filtered = (globalThis.allModels || []).filter((m) => {
    const [pId] = m.value.split('::')
    return pId === providerId && m.type === category
  })

  if (filtered.length > 0) {
    filtered.forEach((m) => {
      const option = document.createElement('option')
      option.value = m.value
      option.textContent = m.label
      modelSelect.appendChild(option)
    })
  } else {
    modelSelect.innerHTML = '<option value="">该类别下无模型</option>'
  }
  refreshImageLoraUi()
}

export function syncImageModeUi() {
  const category = $('category')?.value
  const imageMode = $('imageMode')?.value
  const modeRow = $('modeRow')
  const strengthEl = $('imageStrength')
  if (modeRow) {
    modeRow.style.display = category === 'image' ? 'flex' : 'none'
  }
  if (strengthEl) {
    strengthEl.style.display =
      category === 'image' && imageMode === 'img2img' ? '' : 'none'
  }
  const updateUpload = globalThis.updateUploadAcceptByMode
  if (typeof updateUpload === 'function') updateUpload(category, imageMode)
}

export function onCategoryChange() {
  filterModelsByCategory()
  const applyPreset = globalThis.applyPresetBoundChatModel
  if (typeof applyPreset === 'function') applyPreset()

  const category = $('category')?.value
  syncImageModeUi()
  refreshImageLoraUi()

  const msgInput = $('msg')
  if (msgInput) {
    const p = pack()
    const placeholders = {
      code: p.code_placeholder,
      ocr: p.ocr_placeholder,
      vision: p.vision_placeholder,
      translation: p.translation_placeholder,
    }
    msgInput.placeholder =
      placeholders[category] ||
      p.input_placeholder ||
      '输入提示词... 或将图片拖拽至此 (Enter发送，Ctrl+Enter换行)'
  }
}

export async function onProviderChange() {
  const providerId = $('providerSelect')?.value
  if (!providerId) return
  if (!globalThis.allModels || globalThis.allModels.length === 0)
    await loadAllModels()
  filterModelsByCategory()
  refreshImageLoraUi()
  const applyPreset = globalThis.applyPresetBoundChatModel
  if (typeof applyPreset === 'function') applyPreset()
}

globalThis.refreshImageLoraUi = refreshImageLoraUi
globalThis.syncImageModeUi = syncImageModeUi
