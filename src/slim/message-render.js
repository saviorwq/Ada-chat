/**
 * 单条消息的 HTML 片段（与正式版消息块结构对齐）
 * Message bubble HTML fragment (aligned with main app message structure)
 */
import { escapeHtml } from '@/shared/escape-html.js'

export { escapeHtml }

export function renderMessageBlock(msg) {
  const role = escapeHtml(msg.role || 'assistant')
  const text = escapeHtml(msg.content || '')
  const imageUrl = typeof msg.imageUrl === 'string' ? msg.imageUrl.trim() : ''
  const imageDataUrl =
    typeof msg.imageDataUrl === 'string' ? msg.imageDataUrl.trim() : ''
  const safeImageSrc = escapeHtml(imageUrl || imageDataUrl)
  const hasImage = Boolean(safeImageSrc)
  const imagePart = hasImage
    ? `
      <div class="message-image">
        <img src="${safeImageSrc}" alt="generated image" loading="lazy" referrerpolicy="no-referrer" />
        ${imageUrl ? `<a class="message-image-link" href="${escapeHtml(imageUrl)}" target="_blank" rel="noopener noreferrer">打开原图</a>` : ''}
      </div>
    `
    : ''

  const rawMeta =
    msg?.requestMeta && typeof msg.requestMeta === 'object'
      ? msg.requestMeta
      : null
  const task = rawMeta?.task ? String(rawMeta.task).trim() : ''
  const mode = rawMeta?.mode ? String(rawMeta.mode).trim() : ''
  const modelRaw = rawMeta?.model ? String(rawMeta.model).trim() : ''
  const modelName = modelRaw.includes('::') ? modelRaw.split('::')[1] : modelRaw
  const providerId = modelRaw.includes('::') ? modelRaw.split('::')[0] : ''
  const routeTag = rawMeta?.routed ? 'auto-route' : ''
  const metaParts = [
    task,
    mode,
    modelName || modelRaw,
    providerId,
    routeTag,
  ].filter(Boolean)
  const metaPart = metaParts.length
    ? `<div class="msg-meta-line">${escapeHtml(metaParts.join(' · '))}</div>`
    : ''

  return `
    <div class="message ${role}">
      <div class="content">${text}</div>
      ${imagePart}
      ${metaPart}
    </div>
  `
}
