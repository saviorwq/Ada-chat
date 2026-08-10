/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 输入框回车发送 + 供应商预设填充（从 script.js 迁出）
 * Textarea Enter-to-send + provider form presets — migrated from script.js
 *
 * 依赖 globalThis.send（chat-send-pipeline）、globalThis.showAddProvider（provider-models）
 */
function $(id) {
  return document.getElementById(id)
}

export function handleTextareaKeydown(e) {
  if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault()
    if (typeof globalThis.send === 'function') globalThis.send()
  }
}

export function presetProvider(type) {
  if (typeof globalThis.showAddProvider === 'function')
    globalThis.showAddProvider()
  let name = ''
  let baseUrl = ''
  const modelsPath = '/models'
  const chatPath = '/chat/completions'
  const imageGenPath = '/images/generations'
  const imageEditPath = '/images/edits'
  const videoPath = '/videos/generations'
  switch (type) {
    case 'silicon':
      name = '硅基流动'
      baseUrl = 'https://api.siliconflow.cn/v1'
      break
    case 'glm':
      name = '智谱 GLM'
      baseUrl = 'https://open.bigmodel.cn/api/paas/v4'
      break
    case 'ali':
      name = '阿里通义'
      baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
      break
    case 'deepseek':
      name = 'Deepseek'
      baseUrl = 'https://api.deepseek.com/v1'
      break
    case 'baidu':
      name = '百度千帆'
      baseUrl = 'https://qianfan.baidubce.com/v2'
      break
    case 'volcano':
      name = '火山方舟'
      baseUrl = 'https://ark.cn-beijing.volces.com/api/v3'
      break
    default:
      return
  }
  if ($('provName')) $('provName').value = name
  if ($('provBaseUrl')) $('provBaseUrl').value = baseUrl
  if ($('provModelsPath')) $('provModelsPath').value = modelsPath
  if ($('provChatPath')) $('provChatPath').value = chatPath
  if ($('provImageGenPath')) $('provImageGenPath').value = imageGenPath
  if ($('provImageEditPath')) $('provImageEditPath').value = imageEditPath
  if ($('provVideoPath')) $('provVideoPath').value = videoPath
}
