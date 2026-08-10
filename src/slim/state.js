/**
 * 应用的状态管理模块
 */

// 存储所有对话的数组
export let conversations = []

// 当前选中的对话 ID
export let currentConvId = null

// 当前是否正在接收流式响应
export let isReceiving = false

// 更新对话列表
export function setConversations(newConversations) {
  conversations = newConversations
}

// 设置当前对话 ID
export function setCurrentConvId(id) {
  currentConvId = id
}

// 设置接收状态
export function setReceiving(status) {
  isReceiving = status
}
