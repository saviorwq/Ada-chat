/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 对话列表与消息状态（从 script.js 迁出）
 * Conversation list, current id, streaming flag — migrated from script.js
 *
 * 依赖 globalThis.buildMessageRow / renderMessageContentTo（chat-render 须先于本模块加载）
 * Depends on globalThis.buildMessageRow / renderMessageContentTo (chat-render before this)
 */
function $(id) {
  return document.getElementById(id)
}

let _conversations = []
let _currentConvId = null
let _isReceiving = false

/**
 * 与 chat-render / 插件约定：通过 globalThis 读写，避免陈旧引用
 * Contract with chat-render/plugins: read/write via globalThis to avoid stale refs
 */
function installConversationsGlobals() {
  if (typeof globalThis === 'undefined') return
  try {
    Object.defineProperty(globalThis, 'conversations', {
      configurable: true,
      enumerable: true,
      get() {
        return _conversations
      },
      set(v) {
        _conversations = v
      },
    })
    Object.defineProperty(globalThis, 'currentConvId', {
      configurable: true,
      enumerable: true,
      get() {
        return _currentConvId
      },
      set(v) {
        _currentConvId = v
      },
    })
    Object.defineProperty(globalThis, 'isReceiving', {
      configurable: true,
      enumerable: true,
      get() {
        return _isReceiving
      },
      set(v) {
        _isReceiving = !!v
      },
    })
  } catch {
    // 重复安装时可能已定义
  }
}

installConversationsGlobals()

export function loadConversations() {
  const saved = localStorage.getItem('conversations')
  _conversations = saved
    ? JSON.parse(saved)
    : [
        {
          id: Date.now().toString(),
          title: '新对话',
          messages: [],
        },
      ]
  if (_conversations.length === 0) {
    _conversations.push({
      id: Date.now().toString(),
      title: '新对话',
      messages: [],
    })
  }
  _currentConvId = _conversations[0].id
  renderChatList()
  renderCurrentConversation()
}

/** 去掉超大 data URL，避免撑爆 localStorage / Strip huge data URLs before persist */
function _stripHeavyMediaForStorage(conversations) {
  const placeholder = '[image omitted for storage]'
  const stripText = (text) => {
    if (typeof text !== 'string') return text
    return text.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g, placeholder)
  }
  return (conversations || []).map((conv) => {
    if (!conv || typeof conv !== 'object') return conv
    const messages = Array.isArray(conv.messages)
      ? conv.messages.map((msg) => {
          if (!msg || typeof msg !== 'object') return msg
          const next = { ...msg }
          if (typeof next.content === 'string') {
            next.content = stripText(next.content)
          } else if (Array.isArray(next.content)) {
            next.content = next.content.map((part) => {
              if (!part || typeof part !== 'object') return part
              if (
                part.type === 'image_url' &&
                part.image_url &&
                typeof part.image_url.url === 'string' &&
                part.image_url.url.startsWith('data:image/')
              ) {
                return {
                  type: 'text',
                  text: placeholder,
                }
              }
              if (typeof part.text === 'string') {
                return { ...part, text: stripText(part.text) }
              }
              return part
            })
          }
          if (
            typeof next.image === 'string' &&
            next.image.startsWith('data:image/')
          ) {
            delete next.image
          }
          return next
        })
      : conv.messages
    return { ...conv, messages }
  })
}

export function saveConversations() {
  const raw = JSON.stringify(_conversations)
  try {
    localStorage.setItem('conversations', raw)
    return
  } catch (e) {
    const msg = String(e?.message || e || '')
    const isQuota =
      e?.name === 'QuotaExceededError' ||
      /quota/i.test(msg) ||
      e?.code === 22 ||
      e?.code === 1014
    if (!isQuota) throw e
  }

  // 配额满：瘦身后重试 / Quota full — slim payloads and retry
  try {
    const slim = _stripHeavyMediaForStorage(_conversations)
    localStorage.setItem('conversations', JSON.stringify(slim))
    _conversations = slim
    if (typeof globalThis.showAppToast === 'function') {
      globalThis.showAppToast(
        '浏览器本地存储已满：已自动精简对话中的大图缓存，发送可继续',
        4200
      )
    }
  } catch (e2) {
    throw new Error(
      '浏览器本地存储已满（不是模型额度）。请新建对话，或删除侧边栏里带大量图片的旧会话后再试。'
    )
  }
}

export function moveConversationToTop(convId) {
  const idx = _conversations.findIndex((c) => c.id === convId)
  if (idx <= 0) return
  const [conv] = _conversations.splice(idx, 1)
  _conversations.unshift(conv)
}

export function newChat() {
  if (_isReceiving) {
    alert('请等待当前响应完成')
    return
  }
  const newId = Date.now().toString()
  _conversations.unshift({
    id: newId,
    title: '新对话',
    messages: [],
    // 首条消息发送时冻结角色运行时快照 / Freeze persona runtime on first send
    personaRuntime: null,
  })
  _currentConvId = newId
  saveConversations()
  renderChatList()
  renderCurrentConversation()
}

