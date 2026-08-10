/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 文生视频：异步任务轮询与消息渲染
 * Text-to-video async job polling and message rendering
 */

const VIDEO_MARKER = '生成视频：'
const POLL_MS = 2500
const POLL_MAX_MS = 12 * 60 * 1000

function getLang() {
  return typeof globalThis.currentLanguage === 'string'
    ? globalThis.currentLanguage
    : 'zh'
}

function pack() {
  const i18n = globalThis.AdaChatI18n || globalThis.i18n || { zh: {}, en: {} }
  return i18n[getLang()] || i18n.en || {}
}

export function isVideoJobResponse(result) {
  return !!(result && result.job_id && result.status)
}

export async function pollVideoJobUntilDone(jobId, convId, hooks = {}) {
  const append = hooks.append || globalThis.appendToLastAIMessage
  const updateMeta = hooks.updateMeta || globalThis.updateLastAssistantRequestMeta
  const started = Date.now()
  let lastStatus = ''

  const statusLabel = (st, mode) => {
    const m = mode === 'local' ? '本地' : '云端'
    if (st === 'queued') return `${m}视频排队中…`
    if (st === 'processing') return `${m}视频生成中…`
    if (st === 'completed') return '视频生成完成'
    if (st === 'failed') return '视频生成失败'
    return st
  }

  let networkFails = 0
  while (Date.now() - started < POLL_MAX_MS) {
    let data = null
    try {
      const res = await fetch(
        `ai_proxy.php?action=video_job_status&id=${encodeURIComponent(jobId)}&_=${Date.now()}`,
        { credentials: 'same-origin' }
      )
      data = await res.json()
      networkFails = 0
    } catch (e) {
      networkFails += 1
      if (networkFails >= 4) {
        if (typeof append === 'function') {
          append(
            `\n错误：视频状态查询连续失败（${e?.message || e}）`,
            convId
          )
        }
        return { ok: false, error: 'poll_network' }
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
      continue
    }
    if (!data.success) {
      // 短暂后端抖动：再试几次，不立刻放弃任务
      networkFails += 1
      if (networkFails >= 4) {
        if (typeof append === 'function') {
          append(`\n错误：${data.error || '任务查询失败'}`, convId)
        }
        return { ok: false, error: data.error }
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
      continue
    }

    const label = statusLabel(data.status, data.mode)
    if (label !== lastStatus && typeof append === 'function') {
      if (lastStatus) {
        append(`\n${label}`, convId)
      } else {
        append(label, convId)
      }
      lastStatus = label
    }
    if (typeof updateMeta === 'function') {
      updateMeta({ videoJobId: jobId, videoStatus: data.status }, convId)
    }

    if (data.status === 'completed' && data.video_url) {
      if (typeof append === 'function') {
        append(`\n${VIDEO_MARKER}${data.video_url}`, convId)
      }
      return { ok: true, video_url: data.video_url, job: data }
    }
    if (data.status === 'failed' || data.stale) {
      if (typeof append === 'function') {
        append(`\n错误：${data.error || data.message || '失败'}`, convId)
      }
      return { ok: false, error: data.error || 'stale' }
    }

    await new Promise((r) => setTimeout(r, POLL_MS))
  }

  if (typeof append === 'function') {
    append('\n错误：视频生成超时，请稍后在任务中重试', convId)
  }
  return { ok: false, error: 'timeout' }
}

export function attachVideoToMessage(msg, url) {
  if (!msg || !url) return
  msg.videoUrl = url
  if (!String(msg.content || '').includes(VIDEO_MARKER)) {
    msg.content = `${String(msg.content || '').trim()}\n${VIDEO_MARKER}${url}`.trim()
  }
}
