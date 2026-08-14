/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 本地/异步文生图：任务轮询与消息渲染
 * Async local text-to-image job polling
 */

const IMAGE_MARKER = '生成图片：'
const POLL_MS = 2000
const POLL_MAX_MS = 15 * 60 * 1000

export function isImageJobResponse(result) {
  return !!(
    result &&
    result.job_id &&
    result.status &&
    (result.poll_action === 'image_job_status' ||
      String(result.job_id).startsWith('img_'))
  )
}

export async function pollImageJobUntilDone(jobId, convId, hooks = {}) {
  const append = hooks.append || globalThis.appendToLastAIMessage
  const updateMeta = hooks.updateMeta || globalThis.updateLastAssistantRequestMeta
  const started = Date.now()
  let lastStatus = ''

  const statusLabel = (st, mode) => {
    const m = mode === 'local' ? '本地' : '云端'
    if (st === 'queued') return `${m}图片排队中…`
    if (st === 'processing') return `${m}图片生成中…`
    if (st === 'completed') return '图片生成完成'
    if (st === 'failed') return '图片生成失败'
    return st
  }

  let networkFails = 0
  while (Date.now() - started < POLL_MAX_MS) {
    let data = null
    try {
      const res = await fetch(
        `ai_proxy.php?action=image_job_status&id=${encodeURIComponent(jobId)}&_=${Date.now()}`,
        { credentials: 'same-origin' }
      )
      data = await res.json()
      networkFails = 0
    } catch (e) {
      networkFails += 1
      if (networkFails >= 4) {
        if (typeof append === 'function') {
          append(
            `\n错误：图片状态查询连续失败（${e?.message || e}）`,
            convId
          )
        }
        return { ok: false, error: 'poll_network' }
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
      continue
    }
    if (!data.success) {
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
      if (lastStatus) append(`\n${label}`, convId)
      else append(label, convId)
      lastStatus = label
    }
    if (typeof updateMeta === 'function') {
      updateMeta({ imageJobId: jobId, imageStatus: data.status }, convId)
    }

    if (data.status === 'completed' && data.image_url) {
      if (typeof append === 'function') {
        append(`\n${IMAGE_MARKER}${data.image_url}`, convId)
        if (data.hint) {
          append(`\n说明：${data.hint}`, convId)
        } else if (data.face_locked) {
          append('\n说明：已锁脸换景（场景/姿态按提示词，脸来自参考图）。', convId)
        } else if (data.composition_unlocked) {
          append(
            '\n说明：参考图是半身构图，已自动改用文生图换场景/姿态（锁脸未成功时可看上方说明）。',
            convId
          )
        }
      }
      return { ok: true, image_url: data.image_url, job: data }
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
    append('\n错误：图片生成超时，请检查依赖与显存后重试', convId)
  }
  return { ok: false, error: 'timeout' }
}
