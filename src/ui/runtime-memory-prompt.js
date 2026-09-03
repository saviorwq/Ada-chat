/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 切换模型 / 类别 / 供应商时检测内存与显存，提示是否释放
 * Prompt to free RAM/VRAM when switching models (local GPU workloads)
 */

function $(id) {
  return document.getElementById(id)
}

function pack() {
  const i18n = globalThis.ADA_CHAT_I18N || {}
  const lang = globalThis.currentLang || 'zh'
  return i18n[lang] || i18n.zh || {}
}

const GPU_CATEGORIES = new Set([
  'chat',
  'code',
  'vision',
  'ocr',
  'translation',
  'image',
  'video',
  'music',
])

let lastSelection = {
  category: '',
  provider: '',
  model: '',
  initialized: false,
}
let promptInFlight = false
let statusCache = { at: 0, memory: null }

function isLocalProviderId(providerId) {
  if (!providerId) return false
  const p = (globalThis.providers || []).find((x) => x && x.id === providerId)
  if (!p) return false
  if (String(p.deployment_type || '') === 'local') return true
  const u = String(p.base_url || '').toLowerCase()
  return (
    u.includes('127.0.0.1') ||
    u.includes('localhost') ||
    u.startsWith('direct://')
  )
}

function getCurrentSelection() {
  return {
    category: String($('category')?.value || ''),
    provider: String($('providerSelect')?.value || ''),
    model: String($('model')?.value || ''),
  }
}

function selectionChanged(prev, next) {
  return (
    prev.category !== next.category ||
    prev.provider !== next.provider ||
    prev.model !== next.model
  )
}

function shouldCheckOnSwitch(prev, next) {
  if (!prev.initialized) return false
  if (!selectionChanged(prev, next)) return false

  const localInvolved =
    isLocalProviderId(prev.provider) || isLocalProviderId(next.provider)
  if (!localInvolved) return false

  const gpuRelated =
    GPU_CATEGORIES.has(prev.category) || GPU_CATEGORIES.has(next.category)
  return gpuRelated
}

function formatMb(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v >= 1024) return `${(v / 1024).toFixed(1)} GB`
  return `${Math.round(v)} MB`
}

function buildPromptLines(memory, prev, next) {
  const p = pack()
  const lines = []
  lines.push(p.runtime_mem_prompt_title || '检测到本机内存/显存占用')
  lines.push('')

  const ram = memory?.ram || {}
  if (ram.available) {
    lines.push(
      (p.runtime_mem_ram_line || '内存：已用 {used} / 共 {total}（剩余 {free}）')
        .replace('{used}', formatMb(ram.used_mb))
        .replace('{total}', formatMb(ram.total_mb))
        .replace('{free}', formatMb(ram.free_mb))
    )
  }

  const gpu = memory?.gpu || {}
  if (gpu.available) {
    const gpuLine =
      gpu.total_mb != null
        ? p.runtime_mem_gpu_line ||
          '显存：已用 {used} / 共 {total}（{pct}%）'
        : p.runtime_mem_gpu_used_only || '显存：已用约 {used}'
    lines.push(
      gpuLine
        .replace('{used}', formatMb(gpu.used_mb))
        .replace('{total}', formatMb(gpu.total_mb))
        .replace('{pct}', gpu.used_pct != null ? String(gpu.used_pct) : '—')
    )
  }

  const labels = memory?.services?.labels
  if (Array.isArray(labels) && labels.length) {
    lines.push(
      (p.runtime_mem_services || '占用中的本地服务：{list}').replace(
        '{list}',
        labels.join('；')
      )
    )
  }

  if (prev.category !== next.category) {
    lines.push(
      (p.runtime_mem_switch_category || '类别：{from} → {to}')
        .replace('{from}', prev.category || '—')
        .replace('{to}', next.category || '—')
    )
  } else if (prev.model !== next.model) {
    lines.push(p.runtime_mem_switch_model || '已切换模型')
  }

  lines.push('')
  lines.push(
    p.runtime_mem_prompt_question ||
      '是否现在释放内存/显存？（将停止 llama / 出图 Worker / ACE-Step）'
  )
  return lines.join('\n')
}

