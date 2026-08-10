/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 密码设置、安全退出、右下角彻底退出 FAB、启动时 ensure 后台服务
 * Password settings, safe exit, quit FAB, ensure background services on boot
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

function csrfHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  const csrfMeta = document.querySelector('meta[name="csrf-token"]')
  if (csrfMeta) headers['X-CSRF-Token'] = csrfMeta.content
  return headers
}

export function showPasswordSettings() {
  if (typeof globalThis.setSettingsMenuActive === 'function') {
    globalThis.setSettingsMenuActive('passwordMenuItem')
  }
  if (typeof globalThis.hideAllPanels === 'function') globalThis.hideAllPanels()
  const panel = $('passwordPanel')
  if (panel) panel.style.display = 'block'
  const title = $('settingsContentTitle')
  if (title) title.textContent = pack().password_settings
}

export function savePassword() {
  const pwd = $('settingsPassword')?.value ?? ''
  const t = pack()
  if (pwd) {
    localStorage.setItem('ai_settings_password', pwd)
    alert(t.password_saved)
  } else {
    localStorage.removeItem('ai_settings_password')
    alert(t.password_cleared)
  }
}

/**
 * 彻底退出：登出 + 停止 PHP 与 llama-server 等后台
 * Full quit: sign out + stop PHP and background llama-server
 */
export async function safeExitAndShutdown() {
  const zh = getLang() === 'zh'
  const t = pack()
  const msg =
    t.safe_exit_confirm ||
    (zh
      ? '将退出登录并停止本地 Ada Chat 与后台 GPU 服务（llama-server），是否继续？'
      : 'This will sign out and stop local Ada Chat plus background GPU services (llama-server). Continue?')
  if (!confirm(msg)) return
  try {
    const res = await fetch('ai_proxy.php?action=safe_exit', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({}),
      credentials: 'same-origin',
    })
    const text = await res.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      /* non-json */
    }
    if (!data || !data.success) {
      alert(
        (zh ? '安全退出失败：' : 'Safe exit failed: ') +
          (data?.error || 'unknown_error')
      )
      return
    }
    const okMsg =
      t.safe_exit_done ||
      (zh
        ? '已执行彻底退出（含停止 GPU / llama-server）。页面将返回登录页，PHP 会在几秒内停止；显存通常数秒内释放。'
        : 'Full quit requested (including GPU / llama-server). Redirecting to login; PHP stops shortly and VRAM usually frees within seconds.')
    alert(okMsg)
    setTimeout(() => {
      try {
        const base = (globalThis.location.pathname || '/').replace(/[^/]*$/, '')
        globalThis.location.replace(
          globalThis.location.origin + base + 'login.php?logout=1'
        )
      } catch {
        globalThis.location.replace('login.php?logout=1')
      }
    }, 150)
  } catch (e) {
    alert(
      (getLang() === 'zh' ? '安全退出失败：' : 'Safe exit failed: ') +
        (e?.message || e)
    )
  }
}

/**
 * 启动时静默 ensure 本机后台服务（仅本机 API 生效）
 * Silently ensure local background services on boot (local API only)
 */
export async function ensureLocalBackgroundServices() {
  try {
    const res = await fetch('ai_proxy.php?action=ensure_local_services', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({}),
      credentials: 'same-origin',
    })
    const text = await res.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      return
    }
    if (data?.ensure_result && !data.ensure_result.ok) {
      console.info(
        '[AdaChat] ensure_local_services:',
        data.ensure_result.error || data.ensure_result
      )
    }
  } catch (e) {
    console.info('[AdaChat] ensure_local_services skipped:', e?.message || e)
  }
}

/**
 * 右下角彻底退出图标 / Bottom-right full-quit FAB
 */
export function mountQuitFab() {
  if (typeof document === 'undefined') return
  if (document.getElementById('adachatQuitFab')) return
  const t = pack()
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.id = 'adachatQuitFab'
  btn.className = 'adachat-quit-fab'
  btn.setAttribute('aria-label', t.quit_fab_title || 'Quit')
  btn.title = t.quit_fab_title || (getLang() === 'zh' ? '彻底退出' : 'Full quit')
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1zm5.66 2.34a1 1 0 0 1 1.41 1.41A7.96 7.96 0 0 1 20 12a8 8 0 1 1-16 0 7.96 7.96 0 0 1 1.93-5.25 1 1 0 1 1 1.41-1.41A5.96 5.96 0 0 0 6 12a6 6 0 1 0 12 0 5.96 5.96 0 0 0-1.34-3.66 1 1 0 0 1 1-1z"/>' +
    '</svg>'
  btn.addEventListener('click', () => {
    void safeExitAndShutdown()
  })
  document.body.appendChild(btn)
}
