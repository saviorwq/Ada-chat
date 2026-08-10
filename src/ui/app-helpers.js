/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 全局轻量工具：Toast、剪贴板、请求摘要（从 script.js 迁出）
 * Lightweight globals: toast, clipboard, request summary — migrated from script.js
 */
export { escapeHtml } from '@/shared/escape-html.js'

function $(id) {
  return document.getElementById(id)
}

export async function copyTextToClipboard(text) {
  const plain = String(text || '').trim()
  if (!plain) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(plain)
      return true
    }
    const ta = document.createElement('textarea')
    ta.value = plain
    ta.setAttribute('readonly', 'readonly')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch {
    return false
  }
}

export function summarizeRequestBody(body) {
  let hasImage = false
  if (Array.isArray(body.messages)) {
    hasImage = body.messages.some(
      (m) =>
        Array.isArray(m.content) &&
        m.content.some((c) => c && c.type === 'image_url')
    )
  }
  if (body.image) hasImage = true
  return {
    model: body.model,
    task: body.task,
    stream: !!body.stream,
    prompt_length: (body.prompt || '').length,
    message_count: Array.isArray(body.messages) ? body.messages.length : 0,
    has_image: hasImage,
  }
}

export function showAppToast(message, durationMs = 2200) {
  const text = String(message || '').trim()
  if (!text) return
  let container = $('adachatToastContainer')
  if (!container) {
    container = document.createElement('div')
    container.id = 'adachatToastContainer'
    container.className = 'adachat-toast-container'
    document.body.appendChild(container)
  }
  const toast = document.createElement('div')
  toast.className = 'adachat-toast'
  toast.textContent = text
  container.appendChild(toast)
  requestAnimationFrame(() => toast.classList.add('show'))
  setTimeout(
    () => {
      toast.classList.remove('show')
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast)
      }, 220)
    },
    Math.max(1200, durationMs)
  )
}
