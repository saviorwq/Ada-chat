const ROUTE_TOAST_ENABLED_KEY = 'intentRouteToastEnabled'
const ROUTE_LAST_HIT_KEY = 'intentRouteLastHit'

function $(id) {
  return document.getElementById(id)
}

function toastContainer() {
  let host = $('appToastContainer')
  if (!host) {
    host = document.createElement('div')
    host.id = 'appToastContainer'
    host.className = 'adachat-toast-container'
    document.body.appendChild(host)
  }
  return host
}

export function showAppToast(message, durationMs = 1800) {
  const host = toastContainer()
  const item = document.createElement('div')
  item.className = 'adachat-toast'
  item.textContent = String(message || '')
  host.appendChild(item)
  requestAnimationFrame(() => item.classList.add('show'))
  setTimeout(() => {
    item.classList.remove('show')
    setTimeout(() => item.remove(), 220)
  }, durationMs)
}

export function isRouteToastEnabled() {
  const v = localStorage.getItem(ROUTE_TOAST_ENABLED_KEY)
  return v !== '0'
}

export function setRouteToastEnabled(enabled) {
  localStorage.setItem(ROUTE_TOAST_ENABLED_KEY, enabled ? '1' : '0')
}

function formatModelLabel(route) {
  const full = String(route?.model || '').trim()
  if (!full) return ''
  return full.includes('::') ? full.split('::')[1] : full
}

export function saveLastRouteHit(route) {
  const payload = {
    at: Date.now(),
    note: String(route?.note || ''),
    model: String(route?.model || ''),
    task: String(route?.task || ''),
    mode: String(route?.mode || ''),
  }
  localStorage.setItem(ROUTE_LAST_HIT_KEY, JSON.stringify(payload))
}

function formatLastRouteHit() {
  try {
    const raw = localStorage.getItem(ROUTE_LAST_HIT_KEY)
    if (!raw) return '最近命中: -'
    const hit = JSON.parse(raw)
    const model = formatModelLabel(hit)
    const at = Number(hit?.at || 0)
    const time = at ? new Date(at).toLocaleTimeString() : '-'
    const note = String(hit?.note || '-')
    return `最近命中: ${note}${model ? ` · ${model}` : ''} · ${time}`
  } catch {
    return '最近命中: -'
  }
}

export function updateRouteIndicators(route) {
  const badgeEl = $('routeStatusBadge')
  const historyEl = $('routeHistory')
  if (badgeEl) {
    const classes = ['route-status-badge']
    if (route?.routed) classes.push('is-hit')
    else if (String(route?.note || '').includes('未启用'))
      classes.push('is-off')
    else classes.push('is-idle')
    badgeEl.className = classes.join(' ')
    badgeEl.textContent = route?.routed
      ? `Routed: ${route?.task || 'chat'}`
      : `Route: ${route?.task || 'chat'}`
  }
  if (historyEl) historyEl.textContent = formatLastRouteHit()
}

export function initRouteUi() {
  const routeToastEnabledEl = $('routeToastEnabled')
  if (!routeToastEnabledEl) return

  routeToastEnabledEl.checked = isRouteToastEnabled()
  routeToastEnabledEl.addEventListener('change', () => {
    setRouteToastEnabled(routeToastEnabledEl.checked)
  })
}

export function showRouteHitToast(route) {
  if (!route?.routed || !isRouteToastEnabled()) return
  const modelLabel = formatModelLabel(route)
  showAppToast(`${route.note}${modelLabel ? ` · ${modelLabel}` : ''}`)
}