/**
 * 确保会话有角色运行时快照（首条消息冻结，之后不跟活角色卡漂移）
 * Ensure conversation has persona runtime snapshot (freeze on first send)
 */
export function ensureConversationPersonaSnapshot(convId = _currentConvId) {
  const conv = _conversations.find((c) => c.id === convId)
  if (!conv) return null
  if (conv.personaRuntime && typeof conv.personaRuntime === 'object') {
    return conv.personaRuntime
  }
  const snap =
    typeof globalThis.capturePersonaRuntimeSnapshot === 'function'
      ? globalThis.capturePersonaRuntimeSnapshot()
      : null
  if (snap) {
    conv.personaRuntime = snap
    saveConversations()
  }
  return conv.personaRuntime || null
}

export function getConversationPersonaSnapshot(convId = _currentConvId) {
  const conv = _conversations.find((c) => c.id === convId)
  return conv?.personaRuntime || null
}

export function deleteChat(e, id) {
  e.stopPropagation()
  if (_isReceiving) {
    alert('请等待当前响应完成')
    return
  }
  if (!confirm('确定删除此对话？')) return
  _conversations = _conversations.filter((c) => c.id !== id)
  if (_conversations.length === 0) {
    newChat()
  } else {
    if (_currentConvId === id) {
      _currentConvId = _conversations[0].id
    }
    saveConversations()
    renderChatList()
    renderCurrentConversation()
  }
}

export function switchChat(id) {
  if (_isReceiving) {
    alert('请等待当前响应完成')
    return
  }
  _currentConvId = id
  moveConversationToTop(id)
  saveConversations()
  renderChatList()
  renderCurrentConversation()
}

export function renderChatList() {
  const listEl = $('chatList')
  if (!listEl) return
  listEl.innerHTML = ''
  _conversations.forEach((conv) => {
    const item = document.createElement('div')
    item.className = `chat-item ${conv.id === _currentConvId ? 'active' : ''}`
    item.onclick = () => switchChat(conv.id)
    const titleSpan = document.createElement('span')
    titleSpan.className = 'chat-title'
    titleSpan.textContent = conv.title
    const delBtn = document.createElement('button')
    delBtn.className = 'delete-chat'
    delBtn.innerHTML = '✕'
    delBtn.onclick = (e) => deleteChat(e, conv.id)
    item.appendChild(titleSpan)
    item.appendChild(delBtn)
    listEl.appendChild(item)
  })
}

export function updateConversationTitle(convId, userMsg) {
  const conv = _conversations.find((c) => c.id === convId)
  if (conv && conv.title === '新对话' && userMsg) {
    conv.title = userMsg.substring(0, 10) + (userMsg.length > 10 ? '...' : '')
    saveConversations()
    renderChatList()
  }
}

export function renderCurrentConversation() {
  const logEl = $('log')
  if (!logEl) return
  logEl.innerHTML = ''
  const conv = _conversations.find((c) => c.id === _currentConvId)
  if (!conv) return
  const buildMessageRow = globalThis.buildMessageRow
  if (typeof buildMessageRow !== 'function') return
  conv.messages.forEach((msg, index) => {
    const built = buildMessageRow(msg, {
      convId: _currentConvId,
      msgIndex: index,
    })
    logEl.appendChild(built.row)
  })
  logEl.scrollTop = logEl.scrollHeight
}

export function addMessageToCurrent(
  role,
  content,
  convId = _currentConvId,
  extra = {}
) {
  const conv = _conversations.find((c) => c.id === convId)
  if (!conv) return
  conv.messages.push({ role, content, ...extra })
  moveConversationToTop(convId)
  if (role === 'user') {
    updateConversationTitle(convId, content)
  }
  saveConversations()
  renderChatList()
  if (convId === _currentConvId) {
    renderCurrentConversation()
  }
}

export function updateLastAssistantRequestMeta(
  convId = _currentConvId,
  partial = {}
) {
  const conv = _conversations.find((c) => c.id === convId)
  if (!conv || !Array.isArray(conv.messages) || conv.messages.length === 0)
    return
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const msg = conv.messages[i]
    if (msg && msg.role === 'assistant') {
      msg.requestMeta = { ...(msg.requestMeta || {}), ...(partial || {}) }
      return
    }
  }
}

