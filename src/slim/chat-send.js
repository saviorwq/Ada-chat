/**
 * 发送消息与流式回调（精简版）
 * Send pipeline & streaming callbacks for slim UI
 */
import {
  addMessageToCurrent,
  appendToLastMessage,
  finishStreaming,
  updateLastAssistantMessage,
} from './chat.js'
import {
  conversations,
  currentConvId,
  isReceiving,
  setReceiving,
} from './state.js'
import { getSamplingSettings, getSelectedModel } from './settings.js'
import { resolveRequestRoute } from './routing.js'
import {
  saveLastRouteHit,
  showRouteHitToast,
  updateRouteIndicators,
} from './ui-route-panel.js'
import {
  buildRequestBody,
  createRequestMeta,
  executeSendRuntime,
} from './chat-runtime.js'

/** @type {null | { getCurrentImageDataUrl?: () => string, buildMessagesForApi?: Function, clearImageInput?: () => void }} */
let composerController = null

export function registerComposerController(ctrl) {
  composerController = ctrl
}

export async function handleSend() {
  if (isReceiving) return
  const msgInput = document.querySelector('#msg')
  if (!msgInput) return
  const text = String(msgInput.value || '').trim()
  if (!text) return

  const selectedModel = getSelectedModel() || 'gpt-3.5-turbo'
  const sampling = getSamplingSettings()
  const pendingImageDataUrl =
    composerController?.getCurrentImageDataUrl?.() || ''
  const route = resolveRequestRoute({
    text,
    fallbackModel: selectedModel,
    hasImage: Boolean(pendingImageDataUrl),
  })
  const requestMeta = createRequestMeta(route)

  addMessageToCurrent('user', text, {
    imageDataUrl: pendingImageDataUrl,
    requestMeta,
  })
  msgInput.value = ''

  setReceiving(true)
  addMessageToCurrent('assistant', '', { requestMeta })

  const currentConv = conversations.find((c) => c.id === currentConvId)
  const messagesForApi = composerController?.buildMessagesForApi
    ? composerController.buildMessagesForApi(currentConv)
    : currentConv.messages
        .slice(0, -1)
        .map((m) => ({ role: m.role, content: m.content }))
  if (route.routed) saveLastRouteHit(route)
  updateRouteIndicators(route)

  const requestBody = buildRequestBody({
    route,
    text,
    pendingImageDataUrl,
    messagesForApi,
    sampling,
  })

  if (route.routed) {
    showRouteHitToast(route)
  }

  await executeSendRuntime({
    requestBody,
    requestMeta,
    onChunk: (chunk) => {
      appendToLastMessage(chunk)
    },
    onParsedResult: (payload) => {
      updateLastAssistantMessage(payload)
    },
    onFinish: () => {
      finishStreaming()
      setReceiving(false)
    },
    onError: (error) => {
      appendToLastMessage(`\n[错误] ${error.message}`)
      finishStreaming()
      setReceiving(false)
    },
  })
  composerController?.clearImageInput?.()
}
