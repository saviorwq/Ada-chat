/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * Local Runtime Manager — settings panel (read-only)
 * 本地运行时设置面板（只读状态）
 */

function $(id) {
  return document.getElementById(id)
}

function pack() {
  const i18n = globalThis.ADA_CHAT_I18N || {}
  const lang = globalThis.currentLang || 'zh'
  return i18n[lang] || i18n.zh || {}
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
    const summary = [
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

globalThis.showLocalRuntimeSettings = showLocalRuntimeSettings
globalThis.refreshLocalRuntimeStatus = refreshLocalRuntimeStatus
globalThis.refreshLocalRuntimeJobs = refreshLocalRuntimeJobs
globalThis.scanLocalRuntimeModels = scanLocalRuntimeModels
