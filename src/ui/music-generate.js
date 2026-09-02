/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 文生音乐：异步任务轮询与消息渲染（ACE-Step）
 * Text-to-music async job polling (ACE-Step)
 */

const MUSIC_MARKER = '生成音乐：'
const POLL_MS = 3000
// 与后端 XPU 长推理对齐（首次加载 + Phase2 可能 >25min）
const POLL_MAX_MS = 55 * 60 * 1000

function getLang() {
  return typeof globalThis.currentLanguage === 'string'
    ? globalThis.currentLanguage
    : 'zh'
}

function pack() {
  const i18n = globalThis.AdaChatI18n || globalThis.i18n || { zh: {}, en: {} }
  return i18n[getLang()] || i18n.en || {}
}

/** 将 hint 归类为加载 / 排队 / 生成 / 解码，避免英文乱刷 */
function classifyMusicPhase(hint) {
  const h = String(hint || '').toLowerCase()
  const raw = String(hint || '')
  if (/加载|load|init|模型/.test(raw) || /load|init/.test(h)) return 'loading'
  if (/排队|queue/.test(h) || /排队/.test(raw)) return 'queued'
  if (/解码|decod|vae/.test(h) || /解码/.test(raw)) return 'decoding'
  if (/生成|generat|phase|diffusion|旋律|cot|infer/.test(h) || /生成|旋律/.test(raw))
    return 'generating'
  return 'processing'
}

export function isMusicJobResponse(result) {
  return !!(result && result.job_id && result.status)
}

export async function pollMusicJobUntilDone(jobId, convId, hooks = {}) {
  const append = hooks.append || globalThis.appendToLastAIMessage
  const updateMeta = hooks.updateMeta || globalThis.updateLastAssistantRequestMeta
  const started = Date.now()
  let lastStatus = ''

  const statusLabel = (st, hint, progress, jobMeta = {}) => {
    const pct =
      typeof progress === 'number' && progress > 0 ? ` ${progress}%` : ''
    const p = pack()
    const isCover =
      jobMeta.task_type === 'cover' || jobMeta.task_type === 'cover-nofsq'
    const etaMin = jobMeta.eta_minutes
    const srcDur = jobMeta.src_duration_sec
    const coverEtaLine =
      isCover && etaMin
        ? (p.music_cover_progress_eta || '按源曲时长生成中，约 {min} 分钟')
            .replace('{min}', String(etaMin))
            .replace(
              '{sec}',
              srcDur ? String(Math.round(srcDur)) : '?'
            )
        : ''
    if (st === 'queued') {
      const base = (p.music_phase_queued || '音乐排队中…') + pct
      return coverEtaLine ? `${coverEtaLine}\n${base}` : base
    }
    if (st === 'processing') {
      const phase = classifyMusicPhase(hint)
      const phaseLabel =
        phase === 'loading'
          ? p.music_phase_loading || '正在加载模型…'
          : phase === 'queued'
            ? p.music_phase_queued || '音乐排队中…'
            : phase === 'decoding'
              ? p.music_phase_decoding || '正在解码音频…'
              : phase === 'generating'
                ? isCover && coverEtaLine
                  ? coverEtaLine
                  : p.music_phase_generating || '正在生成旋律…'
                : String(hint || '').trim() ||
                  (isCover && coverEtaLine
                    ? coverEtaLine
                    : p.music_phase_processing || '音乐生成中…')
      return `${p.music_phase_prefix || '音乐'}：${phaseLabel}${pct}`
    }
    if (st === 'completed') return p.music_phase_done || '音乐生成完成'
    if (st === 'failed') return p.music_phase_failed || '音乐生成失败'
    return st
  }

  let networkFails = 0
  while (Date.now() - started < POLL_MAX_MS) {
    let data = null
    try {
      const res = await fetch(
        `ai_proxy.php?action=music_job_status&id=${encodeURIComponent(jobId)}&_=${Date.now()}`,
        { credentials: 'same-origin' }
      )
      data = await res.json()
      networkFails = 0
    } catch (e) {
      networkFails += 1
      if (networkFails >= 5) {
        if (typeof append === 'function') {
          append(
            `\n错误：音乐状态查询连续失败（${e?.message || e}）`,
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
      if (networkFails >= 5) {
        if (typeof append === 'function') {
          append(`\n错误：${data.error || '任务查询失败'}`, convId)
        }
        return { ok: false, error: data.error }
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
      continue
    }

    const label = statusLabel(
      data.status,
      data.hint || data.message,
      data.progress,
      {
        task_type: data.task_type,
        src_duration_sec: data.src_duration_sec,
        eta_minutes: data.eta_minutes,
      }
    )
    if (label !== lastStatus && typeof append === 'function') {
      if (lastStatus) {
        append(`\n${label}`, convId)
      } else {
        append(label, convId)
      }
      lastStatus = label
    }
    if (typeof updateMeta === 'function') {
      updateMeta({ musicJobId: jobId, musicStatus: data.status }, convId)
    }

    if (data.status === 'completed' && data.audio_url) {
      if (typeof append === 'function') {
        append(`\n${MUSIC_MARKER}${data.audio_url}`, convId)
        const tip =
          pack().music_done_tip ||
          (getLang() === 'zh'
            ? '\n✓ 可下载整曲、导出多轨（含仅人声/伴奏），或点「再生成」。'
            : '\n✓ Download, export stems (vocals/instrumental), or regenerate.')
        append(tip, convId)
      }
      return { ok: true, audio_url: data.audio_url, job: data }
    }
    if (data.status === 'failed' || data.stale) {
      const errText = data.error || data.message || '失败'
      if (typeof append === 'function') {
        append(`\n错误：${errText}`, convId)
        if (/过期|重新上传|src_audio|源音频/.test(String(errText))) {
          append(
            getLang() === 'zh'
              ? '\n提示：请点工具栏 📁 或「重新上传」源音频后再试'
              : '\nTip: re-upload source audio (📁 or Re-upload) and retry',
            convId
          )
        }
      }
      return { ok: false, error: data.error || 'stale', retry_upload: /过期|源音频/.test(String(errText)) }
    }

    await new Promise((r) => setTimeout(r, POLL_MS))
  }

  if (typeof append === 'function') {
    append(
      getLang() === 'zh'
        ? '\n错误：音乐生成超时。请点「释放显存」或确认 ACE-Step API（:8001）后重试'
        : '\nError: music generation timed out',
      convId
    )
  }
  return { ok: false, error: 'timeout' }
}

export function attachMusicToMessage(msg, url) {
  if (!msg || !url) return
  msg.audioUrl = url
  if (!String(msg.content || '').includes(MUSIC_MARKER)) {
    msg.content = `${String(msg.content || '').trim()}\n${MUSIC_MARKER}${url}`.trim()
  }
}
