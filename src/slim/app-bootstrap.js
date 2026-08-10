/**
 * 精简版入口初始化
 * Slim app bootstrap (vchat.php / Vite index)
 */
import { $, ensureCsrfMeta } from './utils.js'
import { mountAppShell } from './app-shell.js'
import {
  loadConversations,
  renderChatList,
  renderCurrentConversation,
} from './chat.js'
import {
  initSettingsControls,
  hydrateModelSelect,
  hydrateRouteModelSelects,
  refreshAllModels,
} from './settings.js'
import {
  initRouteUi,
  updateRouteIndicators,
  isRouteToastEnabled,
  showAppToast,
} from './ui-route-panel.js'
import { createComposerController } from './ui-composer.js'
import { registerComposerController } from './chat-send.js'
import {
  bindConversationEvents,
  bindSendAndComposerKeys,
} from './app-events.js'

export async function bootstrapSlimApp() {
  await ensureCsrfMeta()
  mountAppShell($('#app'))
  loadConversations()
  renderChatList()
  renderCurrentConversation()
  bindConversationEvents()
  initSettingsControls()

  const refreshBtn = $('#refreshModelsBtn')
  const composer = createComposerController({
    query: (id) => $(id),
    onImageReadError: (err) => {
      if (isRouteToastEnabled()) {
        showAppToast(`图片读取失败: ${err.message}`, 2200)
      }
    },
  })
  registerComposerController(composer)

  const refreshModels = async () => {
    if (refreshBtn) refreshBtn.disabled = true
    try {
      await refreshAllModels()
      hydrateModelSelect($('#modelSelect'))
      hydrateRouteModelSelects()
    } finally {
      if (refreshBtn) refreshBtn.disabled = false
    }
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshModels)
  }
  await refreshModels()
  composer?.updateImagePreview?.()
  composer?.bindComposerEvents?.()
  initRouteUi()
  updateRouteIndicators({ routed: false, task: 'chat', note: '初始化' })

  bindSendAndComposerKeys()
}
