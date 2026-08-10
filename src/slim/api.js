import { getCsrfHeaders } from './utils.js'

/**
 * 向后端发送流式请求的通用函数
 * @param {object} body - 发送给后端的请求体
 * @param {object} callbacks - 包含 onChunk, onFinish, onError 的回调对象
 */
export async function streamedRequest(body, callbacks) {
  const onChunk = callbacks?.onChunk
  const onFinish = callbacks?.onFinish
  const onError = callbacks?.onError
  const onResult = callbacks?.onResult

  try {
    const stream = typeof body?.stream === 'boolean' ? body.stream : true
    const response = await fetch('ai_proxy.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: stream ? 'text/event-stream' : 'application/json',
        ...getCsrfHeaders(),
      },
      body: JSON.stringify({
        ...body,
        stream,
      }),
    })

    if (!response.ok) {
      let detail = ''
      try {
        detail = await response.text()
      } catch {
        // Ignore body parse failure.
      }
      throw new Error(
        `HTTP error ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`
      )
    }

    if (!response.body) {
      throw new Error('Empty response body')
    }

    if (!stream) {
      const result = await response.json()
      if (onResult) onResult(result)
      if (onFinish) onFinish()
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let doneSignaled = false

    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        if (!doneSignaled && onFinish) onFinish()
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''

      for (const eventBlock of events) {
        const lines = eventBlock.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data:')) continue

          const data = line.slice(5).trimStart()
          if (!data) continue

          if (data === '[DONE]') {
            doneSignaled = true
            if (onFinish) onFinish()
            return
          }

          try {
            const parsed = JSON.parse(data)
            const content = parsed?.choices?.[0]?.delta?.content || ''
            if (content && onChunk) onChunk(content)
          } catch {
            // Some providers may emit non-JSON event lines, ignore safely.
          }
        }
      }
    }
  } catch (error) {
    if (onError) onError(error)
  }
}
