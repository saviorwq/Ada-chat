/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 插件管理面板（从 script.js 迁出；依赖 globalThis.PluginSystem / MainApp）
 * Plugin manager panel — migrated from script.js; uses globalThis.PluginSystem / MainApp
 */
import { escapeHtml } from '@/shared/escape-html.js'

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

export function showPluginManager() {
  if (typeof globalThis.setSettingsMenuActive === 'function') {
    globalThis.setSettingsMenuActive('pluginManagerMenuItem')
  }
  if (typeof globalThis.hideAllPanels === 'function') globalThis.hideAllPanels()
  const panel = $('pluginManagerPanel')
  if (!panel) {
    createPluginPanel()
  }
  const p = $('pluginManagerPanel')
  if (p) p.style.display = 'block'
  const title = $('settingsContentTitle')
  if (title) title.textContent = pack().plugin_manager
  renderPluginList()
}

export function createPluginPanel() {
  const main = document.querySelector('.settings-main')
  if (!main) return
  const panel = document.createElement('div')
  panel.id = 'pluginManagerPanel'
  panel.style.display = 'none'
  panel.innerHTML = `
        <h3 data-i18n="plugin_manager">🧩 插件管理</h3>
        <p data-i18n="plugin_manager_desc">启用/禁用插件，配置插件设置与 Tool Calling。</p>
        <div class="plugin-tools-global" style="margin:12px 0 16px; padding:12px; border:1px solid var(--border); border-radius:var(--radius-md);">
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
            <input type="checkbox" id="toolCallingEnabledToggle">
            <span data-i18n="tool_calling_enable">启用 Plugin Tool Calling</span>
          </label>
          <p class="hint" style="margin:8px 0 0;" data-i18n="tool_calling_hint">开启后，已启用插件声明的 tools 可被模型自动调用（本地直连暂不支持）。</p>
        </div>
        <div id="pluginList" class="plugin-list"></div>
    `
  main.appendChild(panel)
}

export function renderPluginList() {
  const container = $('pluginList')
  if (!container) return

  const PluginSystem = globalThis.PluginSystem
  const MainApp = globalThis.MainApp
  if (!PluginSystem?.getAllPlugins || !MainApp?.isPluginEnabled) return

  const toggle = $('toolCallingEnabledToggle')
  if (toggle && typeof globalThis.isToolCallingEnabled === 'function') {
    toggle.checked = !!globalThis.isToolCallingEnabled()
    if (!toggle.dataset.wired) {
      toggle.dataset.wired = '1'
      toggle.addEventListener('change', () => {
        globalThis.setToolCallingEnabled?.(!!toggle.checked)
      })
    }
  }

  const plugins = PluginSystem.getAllPlugins()

  if (plugins.length === 0) {
    container.innerHTML =
      '<p class="hint" style="padding:20px;">暂无已注册的插件。</p>'
    return
  }

  let html = ''
  plugins.forEach((plugin) => {
    const safeName = escapeHtml(plugin.name || plugin.id)
    const safeVersion = escapeHtml(plugin.version || '')
    const safeAuthor = escapeHtml(plugin.author || '')
    const safeDescription = escapeHtml(plugin.description || '')
    const enabled = MainApp.isPluginEnabled(plugin.id)
    const tools = Array.isArray(plugin.tools) ? plugin.tools : []
    const toolsHtml = tools.length
      ? `<div class="plugin-tools-list" style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--border);">
            <div class="hint" style="margin-bottom:6px;">Tools</div>
            ${tools
              .map((tool) => {
                const tName = escapeHtml(tool.name || '')
                const tDesc = escapeHtml(tool.description || '')
                const tOn =
                  typeof globalThis.isToolEnabled === 'function'
                    ? globalThis.isToolEnabled(plugin.id, tool.name)
                    : true
                return `<label style="display:flex; gap:8px; align-items:flex-start; margin:6px 0; font-size:13px;">
                  <input type="checkbox" data-tool-plugin="${escapeHtml(plugin.id)}" data-tool-name="${tName}" ${tOn ? 'checked' : ''} onchange="togglePluginTool(this)">
                  <span><code>${tName}</code> ${tDesc ? `— ${tDesc}` : ''}</span>
                </label>`
              })
              .join('')}
          </div>`
      : ''
    html += `
            <div class="plugin-item" style="border:1px solid var(--border); border-radius:var(--radius-md); padding:16px; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:20px;">🧩</span>
                    <div style="flex:1;">
                        <strong>${safeName}</strong> 
                        ${safeVersion ? `v${safeVersion}` : ''} 
                        ${safeAuthor ? `<span style="color:var(--text-light);">by ${safeAuthor}</span>` : ''}
                        <div style="font-size:13px; color:var(--text-light); margin-top:4px;">${safeDescription}</div>
                    </div>
                    <label class="switch">
                        <input type="checkbox" data-plugin-id="${plugin.id}" ${enabled ? 'checked' : ''} onchange="togglePlugin(this)">
                        <span class="slider round"></span>
                    </label>
                    ${plugin.settings ? `<button class="cyoa-btn cyoa-btn-secondary" onclick="configurePlugin('${plugin.id}')">⚙️ 设置</button>` : ''}
                </div>
                ${toolsHtml}
            </div>
        `
  })
  container.innerHTML = html
}

export function togglePlugin(checkbox) {
  const pluginId = checkbox.dataset.pluginId
  const MainApp = globalThis.MainApp
  if (MainApp?.setPluginEnabled) {
    MainApp.setPluginEnabled(pluginId, checkbox.checked)
  }
}

export function togglePluginTool(checkbox) {
  const pluginId = checkbox.dataset.toolPlugin
  const toolName = checkbox.dataset.toolName
  if (typeof globalThis.setToolEnabled === 'function') {
    globalThis.setToolEnabled(pluginId, toolName, !!checkbox.checked)
  }
}

export function configurePlugin(pluginId) {
  const PluginSystem = globalThis.PluginSystem
  if (!PluginSystem?.getPluginInfo) return
  const plugin = PluginSystem.getPluginInfo(pluginId)
  if (!plugin || !plugin.renderSettings) return

  if (typeof globalThis.setSettingsMenuActive === 'function') {
    globalThis.setSettingsMenuActive('pluginManagerMenuItem')
  }
  if (typeof globalThis.hideAllPanels === 'function') globalThis.hideAllPanels()
  let pluginConfigPanel = $('pluginConfigPanel')
  if (!pluginConfigPanel) {
    pluginConfigPanel = document.createElement('div')
    pluginConfigPanel.id = 'pluginConfigPanel'
    document.querySelector('.settings-main')?.appendChild(pluginConfigPanel)
  }
  pluginConfigPanel.style.display = 'block'
  const title = $('settingsContentTitle')
  if (title) title.textContent = `${plugin.name || pluginId} 设置`

  plugin.renderSettings(pluginConfigPanel)
}
