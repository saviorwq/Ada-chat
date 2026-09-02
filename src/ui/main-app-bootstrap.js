/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 主应用：设置侧栏入口、DOMContentLoaded 后初始化（从 script.js 迁出）
 * Main app: settings sidebar panels + boot — migrated from script.js; caller: full-app-entry (`initAdaChatOnLoad`)
 */

import { installLegacyWindowDefaults } from '@/shim/legacy-window-defaults.js'

/**
 * 与插件 / 内联 handler 约定的全局默认值（实现见 src/shim/legacy-window-defaults.js）
 * Default globals for plugins / inline handlers (see legacy-window-defaults.js)
 */
export function installDefaultWindowGlobals() {
  installLegacyWindowDefaults()
}

function $(id) {
  return document.getElementById(id)
}

function pack() {
  const i18n = globalThis.AdaChatI18n || globalThis.i18n || { zh: {}, en: {} }
  const lang =
    typeof globalThis.currentLanguage === 'string'
      ? globalThis.currentLanguage
      : 'zh'
  return i18n[lang] || i18n.zh || {}
}

export function showPresetManager() {
  globalThis.setSettingsMenuActive('presetManagerMenuItem')
  globalThis.hideAllPanels()
  const panel = $('presetManagerPanel')
  if (panel) {
    panel.style.display = 'block'
    globalThis.renderPresetList()
    const targetPresetId =
      globalThis.currentActivePresetId?.system ||
      globalThis.currentActivePresetId?.role ||
      ''
    if (
      targetPresetId &&
      typeof globalThis.selectPresetForEdit === 'function'
    ) {
      globalThis.selectPresetForEdit(targetPresetId)
    } else {
      globalThis.clearPresetForm()
    }
  }
  const title = $('settingsContentTitle')
  if (title) title.textContent = pack().preset_manager
}

/** 人物脸部预设设置页 / Face character library settings panel */
export function showCharacterLibrarySettings() {
  if (typeof globalThis.setSettingsMenuActive === 'function') {
    globalThis.setSettingsMenuActive('characterLibraryMenuItem')
  }
  if (typeof globalThis.hideAllPanels === 'function') {
    globalThis.hideAllPanels()
  }
  const panel = $('characterLibraryPanel')
  if (panel) panel.style.display = 'block'
  const title = $('settingsContentTitle')
  if (title) {
    title.textContent =
      pack().character_library ||
      (typeof globalThis.currentLanguage === 'string' &&
      globalThis.currentLanguage !== 'zh'
        ? 'Face Character Presets'
        : '人物脸部预设')
  }
  if (typeof globalThis.wireCharacterLibraryUi === 'function') {
    globalThis.wireCharacterLibraryUi()
  }
  if (typeof globalThis.renderCharacterLibraryList === 'function') {
    void globalThis.renderCharacterLibraryList()
  }
}

export function showModelGeneralSettings() {
  globalThis.setSettingsMenuActive('timeoutMenuItem')
  globalThis.hideAllPanels()
  const panel = $('timeoutPanel')
  if (panel) {
    panel.style.display = 'block'
    const total = localStorage.getItem('timeoutTotal') || '600'
    const idle = localStorage.getItem('timeoutIdle') || '120'
    const temp = localStorage.getItem('samplingTemperature') || '0.7'
    const topP = localStorage.getItem('samplingTopP') || '1'
    const maxTokens = localStorage.getItem('samplingMaxTokens') || ''
    const presencePenalty =
      localStorage.getItem('samplingPresencePenalty') || '0'
    const frequencyPenalty =
      localStorage.getItem('samplingFrequencyPenalty') || '0'
    const stopSeq = localStorage.getItem('samplingStopSequences') || ''
    const intentRouteEnabled =
      localStorage.getItem('intentRouteEnabled') === '1'
    if ($('timeoutTotal')) $('timeoutTotal').value = total
    if ($('timeoutIdle')) $('timeoutIdle').value = idle
    if ($('samplingTemperature')) $('samplingTemperature').value = temp
    if ($('samplingTopP')) $('samplingTopP').value = topP
    if ($('samplingMaxTokens')) $('samplingMaxTokens').value = maxTokens
    if ($('samplingPresencePenalty'))
      $('samplingPresencePenalty').value = presencePenalty
    if ($('samplingFrequencyPenalty'))
      $('samplingFrequencyPenalty').value = frequencyPenalty
    if ($('samplingStopSequences')) $('samplingStopSequences').value = stopSeq
    if ($('intentRouteEnabled'))
      $('intentRouteEnabled').checked = intentRouteEnabled
    if (typeof globalThis.populateIntentRouteModelSelectors === 'function') {
      globalThis.populateIntentRouteModelSelectors()
    }
  }
  const title = $('settingsContentTitle')
  if (title) title.textContent = pack().timeout_settings
}

