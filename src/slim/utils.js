/**
 * DOM 查询的辅助函数
 * @param {string} selector - CSS 选择器
 * @returns {Element | null}
 */
export function $(selector) {
  return document.querySelector(selector)
}

/** CSRF header for ai_proxy.php (must match meta[name="csrf-token"] from PHP) */
export function getCsrfHeaders() {
  const meta = document.querySelector('meta[name="csrf-token"]')
  const t = meta?.getAttribute('content')?.trim()
  return t ? { 'X-CSRF-Token': t } : {}
}

/** Vite dev: index.html 无 meta 时从 ai_proxy 拉取 token（需已登录且代理到 PHP） */
export async function ensureCsrfMeta() {
  const meta = document.querySelector('meta[name="csrf-token"]')
  if (meta?.getAttribute('content')?.trim()) return
  try {
    const r = await fetch('ai_proxy.php?action=csrf_token')
    if (!r.ok) return
    const j = await r.json()
    const t = j?.csrf_token
    if (typeof t !== 'string' || !t.trim()) return
    const m = document.createElement('meta')
    m.name = 'csrf-token'
    m.content = t.trim()
    document.head.appendChild(m)
  } catch {
    // ignore
  }
}
