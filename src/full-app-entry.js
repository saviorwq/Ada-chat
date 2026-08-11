/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 完整 Ada Chat 的 ESM 入口（Vite full bundle）
 * Full-app ESM entry (Vite full bundle)
 *
 * 注意：完整版样式也应通过 Vite 构建产物注入（dist/.vite/manifest.json）。
 * Note: Full app CSS should be injected via Vite build output (manifest).
 */
import '../style.css'
/** AI.php 页面：预览区 / removePreview / 输入框高度（原内联脚本） */
import '@/ui/ai-page-dom-bootstrap.js'
import AdaChatModeConfig from '@/config/mode-config.js'
import ADA_CHAT_I18N from '@/i18n/packs.js'
import * as AppHelpers from '@/ui/app-helpers.js'
import {
  openHelpModal,
  closeHelpModal,
  openSupportModal,
  closeSupportModal,
  initHelpWindowDrag,
} from '@/ui/help-modal.js'
import {
  isAutoSwitchEnabled,
  toggleAutoSwitch,
  getAlternateModels,
  getModelLabel,
  showAutoSwitchSettings,
  saveAutoSwitchList,
  isRateLimitMessage,
  isTransientProviderError,
  showAutoSwitchToast,
} from '@/ui/auto-switch.js'
import * as SettingsShell from '@/ui/settings-shell.js'
import * as SettingsUi from '@/ui/settings-ui.js'
import { PluginSystem, PluginStorage, MainApp } from '@/ui/plugin-runtime.js'
import * as PluginManagerUi from '@/ui/plugin-manager-ui.js'
import * as ChatRender from '@/ui/chat-render.js'
import * as Conversations from '@/ui/conversations.js'
import * as DebugTools from '@/ui/debug-tools.js'
import * as Rag from '@/ui/rag.js'
import * as Upload from '@/ui/upload.js'
import * as ChatSendPipeline from '@/ui/chat-send-pipeline.js'
import * as ProviderModels from '@/ui/provider-models.js'
import * as AppUpdate from '@/ui/app-update.js'
import * as ChatProfile from '@/ui/chat-profile.js'
import * as CostOptimizerUi from '@/ui/cost-optimizer-ui.js'
import * as LocalRuntimeUi from '@/ui/local-runtime-ui.js'
import * as SecuritySettingsUi from '@/ui/security-settings-ui.js'
import * as InputProviderBridge from '@/ui/input-provider-bridge.js'
import * as MainAppBootstrap from '@/ui/main-app-bootstrap.js'
import * as Workspace from '@/ui/workspace.js'
import * as ModelPersonasUi from '@/ui/model-personas-ui.js'
import * as PluginTools from '@/ui/plugin-tools.js'
import { installFullAppGlobals } from '@/shim/install-full-app-globals.js'

/** 侧效应：防止生产构建把入口裁成空块、导致 full.html 丢失 script */
if (typeof globalThis !== 'undefined') {
  // Tool router 需在 AdaPlugin.register 之前挂到 globalThis
  globalThis.AdaPluginTools = PluginTools
  installFullAppGlobals({
    AdaChatModeConfig,
    ADA_CHAT_I18N,
    AppHelpers,
    SettingsShell,
    openHelpModal,
    closeHelpModal,
    openSupportModal,
    closeSupportModal,
    initHelpWindowDrag,
    isAutoSwitchEnabled,
    toggleAutoSwitch,
    getAlternateModels,
    getModelLabel,
    showAutoSwitchSettings,
    saveAutoSwitchList,
    isRateLimitMessage,
    isTransientProviderError,
    showAutoSwitchToast,
    SettingsUi,
    PluginManagerUi,
    PluginSystem,
    PluginStorage,
    MainApp,
    ChatRender,
    Conversations,
    DebugTools,
    Rag,
    Upload,
    ChatSendPipeline,
    ProviderModels,
    AppUpdate,
    ChatProfile,
    CostOptimizerUi,
    LocalRuntimeUi,
    SecuritySettingsUi,
    InputProviderBridge,
    MainAppBootstrap,
    Workspace,
    ModelPersonasUi,
    PluginTools,
  })
}

/**
 * 设置侧栏、主题/语言/会话等一次性初始化（原 script.js DOMContentLoaded）
 * Settings sidebar + app boot — previously wired in script.js on DOMContentLoaded
 */
function scheduleInitAdaChatOnLoad() {
  const run = () => {
    if (typeof globalThis.initAdaChatOnLoad === 'function') {
      globalThis.initAdaChatOnLoad()
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true })
  } else {
    run()
  }
}
scheduleInitAdaChatOnLoad()

if (import.meta.env.DEV) {
  console.info(
    '[AdaChat full-app-entry] loaded; escapeHtml:',
    typeof AppHelpers.escapeHtml === 'function',
    'AdaChatModeConfig:',
    typeof globalThis.AdaChatModeConfig?.getUploadAccept === 'function',
    'AdaChatI18n.zh:',
    typeof globalThis.AdaChatI18n?.zh === 'object',
    'openHelpModal:',
    typeof globalThis.openHelpModal === 'function',
    'loadThemeSettings:',
    typeof globalThis.loadThemeSettings === 'function',
    'PluginSystem:',
    typeof globalThis.PluginSystem?.runHook === 'function',
    'buildMessageRow:',
    typeof globalThis.buildMessageRow === 'function',
    'addDebugLog:',
    typeof globalThis.addDebugLog === 'function',
    'previewAndCompress:',
    typeof globalThis.previewAndCompress === 'function'
  )
}

export {
  AdaChatModeConfig,
  ADA_CHAT_I18N,
  openHelpModal,
  closeHelpModal,
  openSupportModal,
  closeSupportModal,
  initHelpWindowDrag,
  isAutoSwitchEnabled,
  toggleAutoSwitch,
  getAlternateModels,
  getModelLabel,
  showAutoSwitchSettings,
  saveAutoSwitchList,
  isRateLimitMessage,
  showAutoSwitchToast,
}

export * from '@/ui/app-helpers.js'
export * from '@/ui/settings-shell.js'
export * from '@/ui/settings-ui.js'
export { PluginSystem, PluginStorage, MainApp } from '@/ui/plugin-runtime.js'
export * from '@/ui/plugin-manager-ui.js'
export * from '@/ui/chat-render.js'
export * from '@/ui/conversations.js'
export * from '@/ui/debug-tools.js'
export * from '@/ui/upload.js'
export * from '@/ui/chat-send-pipeline.js'
export * from '@/ui/provider-models.js'
export * from '@/ui/rag.js'
export * from '@/ui/app-update.js'
export * from '@/ui/chat-profile.js'
export * from '@/ui/cost-optimizer-ui.js'
export * from '@/ui/security-settings-ui.js'
export * from '@/ui/input-provider-bridge.js'
export * from '@/ui/main-app-bootstrap.js'
export * from '@/ui/workspace.js'
export * from '@/ui/model-personas-ui.js'
export * from '@/ui/plugin-tools.js'