export function saveModelGeneralSettings() {
  const total = parseInt($('timeoutTotal')?.value, 10)
  const idle = parseInt($('timeoutIdle')?.value, 10)
  const temp = parseFloat($('samplingTemperature')?.value ?? '0.7')
  const topP = parseFloat($('samplingTopP')?.value ?? '1')
  const maxTokensRaw = ($('samplingMaxTokens')?.value ?? '').trim()
  const presencePenalty = parseFloat($('samplingPresencePenalty')?.value ?? '0')
  const frequencyPenalty = parseFloat(
    $('samplingFrequencyPenalty')?.value ?? '0'
  )
  const stopSeq = ($('samplingStopSequences')?.value ?? '').trim()
  const intentRouteEnabled = !!$('intentRouteEnabled')?.checked
  if (Number.isNaN(total) || total < 10) {
    alert('总超时必须≥10秒')
    return
  }
  if (Number.isNaN(idle) || idle < 10) {
    alert('空闲超时必须≥10秒')
    return
  }
  if (!Number.isFinite(temp) || temp < 0 || temp > 2) {
    alert('温度必须在 0.0 到 2.0 之间')
    return
  }
  if (!Number.isFinite(topP) || topP < 0 || topP > 1) {
    alert('Top P 必须在 0.0 到 1.0 之间')
    return
  }
  if (
    !Number.isFinite(presencePenalty) ||
    presencePenalty < -2 ||
    presencePenalty > 2
  ) {
    alert('Presence Penalty 必须在 -2.0 到 2.0 之间')
    return
  }
  if (
    !Number.isFinite(frequencyPenalty) ||
    frequencyPenalty < -2 ||
    frequencyPenalty > 2
  ) {
    alert('Frequency Penalty 必须在 -2.0 到 2.0 之间')
    return
  }
  if (maxTokensRaw !== '') {
    const maxTokens = parseInt(maxTokensRaw, 10)
    if (!Number.isFinite(maxTokens) || maxTokens < 1) {
      alert('Max Tokens 必须是正整数，或留空')
      return
    }
  }
  localStorage.setItem('timeoutTotal', String(total))
  localStorage.setItem('timeoutIdle', String(idle))
  localStorage.setItem('samplingTemperature', String(temp))
  localStorage.setItem('samplingTopP', String(topP))
  localStorage.setItem('samplingMaxTokens', maxTokensRaw)
  localStorage.setItem('samplingPresencePenalty', String(presencePenalty))
  localStorage.setItem('samplingFrequencyPenalty', String(frequencyPenalty))
  localStorage.setItem('samplingStopSequences', stopSeq)
  localStorage.setItem('intentRouteEnabled', intentRouteEnabled ? '1' : '0')
  const setRoute = globalThis.setIntentRouteDefaultModel
  if (typeof setRoute === 'function') {
    setRoute('image', $('intentRouteModelImage')?.value || '')
    setRoute('vision', $('intentRouteModelVision')?.value || '')
    setRoute('ocr', $('intentRouteModelOcr')?.value || '')
    setRoute('translation', $('intentRouteModelTranslation')?.value || '')
    setRoute('code', $('intentRouteModelCode')?.value || '')
  }
  alert(pack().timeout_saved)
}

/** 旧内联 / 扩展兼容 */
export const showTimeoutSettings = showModelGeneralSettings
export const saveTimeoutSettings = saveModelGeneralSettings

export function showLanguageSettings() {
  globalThis.setSettingsMenuActive('languageMenuItem')
  globalThis.hideAllPanels()
  const panel = $('languagePanel')
  if (panel) {
    panel.style.display = 'block'
    const sel = $('languageSelect')
    if (sel) sel.value = globalThis.currentLanguage || 'zh'
  }
  const title = $('settingsContentTitle')
  if (title) title.textContent = pack().language
}

