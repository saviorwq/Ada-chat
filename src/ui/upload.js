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

export function getUploadAcceptByMode(category, imageMode) {
  const cfg = getModeConfig()
  if (cfg.getUploadAccept) {
    return cfg.getUploadAccept(category, imageMode)
  }
  if (category === 'ocr') return ocrAccept()
  if (category === 'vision') return imageAccept()
  if (category === 'translation') return imageAccept()
  if (category === 'image') return imageMode === 'img2img' ? imageAccept() : ''
  return imageAccept()
}

export function updateUploadAcceptByMode(category, imageMode) {
  const fileInput = $('file-input')
  const uploadBtn = document.querySelector('.upload-btn')
  if (!fileInput) return
  const accept = getUploadAcceptByMode(
    category || $('category')?.value,
    imageMode || $('imageMode')?.value
  )
  fileInput.accept = accept
  if (uploadBtn) {
    uploadBtn.title = accept ? `支持格式: ${accept}` : '当前模式无需上传文件'
  }
}

export function isFileAcceptedByMode(file, accept) {
  if (!accept || !file) return false
  const fileName = String(file.name || '').toLowerCase()
  const mime = String(file.type || '').toLowerCase()
  return accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .some((rule) => {
      if (!rule) return false
      if (rule.startsWith('.')) return fileName.endsWith(rule)
      if (rule.endsWith('/*')) return mime.startsWith(rule.slice(0, -1))
      return mime === rule
    })
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
    const accept = getUploadAcceptByMode(category, imageMode)
    if (!isFileAcceptedByMode(file, accept)) {
      alert(`当前模式不支持该文件格式。支持：${accept || '无'}`)
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
  const accept = getUploadAcceptByMode(category, imageMode)
  if (!isFileAcceptedByMode(file, accept)) {
    alert(`当前模式不支持该文件格式。支持：${accept || '无'}`)
    return
  }

  globalThis.currentUploadMeta = {
    name: file.name,
    type: file.type,
    isImage: file.type.startsWith('image/'),
    isPdf: isPdfFile(file),
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
