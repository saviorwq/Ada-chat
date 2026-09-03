/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * Local Runtime Manager — settings panel (read-only)
 * 本地运行时设置面板（只读状态）
 */

function $(id) {
  return document.getElementById(id)
}

function pack() {
  const i18n = globalThis.AdaChatI18n || globalThis.ADA_CHAT_I18N || {}
  const lang =
    typeof globalThis.currentLanguage === 'string'
      ? globalThis.currentLanguage
      : globalThis.currentLang || 'zh'
  return i18n[lang] || i18n.zh || {}
}

function getLang() {
  return typeof globalThis.currentLanguage === 'string'
    ? globalThis.currentLanguage
    : 'zh'
}

function workerLine(name, w) {
  if (!w || typeof w !== 'object') return `${name}: —`
  const ok = w.ok ? 'OK' : 'DOWN'
  const extra = []
  if (w.feature_enabled === false) extra.push('feature=off')
  if (w.feature_enabled === true) extra.push('feature=on')
  if (w.mode) extra.push(`mode=${w.mode}`)
  if (w.endpoint) extra.push(w.endpoint)
  return `${name}: ${ok}${extra.length ? ' (' + extra.join(', ') + ')' : ''}`
}

export function showLocalRuntimeSettings() {
  if (typeof globalThis.setSettingsMenuActive === 'function') {
    globalThis.setSettingsMenuActive('localRuntimeMenuItem')
  }
  if (typeof globalThis.hideAllPanels === 'function') globalThis.hideAllPanels()
  const panel = $('localRuntimePanel')
  if (panel) panel.style.display = 'block'
  const title = $('settingsContentTitle')
  if (title) title.textContent = pack().local_runtime_title || '本地运行时'
  void refreshLocalRuntimeStatus()
  void refreshLocalRuntimeJobs()
}

export async function refreshLocalRuntimeStatus() {
  const el = $('localRuntimeStatus')
  const detail = $('localRuntimeDetail')
  if (el) {
    el.textContent = pack().local_runtime_checking || '检测中…'
    el.style.color = '#888'
  }
  try {
    const res = await fetch('ai_proxy.php?action=runtime_status', {
      credentials: 'same-origin',
    })
    const data = await res.json()
    if (!data.success || !data.runtime) {
      if (el) {
        el.textContent =
          (pack().local_runtime_failed || '状态获取失败') +
          ': ' +
          (data.error || res.status)
        el.style.color = '#dc2626'
      }
      return
    }
    const rt = data.runtime
    const preferred = rt.devices?.preferred || 'unknown'
    const flags = rt.flags || {}
    const workers = rt.workers || {}
    const mem = rt.memory || {}
    const memLines = []
    if (mem.ram?.available) {
      memLines.push(
        `RAM ${mem.ram.used_mb ?? '?'} / ${mem.ram.total_mb ?? '?'} MB (${mem.ram.free_mb ?? '?'} free)`
      )
    }
    if (mem.gpu?.available) {
      const pct = mem.gpu.used_pct != null ? ` ${mem.gpu.used_pct}%` : ''
      memLines.push(
        `VRAM ${mem.gpu.used_mb ?? '?'} / ${mem.gpu.total_mb ?? '?'} MB${pct}`
      )
    }
    if (mem.services?.labels?.length) {
      memLines.push(`GPU svcs: ${mem.services.labels.join('; ')}`)
    }
    const summary = [
      ...memLines,
      (pack().local_runtime_device || '设备') + ': ' + preferred,
      (pack().local_runtime_gpu_coord || 'GPU 协调') +
        ': ' +
        (flags.gpu_coord ? 'on' : 'off'),
      (pack().local_runtime_local_image || '本地图像') +
        ': ' +
        (flags.local_image ? 'on' : 'off'),
      workerLine('llm_direct', workers.llm_direct),
      workerLine('llm_vulkan', workers.llm_vulkan),
      workerLine('image', workers.image),
      workers.image?.detail?.status
        ? `image.status=${workers.image.detail.status}`
        : null,
      workers.image?.detail?.loaded_model
        ? `image.loaded=${workers.image.detail.loaded_model}`
        : null,
      workerLine('music', workers.music),
      workers.music?.endpoint ? `music.endpoint=${workers.music.endpoint}` : null,
      workers.music?.detail?.hint
        ? `music.hint=${workers.music.detail.hint}`
        : null,
      workerLine('video', workers.video),
    ]
      .filter(Boolean)
      .join('\n')
    if (el) {
      el.textContent = pack().local_runtime_ready || '运行时状态已更新'
      el.style.color = '#059669'
    }
    if (detail) {
      detail.textContent =
        summary +
        '\n\n' +
        JSON.stringify(
          {
            devices: rt.devices,
            flags: rt.flags,
            updated_at: rt.updated_at,
          },
          null,
          2
        )
    }
  } catch (e) {
    if (el) {
      el.textContent =
        (pack().local_runtime_failed || '状态获取失败') +
        ': ' +
        (e.message || String(e))
      el.style.color = '#dc2626'
    }
  }
}