/** 将 RAG 引用挂到最近一条助手消息 / Attach RAG citations to last assistant msg */
export function attachRagCitationsToLastAssistant(convId, citations) {
  const conv = _conversations.find((c) => c.id === convId)
  if (!conv || !Array.isArray(conv.messages) || !conv.messages.length) return
  // 铁律：无有效命中绝不挂「参考来源」/ Never fabricate citations
  const list = Array.isArray(citations)
    ? citations
        .filter(
          (c) =>
            c &&
            String(c.docName || '').trim() &&
            String(c.preview || '').trim()
        )
        .slice(0, 8)
        .map((c) => ({
          docName: String(c.docName || ''),
          chunkIndex: Number.isFinite(c.chunkIndex) ? c.chunkIndex : 0,
          preview: String(c.preview || '').slice(0, 240),
          score: typeof c.score === 'number' ? c.score : undefined,
        }))
    : []
  if (!list.length) return
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const msg = conv.messages[i]
    if (msg && msg.role === 'assistant') {
      msg.ragCitations = list
      saveConversations()
      return
    }
  }
}

function ensureLastAssistantMessage(conv, content = '') {
  if (
    conv.messages.length === 0 ||
    conv.messages[conv.messages.length - 1].role !== 'assistant'
  ) {
    conv.messages.push({ role: 'assistant', content })
  }
  return conv.messages[conv.messages.length - 1]
}

function touchLastAssistantDom(convId, conv, chunkForMediaHint = '') {
  if (convId !== _currentConvId) {
    saveConversations()
    return
  }

  const logEl = $('log')
  const buildMessageRow = globalThis.buildMessageRow
  const renderMessageContentTo = globalThis.renderMessageContentTo
  if (!logEl || typeof buildMessageRow !== 'function') return

  let lastAiRow = logEl.querySelector('.msg-row.ai-row:last-child')
  let lastAiDiv
  let lastContentEl
  if (!lastAiRow) {
    const built = buildMessageRow(
      { role: 'assistant', content: '' },
      { convId, msgIndex: conv.messages.length - 1 }
    )
    lastAiRow = built.row
    lastAiDiv = built.bubble
    lastContentEl = built.contentEl
    logEl.appendChild(lastAiRow)
  } else {
    lastAiDiv = lastAiRow.querySelector('.ai')
    lastContentEl = lastAiRow.querySelector('.msg-content')
  }

  if (!lastAiDiv || !lastContentEl) return

  lastAiDiv.classList.add('streaming')
  const fullMsg = conv.messages[conv.messages.length - 1]
  const hint = String(chunkForMediaHint || '')
  const hasRichExtras =
    !!fullMsg.reasoning ||
    (Array.isArray(fullMsg.ragCitations) && fullMsg.ragCitations.length > 0)
  if (
    (hint.includes('生成图片：') || hint.includes('生成视频：')) &&
    typeof renderMessageContentTo === 'function'
  ) {
    renderMessageContentTo(lastContentEl, fullMsg)
  } else if (typeof renderMessageContentTo === 'function' && hasRichExtras) {
    // 思考过程 / RAG 引用：走完整渲染，避免 textContent 抹掉附属块
    // Reasoning / RAG citations need full render (textContent would wipe them)
    renderMessageContentTo(lastContentEl, fullMsg)
  } else {
    lastContentEl.textContent = String(fullMsg.content || '')
  }
  logEl.scrollTop = logEl.scrollHeight
}

export function appendToLastAIMessage(chunk, convId = _currentConvId) {
  const conv = _conversations.find((c) => c.id === convId)
  if (!conv) return
  const msg = ensureLastAssistantMessage(conv, '')
  msg.content = String(msg.content || '') + String(chunk || '')
  touchLastAssistantDom(convId, conv, chunk)
}

/** 覆盖最后一条助手正文（用于去掉「思考中…」占位） / Replace last assistant body */
export function setLastAIMessageContent(text, convId = _currentConvId) {
  const conv = _conversations.find((c) => c.id === convId)
  if (!conv) return
  const msg = ensureLastAssistantMessage(conv, '')
  msg.content = String(text || '')
  touchLastAssistantDom(convId, conv, msg.content)
}

/** 写入思考过程（与正文分离） / Store reasoning separately from answer body */
export function setLastAIMessageReasoning(text, convId = _currentConvId) {
  const conv = _conversations.find((c) => c.id === convId)
  if (!conv) return
  const last = conv.messages[conv.messages.length - 1]
  const seed =
    last && last.role === 'assistant' ? String(last.content || '') : ''
  const msg = ensureLastAssistantMessage(conv, seed)
  const reasoning = String(text || '').trim()
  if (reasoning) msg.reasoning = reasoning
  else delete msg.reasoning
  touchLastAssistantDom(convId, conv, '')
}

export function finishAIMessage(convId = _currentConvId) {
  const conv = _conversations.find((c) => c.id === convId)
  if (conv) {
    saveConversations()
  }
  if (convId === _currentConvId) {
    const lastAiDiv = $('log')?.querySelector('.ai:last-child')
    if (lastAiDiv) {
      lastAiDiv.classList.remove('streaming')
    }
    renderCurrentConversation()
  }
  _isReceiving = false
  const sendBtn = $('sendBtn')
  if (sendBtn) sendBtn.disabled = false
}
