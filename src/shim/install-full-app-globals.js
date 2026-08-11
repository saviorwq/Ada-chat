/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 将完整版模块 API 挂到 globalThis（供插件与历史 onclick 等使用），并填充 __ADA_CHAT_FULL_APP__
 * Mount full-bundle APIs on globalThis for plugins / legacy handlers + __ADA_CHAT_FULL_APP__ registry
 */

import { installLegacyWindowDefaults } from '@/shim/legacy-window-defaults.js'

/**
 * @param {Record<string, unknown>} ns
 * @param {typeof globalThis} target
 */
function exposeExportedFunctions(ns, target) {
  Object.entries(ns).forEach(([k, v]) => {
    if (typeof v === 'function') target[k] = v
  })
}

/**
 * @param {object} m — full-app-entry 传入的命名空间集合 / namespaces from full-app-entry
 */
export function installFullAppGlobals(m) {
  if (typeof globalThis === 'undefined') return
  const g = globalThis

  installLegacyWindowDefaults()

  g.AdaChatModeConfig = m.AdaChatModeConfig
  g.AdaChatI18n = m.ADA_CHAT_I18N
  exposeExportedFunctions(m.AppHelpers, g)
  exposeExportedFunctions(m.SettingsShell, g)
  g.openHelpModal = m.openHelpModal
  g.closeHelpModal = m.closeHelpModal
  g.openSupportModal = m.openSupportModal
  g.closeSupportModal = m.closeSupportModal
  g.initHelpWindowDrag = m.initHelpWindowDrag
  g.isAutoSwitchEnabled = m.isAutoSwitchEnabled
  g.toggleAutoSwitch = m.toggleAutoSwitch
  g.getAlternateModels = m.getAlternateModels
  g.getModelLabel = m.getModelLabel
  g.showAutoSwitchSettings = m.showAutoSwitchSettings
  g.saveAutoSwitchList = m.saveAutoSwitchList
  g.isRateLimitMessage = m.isRateLimitMessage
  g.isTransientProviderError = m.isTransientProviderError
  g.showAutoSwitchToast = m.showAutoSwitchToast
  exposeExportedFunctions(m.SettingsUi, g)
  exposeExportedFunctions(m.PluginManagerUi, g)
  exposeExportedFunctions(m.ChatRender, g)
  exposeExportedFunctions(m.Conversations, g)
  exposeExportedFunctions(m.DebugTools, g)
  exposeExportedFunctions(m.Rag, g)
  exposeExportedFunctions(m.Upload, g)
  exposeExportedFunctions(m.ChatSendPipeline, g)
  exposeExportedFunctions(m.ProviderModels, g)
  exposeExportedFunctions(m.AppUpdate, g)
  exposeExportedFunctions(m.ChatProfile, g)
  exposeExportedFunctions(m.CostOptimizerUi, g)
  if (m.LocalRuntimeUi) exposeExportedFunctions(m.LocalRuntimeUi, g)
  exposeExportedFunctions(m.SecuritySettingsUi, g)
  exposeExportedFunctions(m.InputProviderBridge, g)
  exposeExportedFunctions(m.MainAppBootstrap, g)
  if (m.Workspace) exposeExportedFunctions(m.Workspace, g)
  if (m.ModelPersonasUi) exposeExportedFunctions(m.ModelPersonasUi, g)
  if (m.PluginTools) {
    exposeExportedFunctions(m.PluginTools, g)
    g.AdaPluginTools = m.PluginTools
  }

  g.__ADA_CHAT_FULL_APP__ = {
    escapeHtml: m.AppHelpers.escapeHtml,
    AdaChatModeConfig: m.AdaChatModeConfig,
    AdaChatI18n: m.ADA_CHAT_I18N,
    appHelpers: m.AppHelpers,
    settingsShell: m.SettingsShell,
    helpUi: {
      openHelpModal: m.openHelpModal,
      closeHelpModal: m.closeHelpModal,
      openSupportModal: m.openSupportModal,
      closeSupportModal: m.closeSupportModal,
      initHelpWindowDrag: m.initHelpWindowDrag,
    },
    autoSwitch: {
      isAutoSwitchEnabled: m.isAutoSwitchEnabled,
      toggleAutoSwitch: m.toggleAutoSwitch,
      getAlternateModels: m.getAlternateModels,
      getModelLabel: m.getModelLabel,
      showAutoSwitchSettings: m.showAutoSwitchSettings,
      saveAutoSwitchList: m.saveAutoSwitchList,
      isRateLimitMessage: m.isRateLimitMessage,
      isTransientProviderError: m.isTransientProviderError,
      showAutoSwitchToast: m.showAutoSwitchToast,
    },
    settingsUi: m.SettingsUi,
    pluginRuntime: {
      PluginSystem: m.PluginSystem,
      PluginStorage: m.PluginStorage,
      MainApp: m.MainApp,
    },
    pluginManagerUi: m.PluginManagerUi,
    chatRender: m.ChatRender,
    conversations: m.Conversations,
    debugTools: m.DebugTools,
    rag: m.Rag,
    upload: m.Upload,
    chatSendPipeline: m.ChatSendPipeline,
    providerModels: m.ProviderModels,
    appUpdate: m.AppUpdate,
    chatProfile: m.ChatProfile,
    costOptimizerUi: m.CostOptimizerUi,
    securitySettingsUi: m.SecuritySettingsUi,
    inputProviderBridge: m.InputProviderBridge,
    mainAppBootstrap: m.MainAppBootstrap,
    workspace: m.Workspace,
    modelPersonasUi: m.ModelPersonasUi,
    pluginTools: m.PluginTools,
    stub: true,
  }
}
