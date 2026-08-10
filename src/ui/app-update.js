/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 更新中心 / 版本检查（从 script.js 迁出）
 * Update center & release check — migrated from script.js
 */
function $(id) {
  return document.getElementById(id)
}

function getLang() {
  return typeof globalThis.currentLanguage === 'string'
    ? globalThis.currentLanguage
    : 'zh'
}

function getI18n() {
  return globalThis.AdaChatI18n || globalThis.i18n || { zh: {}, en: {} }
}

function pack() {
  const i18n = getI18n()
  return i18n[getLang()] || i18n.en || {}
}

function toast(msg, ms) {
  if (typeof globalThis.showAppToast === 'function')
    globalThis.showAppToast(msg, ms)
}

const UPDATE_CURRENT_VERSION = 'v1.2.0'
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const UPDATE_STORAGE_KEYS = {
  auto: 'update_auto_check_enabled',
  lastCheckedAt: 'update_last_checked_at',
  latestTag: 'update_latest_tag',
  latestName: 'update_latest_name',
  latestBody: 'update_latest_body',
  latestUrl: 'update_latest_url',
  latestPublishedAt: 'update_latest_published_at',
  seenTag: 'update_seen_tag',
}

/** 与 script.js 原 updateRuntimeState 一致，供 openLatestReleasePage 等读取 */
export let updateRuntimeState = {
  latestTag: '',
  latestName: '',
  latestBody: '',
  latestUrl: '',
  latestPublishedAt: '',
  hasNew: false,
}

function normalizeVersionTag(tag) {
  return String(tag || '')
    .trim()
    .replace(/^v/i, '')
}