export function showProfileSettings() {
  globalThis.setSettingsMenuActive('profileMenuItem')
  globalThis.hideAllPanels()
  const panel = $('profilePanel')
  if (panel) panel.style.display = 'block'
  const title = $('settingsContentTitle')
  if (title) title.textContent = pack().chat_profile

  const profile =
    typeof globalThis.loadChatProfileSettings === 'function'
      ? globalThis.loadChatProfileSettings()
      : { user: {}, assistant: {} }
  if ($('playerNickname')) $('playerNickname').value = profile.user?.name || ''
  if ($('playerAvatar')) $('playerAvatar').value = profile.user?.avatar || ''
  if ($('aiNickname')) $('aiNickname').value = profile.assistant?.name || ''
  if ($('aiAvatar')) $('aiAvatar').value = profile.assistant?.avatar || ''
  if ($('aiUserCallName'))
    $('aiUserCallName').value = profile.assistant?.callUserAs || ''
  if ($('playerAvatar'))
    $('playerAvatar').oninput = globalThis.refreshProfileAvatarPreviews
  if ($('aiAvatar'))
    $('aiAvatar').oninput = globalThis.refreshProfileAvatarPreviews
  if (typeof globalThis.refreshProfileAvatarPreviews === 'function')
    globalThis.refreshProfileAvatarPreviews()
}

export function saveProfileSettings() {
  const profile = {
    user: {
      name: ($('playerNickname')?.value || '').trim() || '你',
      avatar: ($('playerAvatar')?.value || '').trim(),
    },
    assistant: {
      name: ($('aiNickname')?.value || '').trim() || 'Ada',
      avatar: ($('aiAvatar')?.value || '').trim(),
      callUserAs: ($('aiUserCallName')?.value || '').trim(),
    },
  }
  if (typeof globalThis.saveChatProfileSettings === 'function')
    globalThis.saveChatProfileSettings(profile)
  if (typeof globalThis.refreshProfileAvatarPreviews === 'function')
    globalThis.refreshProfileAvatarPreviews()
  if (typeof globalThis.renderCurrentConversation === 'function')
    globalThis.renderCurrentConversation()
  alert(pack().save_profile || 'Profile saved')
}

export function showDebugSettings() {
  globalThis.setSettingsMenuActive('debugMenuItem')
  globalThis.hideAllPanels()
  const panel = $('debugPanel')
  if (panel) {
    panel.style.display = 'block'
    const toggle = $('debugModeToggle')
    if (toggle && typeof globalThis.isDebugModeEnabled === 'function') {
      toggle.checked = globalThis.isDebugModeEnabled()
    }
    if (typeof globalThis.refreshDebugLogs === 'function')
      globalThis.refreshDebugLogs()
    if (typeof globalThis.showDebugHelp === 'function')
      globalThis.showDebugHelp()
  }
  const title = $('settingsContentTitle')
  if (title) title.textContent = pack().debug_mode
}

const MENU_CLICK_WIRED_ATTR = 'data-adachat-menu-click-wired'

/**
 * 绑定设置左侧菜单项点击（与 initAdaChatOnLoad 解耦，便于在 openSettings 时兜底）
 * Wire settings sidebar menu clicks (decoupled so openSettings can re-run safely)
 */
export function wireSettingsMenuItemClicks() {
  const modal = document.getElementById('settingsModal')
  if (!modal) return

  const menuItems = {
    addProviderMenuItem: globalThis.showAddProvider,
    modelTypeManagerMenuItem: globalThis.showModelTypeManager,
    autoSwitchMenuItem: globalThis.showAutoSwitchSettings,
    presetManagerMenuItem: showPresetManager,
    ragMenuItem: globalThis.showRagSettings,
    localRuntimeMenuItem: () => {
      if (typeof globalThis.showLocalRuntimeSettings === 'function') {
        globalThis.showLocalRuntimeSettings()
      }
    },
    timeoutMenuItem: showModelGeneralSettings,
    updateMenuItem: () => {
      if (typeof globalThis.showUpdateCenter === 'function')
        globalThis.showUpdateCenter()
    },
    languageMenuItem: showLanguageSettings,
    profileMenuItem: showProfileSettings,
    skinMenuItem: globalThis.showSkinSettings,
    costOptimizerMenuItem: () => {
      if (typeof globalThis.showCostOptimizer === 'function')
        globalThis.showCostOptimizer()
    },
    passwordMenuItem: () => {
      if (typeof globalThis.showPasswordSettings === 'function')
        globalThis.showPasswordSettings()
    },
    pluginManagerMenuItem: () => {
      if (typeof globalThis.showPluginManager === 'function')
        globalThis.showPluginManager()
    },
    wordConversionMenuItem: globalThis.showWordConversion,
    characterLibraryMenuItem: showCharacterLibrarySettings,
    modeCapabilitiesMenuItem: globalThis.showModeCapabilities,
    debugMenuItem: showDebugSettings,
  }

  Object.entries(menuItems).forEach(([id, handler]) => {
    const el = document.getElementById(id)
    if (!el || typeof handler !== 'function') return
    if (el.getAttribute(MENU_CLICK_WIRED_ATTR) === '1') return
    el.addEventListener('click', () => {
      if (typeof globalThis.setSettingsMenuActive === 'function')
        globalThis.setSettingsMenuActive(id)
      handler()
    })
    el.setAttribute(MENU_CLICK_WIRED_ATTR, '1')
  })
}

