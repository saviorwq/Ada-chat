/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * Upload, drag-drop and PDF preprocessing（原 adachat-upload.js）
 * Uses globalThis.AdaChatModeConfig (loaded before this script in AI.php)
 */
function $(id) {
  return document.getElementById(id)
}

/** 惰性读取，避免 Vite full 入口在赋值 globalThis.AdaChatModeConfig 之前求值 */
function getModeConfig() {
  return globalThis.AdaChatModeConfig || {}
}
function imageAccept() {
  return getModeConfig().IMAGE_ACCEPT || '.jpg,.jpeg,.png,.webp,.gif'
}
function ocrAccept() {
  return getModeConfig().OCR_ACCEPT || '.jpg,.jpeg,.png,.webp,.gif,.pdf'
}
function musicAudioAccept() {
  return getModeConfig().MUSIC_AUDIO_ACCEPT || '.wav,.mp3,.flac,.ogg,.m4a,.aac,.opus'
}

export function getMusicTaskType() {
  return String($('musicTaskType')?.value || 'text2music').toLowerCase()
}

export function getUploadAcceptByMode(category, imageMode, musicTaskType) {
  const cfg = getModeConfig()
  const musicMode = String(musicTaskType || getMusicTaskType() || '').toLowerCase()
  if (cfg.getUploadAccept) {
    return cfg.getUploadAccept(category, imageMode, musicMode)
  }
  if (category === 'ocr') return ocrAccept()
  if (category === 'vision') return imageAccept()
  if (category === 'translation') return imageAccept()
  if (category === 'image') return imageMode === 'img2img' ? imageAccept() : ''
  if (category === 'music' && musicMode === 'cover') return musicAudioAccept()
  if (category === 'music') return ''
  return imageAccept()
}

export function updateUploadAcceptByMode(category, imageMode, musicTaskType) {
  const fileInput = $('file-input')
  const uploadBtn = document.querySelector('.upload-btn')
  if (!fileInput) return
  const cat = category || $('category')?.value
  const musicMode = String(
    musicTaskType || getMusicTaskType() || ''
  ).toLowerCase()
  const accept = getUploadAcceptByMode(
    cat,
    imageMode || $('imageMode')?.value,
    musicMode
  )
  fileInput.accept = accept
  if (uploadBtn) {
    uploadBtn.disabled = false
    uploadBtn.style.opacity = ''
    if (cat === 'music' && musicMode === 'cover') {
      uploadBtn.title = `Cover 源音频：${accept || '.wav,.mp3'}`
    } else if (cat === 'music') {
      uploadBtn.title = '文生音乐无需上传；请先切换到「Cover 伴奏」再上传 WAV'
    } else {
      uploadBtn.title = accept ? `支持格式: ${accept}` : '当前模式无需上传文件'
    }
  }
}

export function isAudioFile(fileOrMeta) {
  const name = String(fileOrMeta?.name || '').toLowerCase()
  const mime = String(fileOrMeta?.type || '').toLowerCase()
  if (mime.startsWith('audio/')) return true
  return /\.(wav|mp3|flac|ogg|m4a|aac|opus)$/i.test(name)
}

/** Cover 模式：上传源音频到后端 temp，供 ACE src_audio_path */
function csrfHeadersForUpload() {
  const h = {}
  const meta = document.querySelector('meta[name="csrf-token"]')
  if (meta?.content) h['X-CSRF-Token'] = meta.content
  return h
}

