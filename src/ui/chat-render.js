/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * Chat render and message action helpers（原 adachat-chat-render.js）
 * Uses globalThis for script.js state (conversations, send, i18n, …)
 */
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

export function extractPrimaryHighlights(content) {
  const text = String(content || '').trim()
  if (!text) return []

  const lines = text.split(/\r?\n/)
  const normalizeLine = (line) =>
    String(line || '')
      .replace(/\*\*/g, '')
      .replace(/^[-*]\s+/, '')
      .trim()
  const isSeparator = (line) => /^[-_]{3,}$/.test(line.replace(/\s/g, ''))
  const isPromptHeading = (line) =>
    /^(?:优化后的|最终|推荐|建议)?\s*(提示词[（(]?(?:英文|中文|en|cn)?[）)]?|图片描述|画面描述|描述|prompt|image prompt)\s*[:：]?$/i.test(
      normalizeLine(line)
    )
  const isGenericHeading = (line) =>
    /^[\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9\s]{0,20}\s*[:：]$/.test(
      normalizeLine(line)
    )
  const highlights = []
  const seen = new Set()

  // Prefer paragraphs after prompt-like headings; allow multiple sections (e.g. English + Chinese).
  for (let i = 0; i < lines.length; i++) {
    if (!isPromptHeading(lines[i])) continue
    const picked = []
    let started = false
    for (let j = i + 1; j < lines.length; j++) {
      const raw = lines[j]
      const line = normalizeLine(raw)
      if (!line) {
        if (started) break
        continue
      }
      if (isSeparator(raw) || (started && isGenericHeading(raw))) break
      started = true
      picked.push(String(raw || '').trim())
      if (picked.join(' ').length >= 1200) break
    }
    const excerpt = picked.join('\n').trim()
    if (excerpt.length >= 24) {
      const key = excerpt.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        highlights.push(excerpt)
      }
    }
  }
  if (highlights.length) return highlights.slice(0, 3)

  // Fallback: choose the longest meaningful paragraph.
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => String(p || '').trim())
    .filter(
      (p) => p && p.length >= 24 && !isPromptHeading(p) && !isSeparator(p)
    )
  if (!paragraphs.length) return []
  paragraphs.sort((a, b) => b.length - a.length)
  return [paragraphs[0]]
}

/**
 * 从正文中剥出 &lt;think&gt; 块（返回正文 + 思考）
 * Split &lt;think&gt; blocks out of assistant text
 */
export function splitAssistantThinkBlocks(raw) {
  let text = String(raw || '')
  const parts = []
  text = text.replace(/<think\b[^>]*>([\s\S]*?)<\/think>/gi, (_, inner) => {
    const t = String(inner || '').trim()
    if (t) parts.push(t)
    return ''
  })
  text = text.replace(/<think\b[^>]*>([\s\S]*)$/gi, (_, inner) => {
    const t = String(inner || '').trim()
    if (t) parts.push(t)
    return ''
  })
  text = text.replace(/<\/?think\b[^>]*>/gi, '')
  return {
    content: text.trim(),
    reasoning: parts.join('\n\n').trim(),
  }
}

export function getAssistantVisibleContent(raw) {
  let text = String(raw || '')
  const isGameModeActive =
    document.body.classList.contains('game-mode-active') ||
    document.body.classList.contains('cyoa-game-mode')
  if (isGameModeActive) {
    return text.trim()
  }
  // Hide reasoning traces from thinking models.
  return splitAssistantThinkBlocks(text).content
}

function buildAssistantReasoningBlock(reasoning, opts = {}) {
  const text = String(reasoning || '').trim()
  if (!text) return null
  const details = document.createElement('details')
  details.className = 'assistant-reasoning'
  if (opts.open) details.open = true
  const summary = document.createElement('summary')
  summary.className = 'assistant-reasoning__summary'
  summary.textContent =
    getLang() === 'zh' ? '思考过程' : 'Thinking'
  const body = document.createElement('div')
  body.className = 'assistant-reasoning__body'
  body.textContent = text
  details.appendChild(summary)
  details.appendChild(body)
  return details
}

