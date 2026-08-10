import {
  conversations,
  currentConvId,
  isReceiving,
  setCurrentConvId,
} from './state.js'
import { $ } from './utils.js'
import { renderMessageBlock } from './message-render.js'
import { renderChatListHtml } from './chat-list-render.js'

const STORAGE_KEY = 'conversations'

function makeConversationTitle(text) {
  const trimmed = (text || '').trim()
  if (!trimmed) return '新对话'
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}...` : trimmed
}

function createConversation(seedTitle = '新对话') {
  return {
    id: `conv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    title: seedTitle,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  }
}

function touchConversation(conv) {
  if (!conv) return
  conv.updatedAt = Date.now()
}

export function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
}

/**
 * 从 localStorage 加载对话列表（与正式版保持同类结构）
 */
export function loadConversations() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        conversations.splice(0, conversations.length, ...parsed)
      }
    } catch {
      // Ignore corrupted local data and fall back to new conversation.
    }
  }

  if (conversations.length === 0) {
    const conv = createConversation()
    conversations.push(conv)
  }

  setCurrentConvId(conversations[0].id)
  saveConversations()
}

export function addNewConversation() {
  const conv = createConversation()
  conversations.unshift(conv)
  setCurrentConvId(conv.id)
  saveConversations()
  renderChatList()
  renderCurrentConversation()
}

export function selectConversation(convId) {
  if (isReceiving) return
  const found = conversations.find((c) => c.id === convId)
  if (!found) return
  setCurrentConvId(convId)
  renderChatList()
  renderCurrentConversation()
}

export function removeConversation(convId) {
  if (isReceiving) return
  const idx = conversations.findIndex((c) => c.id === convId)
  if (idx < 0) return

  conversations.splice(idx, 1)
  if (conversations.length === 0) {
    conversations.push(createConversation())
  }
  if (!conversations.some((c) => c.id === currentConvId)) {
    setCurrentConvId(conversations[0].id)
  }

  saveConversations()
  renderChatList()
  renderCurrentConversation()
}

/**
 * 渲染左侧对话列表（复用现有 .chat-item 样式）
 */
export function renderChatList() {
  const chatListEl = $('#chat-list')
  if (!chatListEl) return

  chatListEl.innerHTML = renderChatListHtml(conversations, currentConvId)
}

/**
 * 渲染当前对话消息
 */
export function renderCurrentConversation() {
  const logEl = $('#log')
  if (!logEl) return

  const currentConv = conversations.find((c) => c.id === currentConvId)
  if (!currentConv) {
    logEl.innerHTML = ''
    return
  }

  logEl.innerHTML = currentConv.messages
    .map((msg) => renderMessageBlock(msg))
    .join('')
  logEl.scrollTop = logEl.scrollHeight
}

/**
 * 向当前对话添加消息
 */
export function addMessageToCurrent(role, content, extra = {}) {
  const currentConv = conversations.find((c) => c.id === currentConvId)
  if (!currentConv) return

  currentConv.messages.push({
    role,
    content,
    ts: Date.now(),
    imageUrl: String(extra.imageUrl || ''),
    imageDataUrl: String(extra.imageDataUrl || ''),
    requestMeta:
      extra.requestMeta && typeof extra.requestMeta === 'object'
        ? { ...extra.requestMeta }
        : null,
  })
  if (role === 'user' && currentConv.messages.length === 1) {
    currentConv.title = makeConversationTitle(content)
    renderChatList()
  }
  touchConversation(currentConv)
  saveConversations()
  renderCurrentConversation()
}

/**
 * 追加到最后一条 assistant 消息（流式打字）
 */
export function appendToLastMessage(chunk) {
  const currentConv = conversations.find((c) => c.id === currentConvId)
  if (!currentConv || currentConv.messages.length === 0) return

  const lastMessage = currentConv.messages[currentConv.messages.length - 1]
  lastMessage.content = `${lastMessage.content || ''}${chunk}`
  touchConversation(currentConv)

  const logEl = $('#log')
  const lastContentEl = logEl?.lastElementChild?.querySelector('.content')
  if (lastContentEl) {
    lastContentEl.textContent = lastMessage.content
    logEl.scrollTop = logEl.scrollHeight
    return
  }

  renderCurrentConversation()
}

export function updateLastAssistantMessage(payload = {}) {
  const currentConv = conversations.find((c) => c.id === currentConvId)
  if (!currentConv || currentConv.messages.length === 0) return

  const lastMessage = currentConv.messages[currentConv.messages.length - 1]
  if ((lastMessage.role || '') !== 'assistant') return

  if (typeof payload.text === 'string') {
    lastMessage.content = payload.text
  }
  if (typeof payload.imageUrl === 'string') {
    lastMessage.imageUrl = payload.imageUrl
  }
  if (typeof payload.imageDataUrl === 'string') {
    lastMessage.imageDataUrl = payload.imageDataUrl
  }
  if (payload.requestMeta && typeof payload.requestMeta === 'object') {
    lastMessage.requestMeta = { ...payload.requestMeta }
  }

  touchConversation(currentConv)
  saveConversations()
  renderCurrentConversation()
}

/**
 * 结束流式传输时持久化
 */
export function finishStreaming() {
  saveConversations()
}