export async function uploadMusicCoverSource(file) {
  if (!file || !file.size) {
    throw new Error('音频文件为空')
  }
  const maxHintMb = 256
  if (file.size > maxHintMb * 1024 * 1024) {
    throw new Error(
      `文件过大（${(file.size / 1048576).toFixed(1)}MB）。请压缩为 MP3 或重启 Ada Chat 后再试（上限约 ${maxHintMb}MB）`
    )
  }
  const headers = {
    ...csrfHeadersForUpload(),
    'Content-Type': 'application/octet-stream',
    'X-Filename': encodeURIComponent(file.name || 'source.wav'),
  }
  const res = await fetch('ai_proxy.php?action=music_upload_src', {
    method: 'POST',
    headers,
    body: file,
    credentials: 'same-origin',
    cache: 'no-store',
  })
  let data = {}
  try {
    data = await res.json()
  } catch (e) {
    throw new Error('上传响应解析失败')
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error || `上传失败 (${res.status})`)
  }
  globalThis.musicCoverSourceId = String(data.src_audio_id || '')
  globalThis.musicCoverSourceName = String(data.name || file.name || '')
  globalThis.musicCoverSourceMeta = {
    id: globalThis.musicCoverSourceId,
    name: globalThis.musicCoverSourceName,
    duration_sec: data.duration_sec ?? null,
    size_bytes: data.size_bytes ?? file.size ?? null,
    expires_at: data.expires_at ?? null,
    uploaded_at: new Date().toISOString(),
  }
  try {
    localStorage.setItem(
      'adachat_music_cover_src_meta',
      JSON.stringify(globalThis.musicCoverSourceMeta)
    )
  } catch (e) {
    /* ignore */
  }
  return data
}

export function loadMusicCoverSourceMetaFromStorage() {
  try {
    const raw = localStorage.getItem('adachat_music_cover_src_meta')
    if (!raw) return null
    const meta = JSON.parse(raw)
    if (!meta || !meta.id) return null
    globalThis.musicCoverSourceMeta = meta
    globalThis.musicCoverSourceId = String(meta.id || '')
    globalThis.musicCoverSourceName = String(meta.name || '')
    return meta
  } catch (e) {
    return null
  }
}

function formatDurationSec(sec) {
  const n = Number(sec)
  if (!Number.isFinite(n) || n <= 0) return ''
  const m = Math.floor(n / 60)
  const s = Math.round(n % 60)
  if (m <= 0) return `${s}秒`
  return `${m}分${s}秒`
}

