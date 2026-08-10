/**
 * 左侧会话列表 HTML
 * Sidebar conversation list markup
 */
import { escapeHtml } from '@/shared/escape-html.js'

export function renderChatListHtml(conversations, currentConvId) {
  return conversations
    .map(
      (conv) => `
    <div class="chat-item ${conv.id === currentConvId ? 'active' : ''}" data-id="${escapeHtml(conv.id)}">
      <span class="chat-title">${escapeHtml(conv.title || '新对话')}</span>
      <button class="delete-chat" type="button" data-delete-id="${escapeHtml(conv.id)}" title="删除对话">×</button>
    </div>
  `
    )
    .join('')
}
