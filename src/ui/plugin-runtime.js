/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * Ada Chat 插件运行时（原 adachat-plugin-runtime.js）
 * Plugin runtime — fetch CSRF、PluginSystem、PluginStorage、MainApp
 */

function $(id) {
  return document.getElementById(id)
}

;(function installFetchCsrf() {
  if (globalThis.__adaChatFetchCsrfInstalled) return
  globalThis.__adaChatFetchCsrfInstalled = true
  const _origFetch = globalThis.fetch
  globalThis.fetch = function patchedFetch(url, options) {
    options = options || {}
    if (options.method && options.method.toUpperCase() === 'POST') {
      const meta = document.querySelector('meta[name="csrf-token"]')
      if (meta) {
        options.headers = options.headers || {}
        if (options.headers instanceof Headers) {
          options.headers.set('X-CSRF-Token', meta.content)
        } else {
          options.headers['X-CSRF-Token'] = meta.content
        }
      }
    }
    return _origFetch.call(this, url, options)
  }
})()

const ALLOWED_PLUGIN_HOOKS = new Set([
  'beforeBuildRequest',
  'beforeSend',
  'afterResponse',
])
const PLUGIN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/
const PLUGIN_HOOK_TIMEOUT_MS = 3000
const PLUGIN_MAX_ERRORS = 3

function withPluginTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`plugin hook timeout (${timeoutMs}ms)`)),
        timeoutMs
      )
    ),
  ])
}

export const PluginSystem = {
  plugins: {},
  hooks: {},
  errorCounts: {},

  registerPlugin(plugin) {
    if (!plugin.id || !PLUGIN_ID_PATTERN.test(plugin.id)) {
      console.error('[Plugin] 必须提供 id')
      return
    }
    if (this.plugins[plugin.id]) {
      console.warn('[Plugin] 重复注册被忽略:', plugin.id)
      return
    }

    this.plugins[plugin.id] = plugin
    this.errorCounts[plugin.id] = 0

    if (plugin.hooks && Array.isArray(plugin.hooks)) {
      plugin.hooks.forEach((hookName) => {
        if (!ALLOWED_PLUGIN_HOOKS.has(hookName)) {
          console.warn(`[Plugin] 非允许钩子已忽略 (${plugin.id}.${hookName})`)
          return
        }
        if (typeof plugin[hookName] !== 'function') {
          console.warn(
            `[Plugin] 声明了钩子但未实现函数 (${plugin.id}.${hookName})`
          )
          return
        }
        if (!this.hooks[hookName]) {
          this.hooks[hookName] = []
        }
        this.hooks[hookName].push(plugin.id)
      })
    }

    if (plugin.onload && typeof plugin.onload === 'function') {
      try {
        plugin.onload()
      } catch (e) {
        console.error(`[Plugin] onload 错误 (${plugin.id}):`, e)
      }
    }

    console.log('[Plugin] 已注册:', plugin.id)
  },

  async runHook(name, context) {
    if (!ALLOWED_PLUGIN_HOOKS.has(name)) return true
    if (!this.hooks[name]) return true

    const app = globalThis.MainApp
    for (const pluginId of this.hooks[name]) {
      const plugin = this.plugins[pluginId]
      if (!plugin || !app?.isPluginEnabled?.(pluginId)) {
        continue
      }

      const fn = plugin[name]
      if (typeof fn === 'function') {
        try {
          const result = await withPluginTimeout(
            Promise.resolve(fn(context)),
            PLUGIN_HOOK_TIMEOUT_MS
          )
          this.errorCounts[pluginId] = 0
          if (result === false) {
            console.log('[Plugin] 阻止执行:', pluginId)
            return false
          }
        } catch (e) {
          console.error(`[Plugin] 钩子执行错误 (${pluginId}.${name}):`, e)
          this.errorCounts[pluginId] = (this.errorCounts[pluginId] || 0) + 1
          if (
            this.errorCounts[pluginId] >= PLUGIN_MAX_ERRORS &&
            app?.setPluginEnabled
          ) {
            app.setPluginEnabled(pluginId, false)
            console.warn(`[Plugin] 已自动禁用异常插件: ${pluginId}`)
          }
        }
      }
    }
    return true
  },

  getAllPlugins() {
    return Object.values(this.plugins)
  },

  getPluginInfo(pluginId) {
    return this.plugins[pluginId] || null
  },
}