function formatBytes(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`
  return `${Math.round(n / 1024)} KB`
}

function formatExpiresHint(expiresAt, langZh) {
  if (!expiresAt) return ''
  const ts = Date.parse(expiresAt)
  if (!Number.isFinite(ts)) return ''
  const leftMs = ts - Date.now()
  if (leftMs <= 0) return langZh ? '（已过期）' : ' (expired)'
  const leftH = Math.floor(leftMs / 3600000)
  if (leftH >= 24) return langZh ? '（24h 内有效）' : ' (valid 24h)'
  if (leftH >= 1) {
    return langZh ? `（约 ${leftH}h 后过期）` : ` (~${leftH}h left)`
  }
  const leftM = Math.max(1, Math.ceil(leftMs / 60000))
  return langZh ? `（约 ${leftM} 分钟后过期）` : ` (~${leftM}m left)`
}

export function clearMusicCoverSource() {
  globalThis.musicCoverSourceId = ''
  globalThis.musicCoverSourceName = ''
  globalThis.musicCoverSourceMeta = null
  try {
    localStorage.removeItem('adachat_music_cover_src_meta')
  } catch (e) {
    /* ignore */
  }
  const hint = $('musicCoverSrcHint')
  const panel = $('musicCoverSrcPanel')
  const reBtn = $('musicCoverSrcReupload')
  if (hint) {
    hint.classList.remove('music-cover-src-ready', 'music-cover-src-expired')
    hint.removeAttribute('data-src-name')
    const p = globalThis.AdaChatI18n?.[globalThis.currentLanguage || 'zh'] || {}
    hint.textContent =
      p.music_cover_src_hint || '先 📁 上传 Suno 完整 WAV'
  }
  if (panel) panel.classList.remove('music-cover-src-ready', 'music-cover-src-expired')
  if (reBtn) reBtn.style.display = 'none'
}

export function updateMusicCoverSrcHint(name, meta) {
  updateMusicCoverSrcStatus(meta || globalThis.musicCoverSourceMeta || { name })
}

export function updateMusicCoverSrcStatus(meta) {
  const hint = $('musicCoverSrcHint')
  const panel = $('musicCoverSrcPanel')
  const reBtn = $('musicCoverSrcReupload')
  if (!hint) return

  const langZh = (globalThis.currentLanguage || document.documentElement.lang) !== 'en'
  const p = globalThis.AdaChatI18n?.[globalThis.currentLanguage || 'zh'] || {}
  const name = String(meta?.name || meta?.fileName || '').trim()

  if (!name && !meta?.id) {
    clearMusicCoverSource()
    return
  }

  const dur = formatDurationSec(meta?.duration_sec)
  const size = formatBytes(meta?.size_bytes)
  const exp = formatExpiresHint(meta?.expires_at, langZh)
  const expired =
    !!meta?.force_expired ||
    (exp.includes('过期') && !exp.includes('后过期')) ||
    exp.includes('expired')

  const parts = [name]
  if (dur) parts.push(dur)
  if (size) parts.push(size)

  hint.classList.toggle('music-cover-src-ready', !expired)
  hint.classList.toggle('music-cover-src-expired', expired)
  hint.setAttribute('data-src-name', name)
  hint.textContent = expired
    ? (langZh ? `⚠ 源音频已过期：${name}` : `⚠ Source expired: ${name}`)
    : (langZh ? `✓ 源音频：${parts.join(' · ')}${exp}` : `✓ Source: ${parts.join(' · ')}${exp}`)

  if (panel) {
    panel.classList.toggle('music-cover-src-ready', !expired)
    panel.classList.toggle('music-cover-src-expired', expired)
  }
  if (reBtn) {
    reBtn.style.display = expired ? '' : 'none'
  }
}

/**
 * 从会话 requestMeta 恢复音乐工具栏（含 Cover 源音频 id）
 * Restore music toolbar from conversation requestMeta (incl. Cover source id)
 */
export function restoreMusicUiFromRequestMeta(meta) {
  if (!meta || meta.category !== 'music') return
  const setVal = (id, v) => {
    const el = $(id)
    if (el != null && v !== undefined && v !== null && String(v) !== '') {
      el.value = String(v)
    }
  }
  const taskType =
    String(meta.music_task_type || meta.task_type || 'text2music').toLowerCase() ===
    'cover'
      ? 'cover'
      : 'text2music'
  setVal('musicTaskType', taskType)
  if (typeof globalThis.syncMusicTaskTypeUi === 'function') {
    globalThis.syncMusicTaskTypeUi()
  }
  setVal('musicDuration', meta.duration)
  setVal('musicFormat', meta.audio_format)
  setVal('musicCfg', meta.guidance_scale)
  setVal('musicSteps', meta.inference_steps)
  if (meta.bpm !== undefined && meta.bpm !== null && meta.bpm !== '') {
    setVal('musicBpm', meta.bpm)
  }
  setVal('musicInferMethod', meta.infer_method)
  setVal('musicLmTemp', meta.lm_temperature)
  const inst = $('musicInstrumentalOnly')
  if (inst) {
    inst.checked = taskType === 'cover' || !!meta.instrumental_only
  }
  if (taskType === 'cover') {
    setVal('musicCoverStrength', meta.audio_cover_strength ?? '0.78')
    const srcId = String(meta.src_audio_id || '').trim()
    if (srcId) {
      globalThis.musicCoverSourceId = srcId
      globalThis.musicCoverSourceName = String(
        meta.src_audio_name || globalThis.musicCoverSourceName || srcId
      )
      globalThis.musicCoverSourceMeta = {
        id: srcId,
        name: globalThis.musicCoverSourceName,
        duration_sec: meta.src_duration_sec ?? null,
        expires_at: meta.src_expires_at ?? null,
      }
      updateMusicCoverSrcStatus(globalThis.musicCoverSourceMeta)
      void refreshMusicCoverSourceStatus()
    }
  }
}

/** 向后端确认源音频是否仍有效 */
export async function refreshMusicCoverSourceStatus() {
  const id = String(globalThis.musicCoverSourceId || '').trim()
  if (!id) {
    clearMusicCoverSource()
    return { valid: false }
  }
  try {
    const res = await fetch(
      `ai_proxy.php?action=music_src_status&id=${encodeURIComponent(id)}&_=${Date.now()}`,
      { credentials: 'same-origin' }
    )
    const data = await res.json()
    if (!data.success || !data.valid) {
      const prev = globalThis.musicCoverSourceMeta || {}
      // 文件丢失时 expires_at 可能仍在未来；强制标过期，避免绿勾误导
      // Force expired UI when file missing even if expires_at is still in the future
      const staleMeta = {
        ...prev,
        id,
        name: data.name || prev.name || globalThis.musicCoverSourceName,
        expires_at: '1970-01-01T00:00:00Z',
        force_expired: true,
      }
      updateMusicCoverSrcStatus(staleMeta)
      return { valid: false, expired: true, data }
    }
    globalThis.musicCoverSourceMeta = {
      id: data.src_audio_id || id,
      name: data.name || globalThis.musicCoverSourceName,
      duration_sec: data.duration_sec ?? null,
      size_bytes: data.size_bytes ?? null,
      expires_at: data.expires_at ?? null,
      uploaded_at: data.created_at || globalThis.musicCoverSourceMeta?.uploaded_at,
    }
    globalThis.musicCoverSourceName = globalThis.musicCoverSourceMeta.name
    try {
      localStorage.setItem(
        'adachat_music_cover_src_meta',
        JSON.stringify(globalThis.musicCoverSourceMeta)
      )
    } catch (e) {
      /* ignore */
    }
    updateMusicCoverSrcStatus(globalThis.musicCoverSourceMeta)
    return { valid: true, data }
  } catch (e) {
    return { valid: false, error: e?.message || String(e) }
  }
}

export function triggerMusicCoverReupload() {
  const input = $('file-input')
  if (input) {
    input.click()
    return
  }
  document.querySelector('.upload-btn')?.click()
}

globalThis.refreshMusicCoverSourceStatus = refreshMusicCoverSourceStatus
globalThis.restoreMusicUiFromRequestMeta = restoreMusicUiFromRequestMeta
globalThis.triggerMusicCoverReupload = triggerMusicCoverReupload
globalThis.updateMusicCoverSrcStatus = updateMusicCoverSrcStatus

export function isFileAcceptedByMode(file, accept) {
  const raw = String(accept || '').trim()
  if (!raw) return false
  const fileName = String(file.name || '').toLowerCase()
  const mime = String(file.type || '').toLowerCase()
  const rules = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (rules.some((rule) => {
    if (rule.startsWith('.')) return fileName.endsWith(rule)
    if (rule.endsWith('/*')) return mime.startsWith(rule.slice(0, -1))
    return mime === rule
  })) {
    return true
  }
  // Windows 上 WAV 常无 MIME 或为 audio/x-wav；扩展名在 accept 列表里则放行
  const audioExts = ['.wav', '.mp3', '.flac', '.ogg', '.m4a', '.aac', '.opus']
  if (rules.some((r) => audioExts.includes(r)) && isAudioFile(file)) {
    return true
  }
  return false
}

export function isPdfFile(fileOrMeta) {
  const name = String(fileOrMeta?.name || '').toLowerCase()
  const mime = String(fileOrMeta?.type || '').toLowerCase()
  return name.endsWith('.pdf') || mime === 'application/pdf'
}

export async function ensurePdfJsLib() {
  if (globalThis.__pdfjsLibCached) return globalThis.__pdfjsLibCached
  const mod =
    await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs')
  const lib = mod?.default || mod
  if (!lib?.getDocument) {
    throw new Error('pdf.js 初始化失败')
  }
  globalThis.__pdfjsLibCached = lib
  return lib
}

export async function extractTextFromPdf(file) {
  const pdfjsLib = await ensurePdfJsLib()
  if (!pdfjsLib) throw new Error('pdf.js 加载失败')
  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs'
  }
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
  })
  const pdf = await loadingTask.promise
  const pageCount = pdf.numPages || 0
  let textParts = []
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = (textContent.items || [])
      .map((it) => it.str || '')
      .join(' ')
      .trim()
    if (pageText) {
      textParts.push(`--- 第 ${i} 页 ---\n${pageText}`)
    }
  }
  const merged = textParts.join('\n\n').trim()
  return {
    text: merged,
    pageCount,
  }
}

export async function extractPdfPageImages(file, options = {}) {
  const pdfjsLib = await ensurePdfJsLib()
  if (!pdfjsLib) throw new Error('pdf.js 加载失败')
  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs'
  }
  const maxPages = Number(options.maxPages || 5)
  const targetScale = Number(options.scale || 1.3)
  const maxDim = Number(options.maxDimension || 1400)

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
  })
  const pdf = await loadingTask.promise
  const pageCount = pdf.numPages || 0
  const endPage = Math.min(pageCount, maxPages)
  const images = []

  for (let i = 1; i <= endPage; i++) {
    const page = await pdf.getPage(i)
    let viewport = page.getViewport({ scale: targetScale })
    const maxSide = Math.max(viewport.width, viewport.height)
    if (maxSide > maxDim) {
      const ratio = maxDim / maxSide
      viewport = page.getViewport({ scale: Math.max(0.5, targetScale * ratio) })
    }
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    await page.render({ canvasContext: ctx, viewport }).promise
    images.push(canvas.toDataURL('image/jpeg', 0.82))
  }

  return {
    images,
    pageCount,
    renderedPages: endPage,
  }
}

export function initDragAndDrop() {
  const dropZone = $('dropZone')
  if (!dropZone) return
  ;['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, preventDefaults, false)
  })
  function preventDefaults(e) {
    e.preventDefault()
    e.stopPropagation()
  }
  dropZone.addEventListener('drop', handleDrop, false)
}

export function handleDrop(e) {
  const files = e.dataTransfer.files
  if (files.length > 0) {
    const file = files[0]
    const category = $('category')?.value
    const imageMode = $('imageMode')?.value
    const musicMode = getMusicTaskType()
    const accept = getUploadAcceptByMode(category, imageMode, musicMode)
    if (category === 'music' && musicMode !== 'cover') {
      alert('文生音乐无需上传文件。请先切换到「Cover 伴奏」，再上传 Suno 导出的 WAV/MP3。')
      return
    }
    if (!isFileAcceptedByMode(file, accept)) {
      const hint =
        category === 'music' && musicMode === 'cover'
          ? 'Cover 源音频请使用 .wav / .mp3 / .flac 等'
          : `支持：${accept || '无'}`
      alert(`当前模式不支持该文件格式。${hint}`)
      return
    }
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)
    $('file-input').files = dataTransfer.files
    previewAndCompress()
  }
}

export function ensureImageMarkerInInput() {
  const msgInput = $('msg')
  if (!msgInput) return
  const marker = '[图片]'
  if (!msgInput.value.includes(marker)) {
    msgInput.value =
      `${msgInput.value}${msgInput.value ? ' ' : ''}${marker}`.trim()
  }
}

export function removeImageMarkerFromInput() {
  const msgInput = $('msg')
  if (!msgInput) return
  msgInput.value = msgInput.value.replace(/\s*\[图片\]\s*/g, ' ').trim()
}

export function ensureFileMarkerInInput(fileName) {
  const msgInput = $('msg')
  if (!msgInput) return
  const marker = `[文件:${fileName}]`
  msgInput.value = msgInput.value.replace(/\s*\[文件:[^\]]+\]\s*/g, ' ').trim()
  if (!msgInput.value.includes(marker)) {
    msgInput.value =
      `${msgInput.value}${msgInput.value ? ' ' : ''}${marker}`.trim()
  }
}

export function removeFileMarkerFromInput() {
  const msgInput = $('msg')
  if (!msgInput) return
  msgInput.value = msgInput.value.replace(/\s*\[文件:[^\]]+\]\s*/g, ' ').trim()
}

export function previewAndCompress() {
  const file = $('file-input').files[0]
  if (!file) return
  const category = $('category')?.value
  const imageMode = $('imageMode')?.value
  const musicMode = getMusicTaskType()
  const accept = getUploadAcceptByMode(category, imageMode, musicMode)
  if (category === 'music' && musicMode !== 'cover') {
    alert('文生音乐无需上传文件。请先切换到「Cover 伴奏」，再上传 Suno 导出的 WAV/MP3。')
    return
  }
  if (!isFileAcceptedByMode(file, accept)) {
    const hint =
      category === 'music' && musicMode === 'cover'
        ? 'Cover 源音频请使用 .wav / .mp3 / .flac 等'
        : `支持：${accept || '无'}`
    alert(`当前模式不支持该文件格式。${hint}`)
    return
  }

  globalThis.currentUploadMeta = {
    name: file.name,
    type: file.type,
    isImage: file.type.startsWith('image/'),
    isPdf: isPdfFile(file),
    isAudio: isAudioFile(file),
  }

  if (
    category === 'music' &&
    musicMode === 'cover' &&
    isAudioFile(file)
  ) {
    if (typeof globalThis.currentBase64 !== 'undefined') {
      globalThis.currentBase64 = ''
    }
    globalThis.currentPdfText = ''
    globalThis.currentPdfPageImages = []
    globalThis.currentFileText = ''
    removeImageMarkerFromInput()
    ensureFileMarkerInInput(file.name)
    const hint = $('musicCoverSrcHint')
    if (hint) hint.textContent = '正在上传源音频…'
    uploadMusicCoverSource(file)
      .then((data) => {
        updateMusicCoverSrcStatus(globalThis.musicCoverSourceMeta)
        const msg = `Cover 源音频已就绪：${data.name || file.name}`
        if (typeof globalThis.showAppToast === 'function') {
          globalThis.showAppToast(msg, 3200)
        } else {
          alert(msg)
        }
      })
      .catch((e) => {
        clearMusicCoverSource()
        alert(`源音频上传失败：${e.message || e}`)
      })
    return
  }

  if (!file.type.startsWith('image/')) {
    if (typeof globalThis.currentBase64 !== 'undefined') {
      globalThis.currentBase64 = ''
    }
    globalThis.currentPdfPageImages = []
    removeImageMarkerFromInput()
    ensureFileMarkerInInput(file.name)
    if (globalThis.currentUploadMeta.isPdf) {
      globalThis.currentPdfText = ''
      extractTextFromPdf(file)
        .then(({ text, pageCount }) => {
          if (!text) {
            alert(
              `PDF 已选择：${file.name}，但未提取到可识别文本（可能是扫描版）。`
            )
            globalThis.currentPdfText = ''
            return
          }
          globalThis.currentPdfText = text.slice(0, 20000)
          globalThis.currentPdfPageImages = []
          alert(`PDF 已解析：${file.name}（${pageCount} 页，可用于 OCR/翻译）`)
        })
        .catch((e) => {
          globalThis.currentPdfText = ''
          globalThis.currentPdfPageImages = []
          alert(`PDF 解析失败：${e.message || e}`)
        })
    } else {
      // 文本/源码：读入内容供编程/对话注入 / Read text/source for code+chat injection
      globalThis.currentPdfText = ''
      globalThis.currentPdfPageImages = []
      globalThis.currentFileText = ''
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result || '')
        if (!text.trim()) {
          alert(`已选择文件：${file.name}，但内容为空或无法按文本读取。`)
          return
        }
        // 本地小上下文常见 4k~16k；过长文件先截断，避免直接超窗
        // Cap for small local contexts (4k–16k) to avoid immediate overflow
        const maxChars = 48000
        globalThis.currentFileText = text.slice(0, maxChars)
        const truncated = text.length > maxChars
        alert(
          truncated
            ? `已载入文本：${file.name}（已截断至 ${maxChars} 字；本地上下文有限，过大文件请拆分）`
            : `已载入文本：${file.name}（${text.length} 字）`
        )
      }
      reader.onerror = () => {
        globalThis.currentFileText = ''
        alert(`读取文件失败：${file.name}`)
      }
      reader.readAsText(file)
    }
    return
  }
  globalThis.currentPdfText = ''
  globalThis.currentPdfPageImages = []
  globalThis.currentFileText = ''
  removeFileMarkerFromInput()

  const reader = new FileReader()
  reader.onload = function (e) {
    const img = new Image()
    img.src = e.target.result
    img.onload = function () {
      const maxSizeMB = 1
      const maxSizeBytes = maxSizeMB * 1024 * 1024
      let quality = 0.9
      let canvas = document.createElement('canvas')
      let ctx = canvas.getContext('2d')
      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)

      let compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
      while (compressedDataUrl.length > maxSizeBytes * 1.37 && quality > 0.1) {
        quality -= 0.1
        compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
      }
      globalThis.currentBase64 = compressedDataUrl
      ensureImageMarkerInInput()
      console.log(
        '压缩后大小约',
        Math.round(compressedDataUrl.length / 1.37),
        'bytes'
      )
    }
  }
  reader.readAsDataURL(file)
}
