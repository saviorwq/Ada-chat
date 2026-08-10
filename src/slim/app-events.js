/**
 * 精简版事件绑定
 * Event wiring for slim UI
 */
import { $ } from './utils.js'
import {
  addNewConversation,
  removeConversation,
  selectConversation,
} from './chat.js'
import { handleSend } from './chat-send.js'

export function bindConversationEvents() {
  const newChatBtn = $('#newChatBtn')
  const chatList = $('#chat-list')
  if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
      addNewConversation()
      $('#msg')?.focus()
    })
  }

  if (chatList) {
    chatList.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete-id]')
      if (deleteBtn) {
        e.stopPropagation()
        const id = deleteBtn.getAttribute('data-delete-id')
        if (id) removeConversation(id)
        return
      }

      const item = e.target.closest('[data-id]')
      if (!item) return
      const id = item.getAttribute('data-id')
      if (id) selectConversation(id)
    })
  }
}

export function bindSendAndComposerKeys() {
  $('#sendBtn')?.addEventListener('click', handleSend)
  $('#msg')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  })
}
