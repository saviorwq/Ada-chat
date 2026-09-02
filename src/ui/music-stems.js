/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * Demucs 四轨导出（DAW ZIP）
 * Export Demucs 4-stem WAV ZIP for DAW
 */

const POLL_MS = 3000
const POLL_MAX_MS = 90 * 60 * 1000

function getLang() {
  return typeof globalThis.currentLanguage === 'string'
    ? globalThis.currentLanguage
    : 'zh'
}

/** 从 music_file URL 解析 mus_ job id */
export function musicJobIdFromAudioUrl(url) {
  const s = String(url || '')
  try {
    const u = new URL(s, window.location.href)
    if ((u.searchParams.get('action') || '') === 'music_file') {
      return String(u.searchParams.get('id') || '').trim()
    }
  } catch (_) {
    /* ignore */
  }
  const m = s.match(/[?&]id=(mus_[a-zA-Z0-9]+)/)
  return m ? m[1] : ''
}

export async function startMusicStemsExport(musicJobId) {
  const id = String(musicJobId || '').trim()
  if (!id) {
    throw new Error(getLang() === 'zh' ? '缺少音乐任务 ID' : 'Missing music job id')
  }
  const res = await fetch(
    `ai_proxy.php?action=music_stems_start&id=${encodeURIComponent(id)}&_=${Date.now()}`,
    { credentials: 'same-origin' }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) {
    const err = data.error || data.hint || `HTTP ${res.status}`
    throw new Error(err)
  }
  return data
}

export async function pollMusicStemsUntilDone(stemJobId, onProgress) {
  const started = Date.now()
  let networkFails = 0
  while (Date.now() - started < POLL_MAX_MS) {
    let data = null
    try {
      const res = await fetch(
        `ai_proxy.php?action=music_stems_status&id=${encodeURIComponent(stemJobId)}&_=${Date.now()}`,
        { credentials: 'same-origin' }
      )
      data = await res.json()
      networkFails = 0
    } catch (e) {
      networkFails += 1
      if (networkFails >= 8) {
        return { ok: false, error: e?.message || 'poll_network' }
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
      continue
    }
    if (!data?.success) {
      networkFails += 1
      if (networkFails >= 8) {
        return { ok: false, error: data?.error || 'status_failed' }
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
      continue
    }
    if (typeof onProgress === 'function') {
      onProgress(data)
    }
    if (data.status === 'completed' && data.zip_url) {
      return { ok: true, zip_url: data.zip_url, job: data }
    }
    if (data.status === 'failed' || data.stale) {
      return { ok: false, error: data.error || data.message || 'failed' }
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  return {
    ok: false,
    error:
      getLang() === 'zh'
        ? '分轨超时（Demucs CPU 较慢，可稍后重试）'
        : 'Stem export timed out',
  }
}

export async function downloadMusicStemsZip(zipUrl, filename) {
  // 大 ZIP 勿用 fetch→blob（会整包进内存并易触发 PHP/代理 500）
  // Prefer native browser download for large ZIPs
  const a = document.createElement('a')
  a.href = zipUrl
  a.download = filename || `adachat-stems-${Date.now()}.zip`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** 若该音乐已有完成的分轨 ZIP：download=true 时直接下载并返回 true；否则返回 { zip_url, job_id } */
export async function tryReuseExistingStemsZip(musicJobId, opts = {}) {
  const id = String(musicJobId || '').trim()
  if (!id) return false
  const doDownload = opts.download !== false
  try {
    const res = await fetch(
      `ai_proxy.php?action=music_stems_latest&music_id=${encodeURIComponent(id)}&_=${Date.now()}`,
      { credentials: 'same-origin' }
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success || !data.zip_url) return false
    if (doDownload) {
      await downloadMusicStemsZip(data.zip_url, `adachat-stems-${id}.zip`)
      return true
    }
    return {
      zip_url: data.zip_url,
      job_id: String(data.job_id || ''),
    }
  } catch (_) {
    return false
  }
}

/**
 * 确保分轨 ZIP 就绪（复用或新跑 Demucs），返回 { ok, zip_url?, job_id? }
 */
export async function ensureMusicStemsReady(musicJobId, hooks = {}) {
  const setLabel = hooks.setLabel || (() => {})
  const reuse = await tryReuseExistingStemsZip(musicJobId, { download: false })
  if (reuse && reuse.zip_url) {
    return { ok: true, zip_url: reuse.zip_url, job_id: reuse.job_id || '' }
  }
  setLabel(getLang() === 'zh' ? '多轨排队…' : 'Queuing stems…')
  const started = await startMusicStemsExport(musicJobId)
  const stemId = started.job_id
  setLabel(getLang() === 'zh' ? 'Demucs 分轨中…' : 'Separating…')
  const done = await pollMusicStemsUntilDone(stemId, (data) => {
    const hint = data.hint || data.message || ''
    const pct =
      typeof data.progress === 'number' && data.progress > 0
        ? ` ${data.progress}%`
        : ''
    setLabel((hint || (getLang() === 'zh' ? '分轨中…' : 'Working…')) + pct)
  })
  if (!done.ok) {
    throw new Error(done.error || 'stems_failed')
  }
  return { ok: true, zip_url: done.zip_url, job_id: stemId }
}

/** 下载 ZIP 内单轨（仅人声 / 仅伴奏）；必要时先跑分轨 */
export async function downloadMusicStemTrack(musicJobId, track, hooks = {}) {
  const setLabel = hooks.setLabel || (() => {})
  await ensureMusicStemsReady(musicJobId, hooks)
  const t = String(track || 'vocals').toLowerCase()
  const url =
    `ai_proxy.php?action=music_stems_track&music_id=${encodeURIComponent(musicJobId)}` +
    `&track=${encodeURIComponent(t)}&_=${Date.now()}`
  setLabel(getLang() === 'zh' ? '下载单轨…' : 'Downloading track…')
  const a = document.createElement('a')
  a.href = url
  a.download = `adachat-${musicJobId}-${t}.wav`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * 一键：启动 → 轮询 → 下载 ZIP
 */
export async function exportMusicStemsForDaw(musicJobId, hooks = {}) {
  const setLabel = hooks.setLabel || (() => {})
  const ready = await ensureMusicStemsReady(musicJobId, hooks)
  if (!ready.ok || !ready.zip_url) {
    throw new Error(ready.error || 'stems_failed')
  }
  setLabel(getLang() === 'zh' ? '开始下载 ZIP…' : 'Downloading…')
  await downloadMusicStemsZip(
    ready.zip_url,
    `adachat-stems-${musicJobId}.zip`
  )
  setLabel(getLang() === 'zh' ? '导出多轨(DAW)' : 'Export stems (DAW)')
  return ready
}
