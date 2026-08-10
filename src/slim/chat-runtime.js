import { streamedRequest } from './api.js'
import { extractAssistantPayloadFromJson } from './routing.js'

export function createRequestMeta(route) {
  return {
    task: route?.task || 'chat',
    mode: route?.mode || '',
    model: route?.model || '',
    routed: Boolean(route?.routed),
  }
}

export function buildRequestBody({
  route,
  text,
  pendingImageDataUrl,
  messagesForApi,
  sampling,
}) {
  if (route?.task === 'image') {
    return {
      task: 'image',
      mode: route?.mode || 'text2img',
      model: route?.model || '',
      prompt: text,
      image: route?.mode === 'img2img' ? pendingImageDataUrl : '',
      stream: false,
    }
  }

  return {
    task: 'chat',
    model: route?.model || '',
    messages: messagesForApi,
    ...sampling,
  }
}

export async function executeSendRuntime({
  requestBody,
  requestMeta,
  onChunk,
  onParsedResult,
  onFinish,
  onError,
}) {
  await streamedRequest(requestBody, {
    onChunk: (chunk) => {
      if (typeof onChunk === 'function') onChunk(chunk)
    },
    onResult: (json) => {
      const parsed = extractAssistantPayloadFromJson(json)
      if (typeof onParsedResult === 'function') {
        onParsedResult({
          ...parsed,
          requestMeta,
        })
      }
    },
    onFinish: () => {
      if (typeof onFinish === 'function') onFinish()
    },
    onError: (error) => {
      if (typeof onError === 'function') onError(error)
    },
  })
}