export async function refreshLocalRuntimeJobs() {
  const el = $('localRuntimeJobs')
  if (!el) return
  el.textContent = pack().local_runtime_checking || '检测中…'
  try {
    const res = await fetch('ai_proxy.php?action=runtime_jobs&limit=20', {
      credentials: 'same-origin',
    })
    const data = await res.json()
    if (!data.success) {
      el.textContent = data.error || 'jobs_failed'
      return
    }
    const jobs = Array.isArray(data.jobs) ? data.jobs : []
    if (!jobs.length) {
      el.textContent = pack().local_runtime_jobs_empty || '暂无近期任务'
      return
    }
    el.textContent = jobs
      .map((j) => {
        const err = j.error ? ` err=${j.error}` : ''
        return `[${j.modality}] ${j.id} ${j.status} ${j.progress || 0}% model=${j.model || '-'}${err}`
      })
      .join('\n')
  } catch (e) {
    el.textContent = e.message || String(e)
  }
}

export async function scanLocalRuntimeModels() {
  const el = $('localRuntimeModels')
  if (el) el.textContent = pack().local_runtime_scanning || '扫描中…'
  try {
    const res = await fetch('ai_proxy.php?action=runtime_scan', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const data = await res.json()
    if (!data.success) {
      if (el) el.textContent = data.error || 'scan_failed'
      return
    }
    const models = Array.isArray(data.models) ? data.models : []
    const header =
      (pack().local_runtime_models_dir || '目录') +
      ': ' +
      (data.models_dir || '') +
      '\n' +
      (pack().local_runtime_models_count || '数量') +
      ': ' +
      (data.count || models.length) +
      '\n\n'
    if (!models.length) {
      if (el) el.textContent = header + (pack().local_runtime_models_empty || '未发现模型')
      return
    }
    if (el) {
      el.textContent =
        header +
        models
          .map(
            (m) =>
              `[${m.modality}] ${m.id} (${m.format || '-'}) ${m.path || ''}`
          )
          .join('\n')
    }
  } catch (e) {
    if (el) el.textContent = e.message || String(e)
  }
}

export async function freeLocalRuntimeVram(opts = {}) {
  const skipConfirm = !!opts.skipConfirm
  const el = $('localRuntimeStatus')

  // 运行中确认：会杀掉 ACE（中断 Cover）与出图 Worker
  if (!skipConfirm) {
    let aceUp = false
    try {
      const stRes = await fetch(
        `ai_proxy.php?action=runtime_status&_=${Date.now()}`,
        { credentials: 'same-origin' }
      )
      const st = await stRes.json()
      aceUp = !!(st?.runtime?.workers?.music?.ok)
      if (!aceUp && st?.runtime?.memory?.services?.acestep) aceUp = true
      if (!aceUp && Array.isArray(st?.runtime?.memory?.services?.labels)) {
        aceUp = st.runtime.memory.services.labels.some((l) =>
          /ACE|音乐/i.test(String(l))
        )
      }
    } catch (_) {
      /* ignore probe errors */
    }
    const zh = getLang() === 'zh'
    const msg = aceUp
      ? zh
        ? '将停止 ACE-Step（进行中的 Cover/音乐会中断）和出图 Worker，并释放显存。确定继续？'
        : 'This stops ACE-Step (interrupts Cover/music) and the image worker. Continue?'
      : zh
        ? '将停止本机 llama / 出图 Worker / ACE-Step 并释放显存。确定继续？'
        : 'Stop local llama / image worker / ACE-Step and free VRAM?'
    if (!window.confirm(msg)) {
      return { cancelled: true }
    }
  }

  if (el) {
    el.textContent = pack().local_runtime_freeing || '正在释放显存…'
    el.style.color = '#888'
  }
  try {
    const res = await fetch('ai_proxy.php?action=runtime_free_vram', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const data = await res.json()
    if (!data.success) {
      if (el) {
        el.textContent =
          (pack().local_runtime_free_failed || '释放失败') +
          ': ' +
          (data.error || res.status)
        el.style.color = '#dc2626'
      }
      return { ok: false, error: data.error }
    }
    const r = data.result || {}
    const ace = r.acestep || {}
    const img = r.image_kill || {}
    if (el) {
      el.textContent =
        (pack().local_runtime_free_ok || '已请求释放显存') +
        ` (ACE-Step killed=${ace.killed ?? 0}, image killed=${img.killed ?? 0})`
      el.style.color = '#059669'
    }
    await refreshLocalRuntimeStatus()
    return { ok: true, result: r }
  } catch (e) {
    if (el) {
      el.textContent =
        (pack().local_runtime_free_failed || '释放失败') +
        ': ' +
        (e.message || String(e))
      el.style.color = '#dc2626'
    }
    return { ok: false, error: e?.message || String(e) }
  }
}

globalThis.showLocalRuntimeSettings = showLocalRuntimeSettings
globalThis.refreshLocalRuntimeStatus = refreshLocalRuntimeStatus
globalThis.refreshLocalRuntimeJobs = refreshLocalRuntimeJobs
globalThis.scanLocalRuntimeModels = scanLocalRuntimeModels
globalThis.freeLocalRuntimeVram = freeLocalRuntimeVram