export function isRenderableImageSource(value) {
  const s = String(value || '').trim()
  if (!s) return false
  if (/^data:image\//i.test(s)) return true
  if (/^https?:\/\//i.test(s)) return true
  // 本地异步文生图：ai_proxy.php?action=image_file&id=...
  if (/^ai_proxy\.php\?action=image_file/i.test(s)) return true
  if (/\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(s)) return true
  if (/^\/[^/]/.test(s)) return true
  return false
}

export function isRenderableVideoSource(value) {
  const s = String(value || '').trim()
  if (!s) return false
  if (/^https?:\/\//i.test(s)) return true
  if (/^ai_proxy\.php\?action=video_file/i.test(s)) return true
  if (/^\/[^/]/.test(s)) return true
  return false
}

export function ensureImagePreviewModal() {
  let modal = document.getElementById('adachatImagePreviewModal')
  if (modal) return modal

  modal = document.createElement('div')
  modal.id = 'adachatImagePreviewModal'
  modal.className = 'adachat-image-preview-modal'
  modal.innerHTML = `
        <div class="adachat-image-preview-toolbar">
            <button type="button" class="adachat-image-preview-close" id="adachatImagePreviewClose">✕</button>
            <div class="adachat-image-preview-actions">
                <button type="button" class="adachat-image-preview-btn" id="adachatImagePreviewPrev">上一张</button>
                <button type="button" class="adachat-image-preview-btn" id="adachatImagePreviewNext">下一张</button>
                <button type="button" class="adachat-image-preview-btn" id="adachatImagePreviewSave">保存</button>
                <button type="button" class="adachat-image-preview-btn" id="adachatImagePreviewShare">分享</button>
            </div>
        </div>
        <div class="adachat-image-preview-stage">
            <img id="adachatImagePreviewImg" alt="Preview">
        </div>
    `
  document.body.appendChild(modal)

  const close = () => {
    modal.classList.remove('show')
  }
  const closeBtn = modal.querySelector('#adachatImagePreviewClose')
  if (closeBtn) closeBtn.addEventListener('click', close)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close()
  })
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('show')) return
    if (e.key === 'Escape') {
      close()
      return
    }
    if (e.key === 'ArrowLeft') {
      switchImagePreviewByDelta(-1)
      return
    }
    if (e.key === 'ArrowRight') {
      switchImagePreviewByDelta(1)
    }
  })

  const saveBtn = modal.querySelector('#adachatImagePreviewSave')
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const img = modal.querySelector('#adachatImagePreviewImg')
      const src = String(img?.getAttribute('src') || '').trim()
      if (!src) return
      const a = document.createElement('a')
      a.href = src
      a.download = `adachat-image-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
    })
  }

  const shareBtn = modal.querySelector('#adachatImagePreviewShare')
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const img = modal.querySelector('#adachatImagePreviewImg')
      const src = String(img?.getAttribute('src') || '').trim()
      if (!src) return
      try {
        if (navigator.share && /^https?:\/\//i.test(src)) {
          await navigator.share({ title: 'Ada Chat Image', url: src })
          return
        }
      } catch {
        /* ignore share cancel / errors */
      }

      let ok = false
      if (typeof globalThis.copyTextToClipboard === 'function') {
        ok = await globalThis.copyTextToClipboard(src)
      } else if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(src)
          ok = true
        } catch {
          /* ignore */
        }
      }
      if (typeof globalThis.showAppToast === 'function') {
        globalThis.showAppToast(
          ok
            ? getLang() === 'zh'
              ? '图片链接已复制'
              : 'Image link copied'
            : getLang() === 'zh'
              ? '分享失败'
              : 'Share failed',
          ok ? 1300 : 1800
        )
      }
    })
  }

  const prevBtn = modal.querySelector('#adachatImagePreviewPrev')
  if (prevBtn)
    prevBtn.addEventListener('click', () => switchImagePreviewByDelta(-1))
  const nextBtn = modal.querySelector('#adachatImagePreviewNext')
  if (nextBtn)
    nextBtn.addEventListener('click', () => switchImagePreviewByDelta(1))
  return modal
}

export function collectImageGalleryFromCurrentConversation() {
  const conv = Array.isArray(globalThis.conversations)
    ? globalThis.conversations.find(
        (c) => c && c.id === globalThis.currentConvId
      )
    : null
  if (!conv || !Array.isArray(conv.messages)) return []
  const marker = '生成图片：'
  const items = []
  conv.messages.forEach((m) => {
    if (!m || m.role !== 'assistant') return
    const txt = String(m.content || '')
    const idx = txt.indexOf(marker)
    if (idx < 0) return
    const payload = String(txt.slice(idx + marker.length) || '').trim()
    if (isRenderableImageSource(payload)) items.push(payload)
  })
  return items
}

export function updateImagePreviewModalImage(modal, src) {
  const img = modal.querySelector('#adachatImagePreviewImg')
  if (img) img.setAttribute('src', String(src || '').trim())
  const gallery = Array.isArray(modal.__gallery) ? modal.__gallery : []
  const prevBtn = modal.querySelector('#adachatImagePreviewPrev')
  const nextBtn = modal.querySelector('#adachatImagePreviewNext')
  const canSwitch = gallery.length > 1
  if (prevBtn) prevBtn.disabled = !canSwitch
  if (nextBtn) nextBtn.disabled = !canSwitch
}

export function switchImagePreviewByDelta(delta) {
  const modal = ensureImagePreviewModal()
  const gallery = Array.isArray(modal.__gallery) ? modal.__gallery : []
  if (!gallery.length) return
  let idx = Number.isInteger(modal.__galleryIndex) ? modal.__galleryIndex : 0
  idx = (idx + delta + gallery.length) % gallery.length
  modal.__galleryIndex = idx
  updateImagePreviewModalImage(modal, gallery[idx])
}

export function openImagePreviewModal(src) {
  const imageSrc = String(src || '').trim()
  if (!imageSrc) return
  const modal = ensureImagePreviewModal()
  const gallery = collectImageGalleryFromCurrentConversation()
  const hitIndex = gallery.indexOf(imageSrc)
  modal.__gallery = gallery.length ? gallery : [imageSrc]
  modal.__galleryIndex = hitIndex >= 0 ? hitIndex : 0
  updateImagePreviewModalImage(modal, modal.__gallery[modal.__galleryIndex])
  modal.classList.add('show')
}

export function buildRequestMetaLine(msg) {
  const meta = msg?.requestMeta || {}
  const modelRaw = String(meta.model || '').trim()
  if (!modelRaw) return null
  const parts = modelRaw.split('::')
  const providerId = (
    parts.length > 1 ? parts[0] : String(meta.provider || '')
  ).trim()
  const modelId = (
    parts.length > 1 ? parts.slice(1).join('::') : modelRaw
  ).trim()
  if (!modelId) return null

  let providerName = providerId
  if (providerId && Array.isArray(globalThis.providers)) {
    const p = globalThis.providers.find((x) => x && x.id === providerId)
    if (p && p.name) providerName = p.name
  }

  const line = document.createElement('div')
  line.className = 'msg-meta-line'
  const modelLabel = pack()?.meta_model_label || '模型'
  const providerLabel = pack()?.meta_provider_label || '供应商'
  line.textContent = providerName
    ? `${modelLabel}: ${modelId} · ${providerLabel}: ${providerName}`
    : `${modelLabel}: ${modelId}`
  return line
}

export function renderAssistantContentInline(contentEl, visibleContent) {
  const text = String(visibleContent || '')
  const container = document.createElement('div')
  container.className = 'assistant-structured'

  const copyLabel = pack().key_highlights_copy || 'Copy'
  const copiedLabel = pack().key_highlights_copied || 'Copied'
  const failedLabel = pack().key_highlights_copy_failed || 'Copy failed'
  const copySuccessToast = pack().msg_action_copied || copiedLabel

  const bindCopyFeedback = (btn, valueToCopy) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true
      const ok = await globalThis.copyTextToClipboard(valueToCopy)
      btn.textContent = ok ? copiedLabel : failedLabel
      if (typeof globalThis.showAppToast === 'function') {
        globalThis.showAppToast(
          ok ? copySuccessToast : failedLabel,
          ok ? 1200 : 1800
        )
      }
      setTimeout(() => {
        btn.textContent = copyLabel
        btn.disabled = false
      }, 1200)
    })
  }

  const normalizeHeadingText = (s) =>
    String(s || '')
      .replace(/\*\*/g, '')
      .trim()
  const isSeparatorSection = (s) =>
    /^[-_]{3,}$/.test(String(s || '').replace(/\s/g, ''))
  const isPromptHeadingSection = (s) =>
    /^(?:优化后的|最终|推荐|建议)?\s*(提示词[（(]?(?:英文|中文|en|cn)?[）)]?|图片描述|画面描述|描述|prompt|image prompt)\s*[:：]?$/i.test(
      normalizeHeadingText(s)
    )
  const isShortHeadingSection = (s) => {
    const t = normalizeHeadingText(s)
    return t.length > 0 && t.length <= 40 && /[:：]$/.test(t)
  }
  const isLikelyCardSection = (s) => {
    const t = String(s || '').trim()
    if (!t) return false
    const lines = t.split(/\r?\n/).length
    if (/^\[[^\]]+\]/m.test(t)) return true
    if (lines >= 3 && /^(?:\d+[.)、]|[-*])\s+/m.test(t)) return true
    if (lines >= 4 && t.length >= 120) return true
    return t.length >= 300
  }

  const sections = text
    .split(/\n{2,}/)
    .map((s) => String(s || '').trim())
    .filter(Boolean)

  if (!sections.length) {
    const p = document.createElement('div')
    p.className = 'assistant-paragraph'
    p.textContent = text
    container.appendChild(p)
    contentEl.appendChild(container)
    return
  }

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]
    if (isSeparatorSection(sec)) {
      const divider = document.createElement('div')
      divider.className = 'assistant-section-divider'
      container.appendChild(divider)
      continue
    }

    if (isPromptHeadingSection(sec)) {
      const heading = document.createElement('div')
      heading.className = 'assistant-section-heading'
      heading.textContent = normalizeHeadingText(sec)
      container.appendChild(heading)

      const next = sections[i + 1]
      if (next && !isSeparatorSection(next)) {
        const card = document.createElement('div')
        card.className = 'assistant-section-card highlight'

        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'key-copy-btn block-copy-btn'
        btn.textContent = copyLabel
        bindCopyFeedback(btn, next)
        card.appendChild(btn)

        const body = document.createElement('div')
        body.className = 'assistant-section-card-text'
        body.textContent = next
        card.appendChild(body)
        container.appendChild(card)
        i += 1
      }
      continue
    }

    if (isShortHeadingSection(sec)) {
      const heading = document.createElement('div')
      heading.className = 'assistant-section-heading'
      heading.textContent = normalizeHeadingText(sec)
      container.appendChild(heading)
      continue
    }

    if (isLikelyCardSection(sec)) {
      const card = document.createElement('div')
      card.className = 'assistant-section-card'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'key-copy-btn block-copy-btn'
      btn.textContent = copyLabel
      bindCopyFeedback(btn, sec)
      card.appendChild(btn)
      const body = document.createElement('div')
      body.className = 'assistant-section-card-text'
      body.textContent = sec
      card.appendChild(body)
      container.appendChild(card)
      continue
    }

    const p = document.createElement('div')
    p.className = 'assistant-paragraph'
    p.textContent = sec
    container.appendChild(p)
  }
  contentEl.appendChild(container)
}

export function extractClickableOptions(content) {
  const text = String(content || '')
  if (!text.trim()) return []
  const options = []
  const lines = text.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const m = line.match(/^(\d{1,2})[.)、]\s+(.+)$/)
    if (!m) continue
    const idx = Number(m[1])
    if (!Number.isFinite(idx)) continue
    const label = m[2].trim().replace(/^[-*]\s+/, '')
    if (!label) continue
    options.push({ idx, label })
  }
  if (options.length < 2) return []
  options.sort((a, b) => a.idx - b.idx)
  for (let i = 0; i < options.length; i++) {
    if (options[i].idx !== i + 1) return []
  }
  return options.slice(0, 9)
}

export function buildAssistantChoicesBlock(content) {
  const choices = extractClickableOptions(content)
  if (!choices.length) return null

  const box = document.createElement('div')
  box.className = 'choice-option-box'

  const title = document.createElement('div')
  title.className = 'choice-option-title'
  title.textContent = '点击选项继续'
  box.appendChild(title)

  choices.forEach((c) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'choice-option-btn'
    btn.textContent = `${c.idx}. ${c.label}`
    btn.addEventListener('click', async () => {
      if (globalThis.isReceiving) return
      const msgInput = $('msg')
      if (!msgInput) return
      msgInput.value = c.label
      msgInput.style.height = 'auto'
      msgInput.focus()
      await globalThis.send()
    })
    box.appendChild(btn)
  })

  return box
}

export function getUserTextForRegenerate(userContent) {
  const stripped = String(userContent || '').replace(
    /^\[(文生图|图生图|编程|文字识别|图像理解|翻译)\]\s*/i,
    ''
  )
  return globalThis.normalizeUserInputText(stripped)
}

export async function restartFromUserMessage(
  convId,
  userIdx,
  editedText = null
) {
  if (globalThis.isReceiving) return
  const conv = globalThis.conversations.find((c) => c.id === convId)
  if (!conv) return
  const userMsg = conv.messages[userIdx]
  if (!userMsg || userMsg.role !== 'user') return

  const meta = userMsg?.requestMeta || {}
  const isImageTask = meta.category === 'image'
  const isTextToImage = isImageTask && meta.imageMode === 'text2img'
  if (userMsg?.image && !isTextToImage) {
    alert(
      pack().msg_action_regen_unsupported ||
        'Regenerate for image-based messages is not supported yet.'
    )
    return
  }

  const inputText = globalThis.normalizeUserInputText(
    editedText == null
      ? getUserTextForRegenerate(userMsg?.content || '')
      : editedText
  )
  if (!inputText) return

  if (meta.category && $('category')) $('category').value = meta.category
  if (meta.provider && $('providerSelect'))
    $('providerSelect').value = meta.provider
  if (meta.imageMode && $('imageMode')) $('imageMode').value = meta.imageMode
  if (meta.model && $('model')) $('model').value = meta.model
  globalThis.onCategoryChange()

  conv.messages = conv.messages.slice(0, userIdx)
  globalThis.saveConversations()
  globalThis.currentConvId = convId
  globalThis.renderChatList()
  globalThis.renderCurrentConversation()

  const msgInput = $('msg')
  if (msgInput) {
    msgInput.value = inputText
    msgInput.style.height = 'auto'
  }
  if (typeof globalThis.removePreview === 'function') globalThis.removePreview()
  globalThis.currentBase64 = ''
  globalThis.currentUploadMeta = null
  globalThis.currentPdfText = ''
  globalThis.currentFileText = ''
  globalThis.currentPdfPageImages = []
  await globalThis.send()
}

export function buildAssistantActionBar(msg, ctx = {}) {
  if (msg?.role !== 'assistant') return null
  const actionBar = document.createElement('div')
  actionBar.className = 'msg-actions'

  const regenBtn = document.createElement('button')
  regenBtn.type = 'button'
  regenBtn.className = 'msg-action-btn'
  regenBtn.title = pack().msg_action_regen || 'Regenerate'
  regenBtn.setAttribute('aria-label', regenBtn.title)
  regenBtn.textContent = '🔄'
  regenBtn.addEventListener('click', async () => {
    if (globalThis.isReceiving) return
    const convId = ctx.convId || globalThis.currentConvId
    const conv = globalThis.conversations.find((c) => c.id === convId)
    if (!conv) return
    const assistantIdx = Number.isInteger(ctx.msgIndex)
      ? ctx.msgIndex
      : conv.messages.length - 1
    let userIdx = -1
    for (let i = assistantIdx - 1; i >= 0; i--) {
      if (conv.messages[i]?.role === 'user') {
        userIdx = i
        break
      }
    }
    if (userIdx < 0) return
    const userMsg = conv.messages[userIdx]
    const meta = userMsg?.requestMeta || {}
    const isImageTask = meta.category === 'image'
    const isTextToImage = isImageTask && meta.imageMode === 'text2img'
    if (userMsg?.image && !isTextToImage) {
      alert(
        pack().msg_action_regen_unsupported ||
          'Regenerate for image-based messages is not supported yet.'
      )
      return
    }
    const inputText = getUserTextForRegenerate(userMsg?.content || '')
    if (!inputText) return

    if (meta.category && $('category')) $('category').value = meta.category
    if (meta.provider && $('providerSelect'))
      $('providerSelect').value = meta.provider
    if (meta.imageMode && $('imageMode')) $('imageMode').value = meta.imageMode
    if (meta.model && $('model')) $('model').value = meta.model
    globalThis.onCategoryChange()

    conv.messages = conv.messages.slice(0, userIdx)
    globalThis.saveConversations()
    globalThis.currentConvId = convId
    globalThis.renderChatList()
    globalThis.renderCurrentConversation()

    const msgInput = $('msg')
    if (msgInput) {
      msgInput.value = inputText
      msgInput.style.height = 'auto'
    }
    if (typeof globalThis.removePreview === 'function')
      globalThis.removePreview()
    globalThis.currentBase64 = ''
    globalThis.currentUploadMeta = null
    globalThis.currentPdfText = ''
    globalThis.currentFileText = ''
    globalThis.currentPdfPageImages = []
    await globalThis.send()
  })

  actionBar.appendChild(regenBtn)
  return actionBar
}

export function buildUserActionBar(msg, ctx = {}) {
  if (msg?.role !== 'user') return null
  const actionBar = document.createElement('div')
  actionBar.className = 'msg-actions'

  const copyBtn = document.createElement('button')
  copyBtn.type = 'button'
  copyBtn.className = 'msg-action-btn'
  copyBtn.title = pack().msg_action_copy || 'Copy message'
  copyBtn.setAttribute('aria-label', copyBtn.title)
  copyBtn.textContent = '📋'
  copyBtn.addEventListener('click', async () => {
    copyBtn.disabled = true
    const ok = await globalThis.copyTextToClipboard(msg?.content || '')
    copyBtn.textContent = ok ? '✅' : '⚠️'
    setTimeout(() => {
      copyBtn.textContent = '📋'
      copyBtn.disabled = false
    }, 1200)
  })

  const editBtn = document.createElement('button')
  editBtn.type = 'button'
  editBtn.className = 'msg-action-btn'
  editBtn.title = '放入输入框编辑并重开分支'
  editBtn.setAttribute('aria-label', editBtn.title)
  editBtn.textContent = '✏️'
  editBtn.addEventListener('click', () => {
    if (globalThis.isReceiving) return
    const convId = ctx.convId || globalThis.currentConvId
    const conv = globalThis.conversations.find((c) => c.id === convId)
    if (!conv) return
    const userIdx = Number.isInteger(ctx.msgIndex) ? ctx.msgIndex : -1
    if (userIdx < 0) return
    const source = getUserTextForRegenerate(msg?.content || '')
    const meta = msg?.requestMeta || conv.messages[userIdx]?.requestMeta || {}
    if (meta.category && $('category')) $('category').value = meta.category
    if (meta.provider && $('providerSelect'))
      $('providerSelect').value = meta.provider
    if (meta.imageMode && $('imageMode')) $('imageMode').value = meta.imageMode
    if (meta.model && $('model')) $('model').value = meta.model
    globalThis.onCategoryChange()

    const msgInput = $('msg')
    if (!msgInput) return
    msgInput.value = source
    msgInput.style.height = 'auto'
    msgInput.focus()
    const len = msgInput.value.length
    try {
      msgInput.setSelectionRange(len, len)
    } catch {
      /* ignore selection errors */
    }

    globalThis.pendingUserEditRestart = { convId, userIdx }
  })

  actionBar.appendChild(editBtn)
  actionBar.appendChild(copyBtn)
  return actionBar
}

export function buildMessageRow(msg, ctx = {}) {
  const roleKey = msg.role === 'user' ? 'user' : 'assistant'
  const profile = globalThis.getRoleProfile(roleKey)
  const row = document.createElement('div')
  row.className = `msg-row ${roleKey === 'user' ? 'user-row' : 'ai-row'}`

  const avatar = document.createElement('div')
  avatar.className = 'msg-avatar'
  if (globalThis.isValidAvatarUrl(profile.avatar)) {
    avatar.style.backgroundImage = `url("${profile.avatar}")`
    avatar.textContent = ''
  } else {
    avatar.textContent = roleKey === 'user' ? '🙂' : '🤖'
  }

  const wrap = document.createElement('div')
  wrap.className = 'msg-bubble-wrap'

  const name = document.createElement('div')
  name.className = 'msg-name'
  name.textContent = profile.name || (roleKey === 'user' ? 'You' : 'Assistant')

  const bubble = document.createElement('div')
  bubble.className = roleKey === 'user' ? 'user' : 'ai'

  const contentEl = document.createElement('div')
  contentEl.className = 'msg-content'
  renderMessageContentTo(contentEl, msg)
  bubble.appendChild(contentEl)

  wrap.appendChild(name)
  wrap.appendChild(bubble)
  const userActions = buildUserActionBar(msg, ctx)
  if (userActions) wrap.appendChild(userActions)
  const actions = buildAssistantActionBar(msg, ctx)
  if (actions) wrap.appendChild(actions)
  row.appendChild(avatar)
  row.appendChild(wrap)

  return { row, bubble, contentEl }
}

export function renderMessageContentTo(contentEl, msg) {
  contentEl.innerHTML = ''
  const content = msg?.content || ''
  const userImage = msg?.role === 'user' && msg?.image
  const videoMarker = '生成视频：'
  const videoMarkerIdx =
    msg?.role === 'assistant' && typeof content === 'string'
      ? content.indexOf(videoMarker)
      : -1
  const imageMarker = '生成图片：'
  const imageMarkerIdx =
    msg?.role === 'assistant' && typeof content === 'string' && videoMarkerIdx < 0
      ? content.indexOf(imageMarker)
      : -1

  if (videoMarkerIdx >= 0) {
    const prefix = String(content.slice(0, videoMarkerIdx) || '').trim()
    const payload = String(
      content.slice(videoMarkerIdx + videoMarker.length) || msg?.videoUrl || ''
    ).trim()
    if (prefix) {
      renderAssistantContentInline(
        contentEl,
        getAssistantVisibleContent(prefix)
      )
    }
    if (isRenderableVideoSource(payload)) {
      const video = document.createElement('video')
      video.src = payload
      video.controls = true
      video.playsInline = true
      video.className = 'adachat-result-video'
      video.style.maxWidth = '100%'
      video.style.maxHeight = '480px'
      video.style.border = '1px solid #6366f1'
      video.style.borderRadius = '12px'
      contentEl.appendChild(video)
    } else if (payload) {
      const txt = document.createElement('div')
      txt.className = 'assistant-paragraph'
      txt.textContent = payload
      contentEl.appendChild(txt)
    }
  } else if (imageMarkerIdx >= 0) {
    const prefix = String(content.slice(0, imageMarkerIdx) || '').trim()
    const payload = String(
      content.slice(imageMarkerIdx + imageMarker.length) || ''
    ).trim()
    if (prefix) {
      renderAssistantContentInline(
        contentEl,
        getAssistantVisibleContent(prefix)
      )
    }
    if (isRenderableImageSource(payload)) {
      const img = document.createElement('img')
      img.src = payload
      img.className = 'adachat-result-image'
      img.style.maxWidth = '100%'
      img.style.maxHeight = '400px'
      img.style.border = '1px solid #10b981'
      img.style.borderRadius = '12px'
      img.addEventListener('click', () => openImagePreviewModal(payload))
      contentEl.appendChild(img)
    } else {
      // Fallback: backend returned prompt/plain text, not an actual image URL.
      const txt = document.createElement('div')
      txt.className = 'assistant-paragraph'
      txt.textContent = payload
      contentEl.appendChild(txt)
    }
  } else if (userImage) {
    const cleanText = String(content)
      .replace(/\[图片\]/g, '')
      .trim()
    if (cleanText) {
      const textDiv = document.createElement('div')
      textDiv.textContent = cleanText
      textDiv.style.marginBottom = '8px'
      contentEl.appendChild(textDiv)
    }
    const img = document.createElement('img')
    img.src = msg.image
    img.style.maxWidth = '100%'
    img.style.maxHeight = '320px'
    img.style.border = '1px solid #10b981'
    img.style.borderRadius = '12px'
    contentEl.appendChild(img)
  } else {
    if (msg?.role === 'assistant') {
      const split = splitAssistantThinkBlocks(content)
      const reasoningText = String(msg.reasoning || split.reasoning || '').trim()
      const visibleContent = String(
        msg.reasoning ? getAssistantVisibleContent(content) : split.content
      )
      const isGameModeActive =
        document.body.classList.contains('game-mode-active') ||
        document.body.classList.contains('cyoa-game-mode')
      if (!isGameModeActive) {
        const missingBody =
          typeof globalThis.isMissingAssistantBodyPlaceholder === 'function'
            ? globalThis.isMissingAssistantBodyPlaceholder(visibleContent)
            : /模型未返回正文|No final answer text/i.test(
                String(visibleContent || '')
              )
        const reasoningBlock = buildAssistantReasoningBlock(reasoningText, {
          open: missingBody,
        })
        if (reasoningBlock) contentEl.appendChild(reasoningBlock)
      }
      renderAssistantContentInline(contentEl, visibleContent)
      if (!isGameModeActive) {
        const choiceBlock = buildAssistantChoicesBlock(visibleContent)
        if (choiceBlock) contentEl.appendChild(choiceBlock)
      }
    } else {
      contentEl.textContent = content || ''
    }
  }
  if (msg?.role === 'assistant') {
    const cites = buildRagCitationsBlock(msg)
    if (cites) contentEl.appendChild(cites)
    const metaLine = buildRequestMetaLine(msg)
    if (metaLine) contentEl.appendChild(metaLine)
  }
}

/**
 * 回答旁的 RAG 引用条（可展开片段）
 * RAG citation strip beside the answer (expandable snippets)
 */
export function buildRagCitationsBlock(msg) {
  const list = Array.isArray(msg?.ragCitations) ? msg.ragCitations : []
  if (!list.length) return null
  const zh = getLang() === 'zh'
  const wrap = document.createElement('details')
  wrap.className = 'rag-citations'
  const summary = document.createElement('summary')
  summary.className = 'rag-citations__summary'
  summary.textContent = zh
    ? `📚 参考来源（${list.length}）`
    : `📚 Sources (${list.length})`
  wrap.appendChild(summary)
  const ul = document.createElement('div')
  ul.className = 'rag-citations__list'
  list.forEach((c, i) => {
    const item = document.createElement('details')
    item.className = 'rag-citation-item'
    const s = document.createElement('summary')
    const title = `${c.docName || 'doc'}#${(c.chunkIndex || 0) + 1}`
    s.textContent = `${i + 1}. ${title}`
    item.appendChild(s)
    const preview = document.createElement('div')
    preview.className = 'rag-citation-item__preview'
    preview.textContent = c.preview || (zh ? '（无预览）' : '(no preview)')
    item.appendChild(preview)
    ul.appendChild(item)
  })
  wrap.appendChild(ul)
  return wrap
}