function compareSemver(a, b) {
  const pa = normalizeVersionTag(a)
    .split('.')
    .map((x) => parseInt(x, 10))
  const pb = normalizeVersionTag(b)
    .split('.')
    .map((x) => parseInt(x, 10))
  const maxLen = Math.max(pa.length, pb.length)
  for (let i = 0; i < maxLen; i++) {
    const na = Number.isFinite(pa[i]) ? pa[i] : 0
    const nb = Number.isFinite(pb[i]) ? pb[i] : 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

export function isUpdateAutoCheckEnabled() {
  const v = localStorage.getItem(UPDATE_STORAGE_KEYS.auto)
  if (v === null) return true
  return v === '1'
}

export function setUpdateAutoCheckEnabled(enabled) {
  localStorage.setItem(UPDATE_STORAGE_KEYS.auto, enabled ? '1' : '0')
}

export function setUpdateIndicators(hasUpdate) {
  const settingsBtn = $('settingsBtn')
  const updateMenuItem = $('updateMenuItem')
  if (settingsBtn) settingsBtn.classList.toggle('has-update', !!hasUpdate)
  if (updateMenuItem)
    updateMenuItem.classList.toggle('update-available', !!hasUpdate)
}

export function updatePanelStatusText(latestInfo = null) {
  const currentVersionEl = $('updateCurrentVersion')
  const latestVersionEl = $('updateLatestVersion')
  const lastCheckedEl = $('updateLastChecked')
  const whatsNewEl = $('updateWhatsNew')
  if (currentVersionEl) currentVersionEl.textContent = UPDATE_CURRENT_VERSION
  if (latestVersionEl) {
    latestVersionEl.textContent =
      latestInfo?.tag ||
      localStorage.getItem(UPDATE_STORAGE_KEYS.latestTag) ||
      '-'
  }
  if (lastCheckedEl) {
    const ts = parseInt(
      localStorage.getItem(UPDATE_STORAGE_KEYS.lastCheckedAt) || '0',
      10
    )
    lastCheckedEl.textContent = ts > 0 ? new Date(ts).toLocaleString() : '-'
  }
  if (whatsNewEl) {
    const body =
      latestInfo?.body ||
      localStorage.getItem(UPDATE_STORAGE_KEYS.latestBody) ||
      ''
    whatsNewEl.textContent = body.trim() || '-'
  }
}

export function markUpdateSeen(tag) {
  const latestTag =
    tag || localStorage.getItem(UPDATE_STORAGE_KEYS.latestTag) || ''
  if (!latestTag) return
  localStorage.setItem(UPDATE_STORAGE_KEYS.seenTag, latestTag)
  setUpdateIndicators(false)
}

async function fetchLatestReleaseInfo() {
  const res = await fetch('ai_proxy.php?action=check_update', { method: 'GET' })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const data = await res.json()
  if (!data || !data.success || !data.release) {
    throw new Error(data?.message || data?.error || 'update_check_failed')
  }
  return {
    tag: String(data.release.tag || '').trim(),
    name: String(data.release.name || '').trim(),
    body: String(data.release.body || '').trim(),
    url: String(data.release.url || '').trim(),
    publishedAt: String(data.release.publishedAt || '').trim(),
  }
}

export async function checkForUpdates(options = {}) {
  const { manual = false, force = false } = options
  const now = Date.now()
  const lastChecked = parseInt(
    localStorage.getItem(UPDATE_STORAGE_KEYS.lastCheckedAt) || '0',
    10
  )
  const needNetwork =
    force || !lastChecked || now - lastChecked > UPDATE_CHECK_INTERVAL_MS
  const t = pack()
  try {
    let info = null
    if (needNetwork || manual) {
      info = await fetchLatestReleaseInfo()
      localStorage.setItem(UPDATE_STORAGE_KEYS.lastCheckedAt, String(now))
      localStorage.setItem(UPDATE_STORAGE_KEYS.latestTag, info.tag || '')
      localStorage.setItem(UPDATE_STORAGE_KEYS.latestName, info.name || '')
      localStorage.setItem(UPDATE_STORAGE_KEYS.latestBody, info.body || '')
      localStorage.setItem(UPDATE_STORAGE_KEYS.latestUrl, info.url || '')
      localStorage.setItem(
        UPDATE_STORAGE_KEYS.latestPublishedAt,
        info.publishedAt || ''
      )
    } else {
      info = {
        tag: localStorage.getItem(UPDATE_STORAGE_KEYS.latestTag) || '',
        name: localStorage.getItem(UPDATE_STORAGE_KEYS.latestName) || '',
        body: localStorage.getItem(UPDATE_STORAGE_KEYS.latestBody) || '',
        url: localStorage.getItem(UPDATE_STORAGE_KEYS.latestUrl) || '',
        publishedAt:
          localStorage.getItem(UPDATE_STORAGE_KEYS.latestPublishedAt) || '',
      }
    }
    const seenTag = localStorage.getItem(UPDATE_STORAGE_KEYS.seenTag) || ''
    const hasNewVersion = compareSemver(info.tag, UPDATE_CURRENT_VERSION) > 0
    const shouldBlink = hasNewVersion && info.tag !== seenTag
    updateRuntimeState = {
      latestTag: info.tag,
      latestName: info.name,
      latestBody: info.body,
      latestUrl: info.url,
      latestPublishedAt: info.publishedAt,
      hasNew: hasNewVersion,
    }
    setUpdateIndicators(shouldBlink)
    updatePanelStatusText(info)
    if (manual) {
      if (hasNewVersion) {
        const msg = (t.update_found || '发现新版本：{version}').replace(
          '{version}',
          info.tag || '-'
        )
        toast(msg, 3000)
      } else {
        toast(t.update_no_new || '当前已是最新版本。', 2400)
      }
    }
    return updateRuntimeState
  } catch (err) {
    if (manual) {
      const msgTpl = t.update_check_failed || '检查更新失败：{message}'
      toast(msgTpl.replace('{message}', err?.message || String(err)), 2800)
    }
    throw err
  }
}

export async function showUpdateCenter() {
  if (typeof globalThis.setSettingsMenuActive === 'function') {
    globalThis.setSettingsMenuActive('updateMenuItem')
  }
  if (typeof globalThis.hideAllPanels === 'function') globalThis.hideAllPanels()
  const panel = $('updatePanel')
  if (panel) panel.style.display = 'block'
  const t = pack()
  $('settingsContentTitle').textContent = t.update_center || 'Update Center'
  if ($('updateAutoCheck'))
    $('updateAutoCheck').checked = isUpdateAutoCheckEnabled()
  updatePanelStatusText()
  try {
    await checkForUpdates({ manual: false, force: false })
  } catch {
    /* ignore */
  }
  markUpdateSeen(updateRuntimeState.latestTag)
}

export async function checkForUpdatesManual() {
  toast(pack().update_checking || 'Checking for updates...', 1400)
  try {
    await checkForUpdates({ manual: true, force: true })
  } catch {
    /* ignore */
  }
}

export function saveUpdateSettings() {
  const enabled = !!$('updateAutoCheck')?.checked
  setUpdateAutoCheckEnabled(enabled)
  toast(pack().update_settings_saved || 'Saved', 1200)
}

export function openLatestReleasePage() {
  const url =
    updateRuntimeState.latestUrl ||
    localStorage.getItem(UPDATE_STORAGE_KEYS.latestUrl) ||
    'https://github.com/saviorwq/Ada-chat/releases/latest'
  globalThis.open(url, '_blank', 'noopener')
}

/**
 * 在 script.js DOMContentLoaded 末尾调用：绑定开关、首次拉取/指示器
 * Call from script.js DOMContentLoaded: checkbox + initial fetch / indicators
 */
export function initAppUpdateOnLoad() {
  if ($('updateAutoCheck')) {
    $('updateAutoCheck').addEventListener('change', saveUpdateSettings)
  }
  updatePanelStatusText()
  if (isUpdateAutoCheckEnabled()) {
    setTimeout(() => {
      checkForUpdates({ manual: false, force: false }).catch(() => {})
    }, 8000)
  } else {
    setUpdateIndicators(false)
  }
}