/**
 * window.load：主题、语言、会话、供应商、RAG、插件、调试等一次性初始化
 */
export function initAdaChatOnLoad() {
  wireSettingsMenuItemClicks()

  if (
    typeof globalThis.applyThemeSettings === 'function' &&
    typeof globalThis.loadThemeSettings === 'function'
  ) {
    globalThis.applyThemeSettings(globalThis.loadThemeSettings())
  }
  if (typeof globalThis.loadLanguage === 'function') globalThis.loadLanguage()
  if (typeof globalThis.loadConversations === 'function')
    globalThis.loadConversations()
  if (typeof globalThis.loadProviders === 'function') {
    void globalThis.loadProviders()
    setTimeout(() => {
      const sel = $('providerSelect')
      if (!sel || sel.options.length !== 1 || sel.options[0].value !== '') return
      const label = String(sel.options[0].textContent || '')
      if (
        label.includes('加载供应商') ||
        label.includes('Loading providers') ||
        label.includes('加载失败') ||
        label.includes('failed') ||
        label.includes('暂无供应商') ||
        label.includes('No providers')
      ) {
        void globalThis.loadProviders()
      }
    }, 2500)
  }
  if (typeof globalThis.initDragAndDrop === 'function')
    globalThis.initDragAndDrop()
  if (typeof globalThis.initHelpWindowDrag === 'function')
    globalThis.initHelpWindowDrag()
  if (typeof globalThis.wireInputTranslateButton === 'function') {
    globalThis.wireInputTranslateButton()
  }
  if (typeof globalThis.initRuntimeMemoryPrompt === 'function') {
    globalThis.initRuntimeMemoryPrompt()
  }

  const cat = $('category')
  if (cat) cat.value = 'chat'
  if (typeof globalThis.onCategoryChange === 'function')
    globalThis.onCategoryChange()
  const imageModeEl = $('imageMode')
  if (imageModeEl) {
    imageModeEl.addEventListener('change', () => {
      if (typeof globalThis.onCategoryChange === 'function')
        globalThis.onCategoryChange()
    })
  }
  if (typeof globalThis.loadPresets === 'function') globalThis.loadPresets()
  if (typeof globalThis.applyPresetBoundChatModel === 'function')
    globalThis.applyPresetBoundChatModel(true)
  if (typeof globalThis.loadWordConversions === 'function')
    globalThis.loadWordConversions()
  if (typeof globalThis.wireCharacterLibraryUi === 'function') {
    globalThis.wireCharacterLibraryUi()
  }

  const autoSwitchToggle = $('autoSwitchToggle')
  if (
    autoSwitchToggle &&
    typeof globalThis.isAutoSwitchEnabled === 'function'
  ) {
    autoSwitchToggle.checked = globalThis.isAutoSwitchEnabled()
  }
  const autoSwitchLabel = $('autoSwitchLabel')
  if (autoSwitchLabel && typeof globalThis.loadProviders === 'function') {
    const lang =
      typeof globalThis.currentLanguage === 'string'
        ? globalThis.currentLanguage
        : 'zh'
    autoSwitchLabel.title =
      lang === 'zh'
        ? '自动切换模型（双击重新加载供应商/模型）'
        : 'Auto-switch model (double-click to reload providers/models)'
    autoSwitchLabel.addEventListener('dblclick', () => {
      void globalThis.loadProviders()
    })
  }

  setTimeout(() => {
    const PS = globalThis.PluginSystem
    if (PS && typeof PS.getAllPlugins === 'function') {
      const plugins = PS.getAllPlugins()
      if (plugins.length > 0) {
        console.log(
          `已加载 ${plugins.length} 个插件:`,
          plugins.map((p) => p.id)
        )
      }
    }
  }, 500)

  if (typeof globalThis.refreshDebugLogs === 'function')
    globalThis.refreshDebugLogs()
  const debugToggle = $('debugModeToggle')
  if (debugToggle && typeof globalThis.isDebugModeEnabled === 'function') {
    debugToggle.checked = globalThis.isDebugModeEnabled()
  }
  if (typeof globalThis.loadRagSettings === 'function')
    globalThis.loadRagSettings()
  if (typeof globalThis.loadRagStore === 'function') globalThis.loadRagStore()
  if (typeof globalThis.rebuildRagIndex === 'function')
    globalThis.rebuildRagIndex()
  const ragFileInput = $('ragFileInput')
  if (ragFileInput && typeof globalThis.importRagFiles === 'function') {
    ragFileInput.addEventListener('change', async (e) => {
      await globalThis.importRagFiles(e.target.files)
      e.target.value = ''
    })
  }
  const ragFolderInput = $('ragFolderInput')
  if (ragFolderInput && typeof globalThis.importRagFolder === 'function') {
    ragFolderInput.addEventListener('change', async (e) => {
      await globalThis.importRagFolder(e.target.files)
      e.target.value = ''
    })
  }

  if (typeof globalThis.initAppUpdateOnLoad === 'function')
    globalThis.initAppUpdateOnLoad()

  if (typeof globalThis.initWorkspaceUi === 'function') {
    globalThis.initWorkspaceUi()
  }
  if (typeof globalThis.initModelPersonasUi === 'function') {
    globalThis.initModelPersonasUi()
  }

  // 右下角彻底退出；后台 ensure 延后，避免与 get_providers 抢单线程 PHP
  // Quit FAB; delay ensure so provider list is not blocked on PHP built-in server
  if (typeof globalThis.mountQuitFab === 'function') {
    globalThis.mountQuitFab()
  }
  if (typeof globalThis.ensureLocalBackgroundServices === 'function') {
    setTimeout(() => {
      void globalThis.ensureLocalBackgroundServices()
    }, 4000)
  }
  if (typeof globalThis.probeAndStoreLocalCtxTokens === 'function') {
    setTimeout(() => {
      void globalThis.probeAndStoreLocalCtxTokens()
    }, 5000)
  }
}