export class PluginStorage {
  constructor(pluginId) {
    this._id = pluginId
    this._base = `api.php?plugin=${encodeURIComponent(pluginId)}`
  }

  async get(key) {
    const res = await fetch(
      `${this._base}&action=store_get&key=${encodeURIComponent(key)}&_=${Date.now()}`
    )
    const json = await res.json()
    return json.success ? json.data : null
  }

  async set(key, data) {
    const res = await fetch(
      `${this._base}&action=store_set&key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    )
    const json = await res.json()
    return json.success === true
  }

  async delete(key) {
    const res = await fetch(
      `${this._base}&action=store_delete&key=${encodeURIComponent(key)}`
    )
    const json = await res.json()
    return json.success === true
  }

  async list() {
    const res = await fetch(`${this._base}&action=store_list&_=${Date.now()}`)
    const json = await res.json()
    return json.success ? json.keys : []
  }
}

export const MainApp = {
  plugins: {},
  enabledPlugins: {},

  registerPlugin(plugin) {
    if (!plugin.id || !PLUGIN_ID_PATTERN.test(plugin.id)) {
      console.error('插件必须包含 id')
      return
    }

    plugin.storage = new PluginStorage(plugin.id)
    this.plugins[plugin.id] = plugin

    const saved = localStorage.getItem(`plugin_enabled_${plugin.id}`)
    this.enabledPlugins[plugin.id] = saved !== null ? saved === 'true' : false

    PluginSystem.registerPlugin(plugin)
    console.log(`插件已注册: ${plugin.name} (${plugin.id})`)
    document.dispatchEvent(
      new CustomEvent('pluginRegistered', { detail: { pluginId: plugin.id } })
    )
  },

  isPluginEnabled(pluginId) {
    return !!this.enabledPlugins[pluginId]
  },

  setPluginEnabled(pluginId, enabled) {
    this.enabledPlugins[pluginId] = enabled
    localStorage.setItem(`plugin_enabled_${pluginId}`, enabled)
    document.dispatchEvent(
      new CustomEvent('pluginStateChanged', {
        detail: { pluginId, enabled },
      })
    )
  },

  async runHooks(hookName, ...args) {
    return await PluginSystem.runHook(hookName, ...args)
  },

  appendMessage(role, content) {
    if (role === 'user') {
      globalThis.addMessageToCurrent('user', content)
    } else {
      globalThis.appendToLastAIMessage(content)
    }
  },

  setGameMode(active, config = {}) {
    const dropZone = $('dropZone')
    const controlsBar = document.querySelector('.controls-bar')
    const mainElement = document.querySelector('.main')

    if (active) {
      if (dropZone) dropZone.style.display = 'none'
      if (controlsBar) controlsBar.style.display = 'none'

      const originalInputs = document.querySelectorAll(
        '.input-row, .controls-row, .upload-btn, .send-btn, #category, #providerSelect, #model, #modeRow, #loraRow'
      )
      originalInputs.forEach((el) => {
        if (el) el.style.display = 'none'
      })

      if (typeof globalThis !== 'undefined') {
        globalThis.gameModeModel = $('model') ? $('model').value : null
        globalThis.gameModeProvider = $('providerSelect')
          ? $('providerSelect').value
          : null
      }

      let gameBar = $('gameModeBar')
      if (!gameBar) {
        gameBar = document.createElement('div')
        gameBar.id = 'gameModeBar'
        gameBar.style.padding = '16px 28px'
        gameBar.style.background = 'var(--bg-light)'
        gameBar.style.borderTop = '1px solid var(--border)'
        gameBar.style.position = 'relative'
        gameBar.style.zIndex = '100'
        if (mainElement) {
          if (dropZone && dropZone.parentNode) {
            dropZone.parentNode.insertBefore(gameBar, dropZone)
            dropZone.style.display = 'none'
          } else {
            mainElement.appendChild(gameBar)
          }
        }
      }
      gameBar.style.display = 'block'

      if (config.controlsRenderer) gameBar.innerHTML = config.controlsRenderer()
      if (config.onExit) globalThis.gameExitCallback = config.onExit
      document.body.classList.add('game-mode-active')
    } else {
      if (dropZone) dropZone.style.display = 'block'
      if (controlsBar) controlsBar.style.display = 'flex'

      const originalInputs = document.querySelectorAll(
        '.input-row, .controls-row, .upload-btn, .send-btn, #category, #providerSelect, #model, #modeRow, #loraRow'
      )
      originalInputs.forEach((el) => {
        if (el) el.style.display = ''
      })

      const gameBar = $('gameModeBar')
      if (gameBar) {
        gameBar.style.display = 'none'
        if (gameBar.parentNode) gameBar.parentNode.removeChild(gameBar)
      }

      document.body.classList.remove('game-mode-active')
      if (typeof globalThis !== 'undefined') {
        globalThis.gameModeModel = null
        globalThis.gameModeProvider = null
      }
      if (globalThis.gameExitCallback) {
        try {
          globalThis.gameExitCallback()
        } catch (e) {
          console.error('[MainApp] 退出回调执行错误:', e)
        }
        globalThis.gameExitCallback = null
      }
    }
  },

  getModels(type) {
    return globalThis.allModels
      ? globalThis.allModels
          .filter((m) => m.type === type)
          .map((m) => ({
            value: m.value,
            label: m.label,
          }))
      : []
  },

  getPlugins() {
    return Object.values(this.plugins)
  },
}

function exposeGlobals() {
  globalThis.PluginSystem = PluginSystem
  globalThis.PluginStorage = PluginStorage
  globalThis.MainApp = MainApp

  /**
   * 正式插件 API：AdaPlugin.register（v1.3 含 Tool Calling）
   * Formal plugin API: AdaPlugin.register (v1.3 includes Tool Calling)
   */
  globalThis.AdaPlugin = {
    register(definition = {}) {
      const def = definition && typeof definition === 'object' ? definition : {}
      const id = String(def.id || def.name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
      if (!id) {
        console.error('[AdaPlugin] register() requires id or name')
        return false
      }

      const ToolApi = globalThis.AdaPluginTools
      const tools = Array.isArray(def.tools) ? def.tools : []
      const normalizedTools =
        typeof ToolApi?.normalizePluginTools === 'function'
          ? ToolApi.normalizePluginTools(id, tools)
          : tools
              .filter((t) => t && typeof t === 'object' && t.name)
              .map((t) => ({
                pluginId: id,
                name: String(t.name),
                description: String(t.description || ''),
                parameters:
                  t.parameters && typeof t.parameters === 'object'
                    ? t.parameters
                    : { type: 'object', properties: {} },
                execute: typeof t.execute === 'function' ? t.execute : null,
                readOnly: t.readOnly !== false,
              }))

      const plugin = {
        id,
        name: String(def.name || id),
        version: String(def.version || '0.0.0'),
        description: String(def.description || ''),
        author: String(def.author || ''),
        settings: !!def.settings || typeof def.renderSettings === 'function',
        hooks: Array.isArray(def.hooks) ? def.hooks : [],
        tools: normalizedTools,
        beforeBuildRequest: def.beforeBuildRequest,
        beforeSend: def.beforeSend,
        afterResponse: def.afterResponse,
        renderSettings: def.renderSettings,
        onload: def.onload,
      }

      if (typeof def.onLoad === 'function' && !plugin.onload) {
        plugin.onload = def.onLoad
      }

      MainApp.registerPlugin(plugin)

      if (normalizedTools.length) {
        console.info(
          `[AdaPlugin] ${id}: ${normalizedTools.length} tool(s) registered`
        )
      }
      return true
    },
    getTools(pluginId) {
      const p = PluginSystem.getPluginInfo(pluginId)
      return Array.isArray(p?.tools) ? p.tools : []
    },
    listAvailableTools() {
      return globalThis.AdaPluginTools?.listAvailableTools?.() || []
    },
  }

  console.log('✅ Ada Chat 插件系统已初始化')
}

exposeGlobals()
