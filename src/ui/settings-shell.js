/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 设置弹窗壳层：开关、左侧分组、菜单高亮、内容区隐藏（从 script.js 迁出）
 * Settings modal shell: open/close, group arrows, menu active, hide panels — from script.js
 *
 * openSettings 依赖 globalThis.loadProviderListSubmenu / toggleProviderList（provider-models）
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

const SETTINGS_GROUP_STATE_KEY = 'adachat_settings_group_state_v1'

export function openSettings() {
  const modal = $('settingsModal')
  if (!modal) return

  modal.style.display = 'flex'
  hideAllPanels()
  if ($('defaultPlaceholder')) $('defaultPlaceholder').style.display = 'block'
  if ($('settingsContentTitle'))
    $('settingsContentTitle').textContent = pack().select_left_function
  if ($('providerListSubmenu')) $('providerListSubmenu').style.display = 'none'
  if ($('providerListArrow')) $('providerListArrow').textContent = '▶'
  const loadSub = globalThis.loadProviderListSubmenu
  if (typeof loadSub === 'function') void loadSub()
  const toggle = globalThis.toggleProviderList
  if ($('providerListToggle') && typeof toggle === 'function')
    $('providerListToggle').onclick = toggle
  initializeSettingsGroups()
  clearSettingsMenuActive()
  if (typeof globalThis.wireSettingsMenuItemClicks === 'function') {
    globalThis.wireSettingsMenuItemClicks()
  }
}

export function closeSettings() {
  const modal = $('settingsModal')
  if (modal) modal.style.display = 'none'
}

export function getSettingsGroupDefinitions() {
  return [
    {
      groupId: 'settingsGroupModelSubmenu',
      arrowId: 'settingsGroupModelArrow',
      defaultOpen: true,
    },
    {
      groupId: 'settingsGroupCapabilitySubmenu',
      arrowId: 'settingsGroupCapabilityArrow',
      defaultOpen: true,
    },
    {
      groupId: 'settingsGroupUiSubmenu',
      arrowId: 'settingsGroupUiArrow',
      defaultOpen: false,
    },
    {
      groupId: 'settingsGroupDevSubmenu',
      arrowId: 'settingsGroupDevArrow',
      defaultOpen: false,
    },
  ]
}

export function loadSettingsGroupState() {
  try {
    const raw = localStorage.getItem(SETTINGS_GROUP_STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveSettingsGroupState() {
  const state = {}
  getSettingsGroupDefinitions().forEach(({ groupId }) => {
    const groupEl = $(groupId)
    if (!groupEl) return
    state[groupId] = groupEl.style.display !== 'none'
  })
  localStorage.setItem(SETTINGS_GROUP_STATE_KEY, JSON.stringify(state))
}

export function setSettingsGroupExpanded(groupId, arrowId, open) {
  const groupEl = $(groupId)
  const arrowEl = $(arrowId)
  if (!groupEl || !arrowEl) return
  groupEl.style.display = open ? 'block' : 'none'
  arrowEl.textContent = open ? '▼' : '▶'
}

export function toggleSettingsGroup(groupId, arrowId) {
  const groupEl = $(groupId)
  if (!groupEl) return
  const isOpen = groupEl.style.display !== 'none'
  setSettingsGroupExpanded(groupId, arrowId, !isOpen)
  saveSettingsGroupState()
}

export function initializeSettingsGroups() {
  const saved = loadSettingsGroupState()
  getSettingsGroupDefinitions().forEach(({ groupId, arrowId, defaultOpen }) => {
    const open =
      typeof saved[groupId] === 'boolean' ? saved[groupId] : defaultOpen
    setSettingsGroupExpanded(groupId, arrowId, open)
  })
}

export function clearSettingsMenuActive() {
  document
    .querySelectorAll('.settings-group-submenu .menu-item.active')
    .forEach((el) => {
      el.classList.remove('active')
    })
}

export function setSettingsMenuActive(menuItemId) {
  clearSettingsMenuActive()
  const el = $(menuItemId)
  if (!el) return
  el.classList.add('active')

  const parentGroup = el.closest('.settings-group-submenu')
  if (!parentGroup || !parentGroup.id) return

  const groupDef = getSettingsGroupDefinitions().find(
    (x) => x.groupId === parentGroup.id
  )
  if (!groupDef) return

  setSettingsGroupExpanded(groupDef.groupId, groupDef.arrowId, true)
  saveSettingsGroupState()
}

export function hideAllPanels() {
  const panels = [
    'providerEditPanel',
    'modelTypePanel',
    'passwordPanel',
    'presetManagerPanel',
    'timeoutPanel',
    'languagePanel',
    'profilePanel',
    'pluginManagerPanel',
    'pluginConfigPanel',
    'defaultPlaceholder',
    'wordConversionPanel',
    'autoSwitchPanel',
    'costOptimizerPanel',
    'skinPanel',
    'ragPanel',
    'localRuntimePanel',
    'modeCapabilitiesPanel',
    'updatePanel',
    'debugPanel',
  ]
  panels.forEach((id) => {
    const el = $(id)
    if (el) el.style.display = 'none'
  })
}