/**
 * 与 script.js 一致：无 removePreview 时提供兜底（依赖 upload 的 marker 清理函数）
 */
export function installRemovePreviewFallback() {
  if (typeof globalThis === 'undefined') return
  globalThis.removePreview =
    globalThis.removePreview ||
    function () {
      const preview = $('preview')
      const previewContainer = $('previewContainer')
      const fileInput = $('file-input')
      if (preview) {
        preview.src = ''
        preview.style.display = 'none'
      }
      if (previewContainer) {
        previewContainer.style.display = 'none'
      }
      if (typeof globalThis.currentBase64 !== 'undefined') {
        globalThis.currentBase64 = ''
      }
      if (typeof globalThis.currentUploadMeta !== 'undefined') {
        globalThis.currentUploadMeta = null
      }
      if (typeof globalThis.currentPdfText !== 'undefined') {
        globalThis.currentPdfText = ''
      }
      if (typeof globalThis.currentFileText !== 'undefined') {
        globalThis.currentFileText = ''
      }
      if (typeof globalThis.currentPdfPageImages !== 'undefined') {
        globalThis.currentPdfPageImages = []
      }
      if (typeof globalThis.removeImageMarkerFromInput === 'function')
        globalThis.removeImageMarkerFromInput()
      if (typeof globalThis.removeFileMarkerFromInput === 'function')
        globalThis.removeFileMarkerFromInput()
      if (typeof globalThis.clearMusicCoverSource === 'function') {
        globalThis.clearMusicCoverSource()
      } else {
        globalThis.musicCoverSourceId = ''
        globalThis.musicCoverSourceName = ''
      }
      if (fileInput) fileInput.value = ''
    }
}