async function fetchMemorySnapshot(force = false) {
  const now = Date.now()
  if (!force && statusCache.memory && now - statusCache.at < 4000) {
    return statusCache.memory
  }
  const res = await fetch('ai_proxy.php?action=runtime_status', {
    credentials: 'same-origin',
  })
  const data = await res.json()
  const memory = data?.runtime?.memory || null
  statusCache = { at: now, memory }
  return memory
}

async function maybePromptRelease(prev, next) {
  if (promptInFlight || !shouldCheckOnSwitch(prev, next)) return

  promptInFlight = true
  try {
    let memory
    try {
      memory = await fetchMemorySnapshot(true)
    } catch {
      return
    }
    if (!memory) return

    const needsPrompt =
      memory.pressure || memory.busy || selectionChanged(prev, next)
    if (!needsPrompt) return

    if (!memory.pressure && !memory.busy) return

    const msg = buildPromptLines(memory, prev, next)
    const ok = window.confirm(msg)
    if (!ok) return

    const fn = globalThis.freeLocalRuntimeVram
    if (typeof fn !== 'function') {
      window.alert(
        pack().runtime_mem_free_missing ||
          '释放功能未加载，请打开 设置 → 本地运行时'
      )
      return
    }

    await fn({ skipConfirm: true })
    statusCache = { at: 0, memory: null }

    if (typeof globalThis.showAppToast === 'function') {
      globalThis.showAppToast(
        pack().runtime_mem_free_done || '已请求释放内存/显存',
        2600
      )
    }
  } finally {
    promptInFlight = false
  }
}

async function afterSelectionChange(prev) {
  const next = getCurrentSelection()
  await maybePromptRelease(prev, next)
  await maybeMusicCategoryHint(prev, next)
  lastSelection = { ...next, initialized: true }
}

async function maybeMusicCategoryHint(prev, next) {
  if (!prev.initialized) return
  if (next.category !== 'music' || prev.category === 'music') return
  if (!isLocalProviderId(next.provider)) return

  let memory = null
  try {
    memory = await fetchMemorySnapshot(true)
  } catch {
    return
  }

  if (memory?.busy || memory?.pressure) return

  if (typeof globalThis.showAppToast === 'function') {
    globalThis.showAppToast(
      pack().music_vram_switch_hint ||
        '长曲 Cover 前建议先点「释放显存」，勿与出图并行',
      4200
    )
  }
}

function wrapGlobalFn(name) {
  const orig = globalThis[name]
  if (typeof orig !== 'function' || orig.__runtimeMemWrapped) return

  const wrapped = function runtimeMemWrapped(...args) {
    const prev = { ...lastSelection }
    const ret = orig.apply(this, args)
    void afterSelectionChange(prev)
    return ret
  }
  wrapped.__runtimeMemWrapped = true
  globalThis[name] = wrapped
}

function bindModelSelect() {
  const modelEl = $('model')
  if (!modelEl || modelEl.dataset.runtimeMemBound === '1') return
  modelEl.dataset.runtimeMemBound = '1'
  modelEl.addEventListener('change', () => {
    const prev = { ...lastSelection }
    void afterSelectionChange(prev)
  })
}

export function initRuntimeMemoryPrompt() {
  lastSelection = { ...getCurrentSelection(), initialized: false }

  wrapGlobalFn('onCategoryChange')

  const origProvider = globalThis.onProviderChange
  if (typeof origProvider === 'function' && !origProvider.__runtimeMemWrapped) {
    globalThis.onProviderChange = async function runtimeMemProviderWrapped(
      ...args
    ) {
      const prev = { ...lastSelection }
      await origProvider.apply(this, args)
      await afterSelectionChange(prev)
    }
    globalThis.onProviderChange.__runtimeMemWrapped = true
  }

  bindModelSelect()

  setTimeout(() => {
    lastSelection = { ...getCurrentSelection(), initialized: true }
  }, 800)
}

globalThis.initRuntimeMemoryPrompt = initRuntimeMemoryPrompt
