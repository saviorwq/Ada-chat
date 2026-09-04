/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 工作台 UI：启动页五入口 + 模式切换 + 侧栏/控件分层
 * Workspace UI: launcher + mode switch + chrome layering
 */

import {
  WORKSPACE_MODES,
  WORKSPACE_LAUNCHER_DISMISSED_KEY,
  getWorkspaceModeById,
  readStoredWorkspaceMode,
  writeStoredWorkspaceMode,
} from '@/config/workspace-modes.js'

function $(id) {
  return document.getElementById(id)
}

function getLang() {
  return typeof globalThis.currentLanguage === 'string'
    ? globalThis.currentLanguage
    : 'zh'
}

function pack() {
  const i18n = globalThis.AdaChatI18n || globalThis.i18n || { zh: {}, en: {} }
  return i18n[getLang()] || i18n.zh || {}
}

function t(key, fallback) {
  const p = pack()
  return p[key] || fallback || key
}

let currentModeId = 'chat'

const MODE_PLACEHOLDERS = {
  chat: {
    zh: '问问 Ada… Enter 发送，Ctrl+Enter 换行',
    en: 'Ask Ada… Enter to send, Ctrl+Enter for newline',
  },
  create: {
    zh: '选一条路径：文生图 · Cover 伴奏 · 或打开 CYOA…',
    en: 'Pick a path: text-to-image · Cover · or open CYOA…',
  },
  dev: {
    zh: '描述功能、粘贴报错或代码，让编程助手帮你',
    en: 'Describe a feature, paste an error or code for the coding assistant',
  },
  knowledge: {
    zh: '基于已导入的知识库提问…',
    en: 'Ask questions based on your imported knowledge…',
  },
  lab: {
    zh: '实验室模式：可切换供应商、模型与插件',
    en: 'Lab mode: switch providers, models, and plugins',
  },
}

const EMPTY_PROMPTS = {
  chat: {
    zh: ['用简单话解释量子纠缠', '帮我写一封礼貌的请假邮件', '今天有什么值得关注的科技趋势？'],
    en: ['Explain quantum entanglement simply', 'Draft a polite leave email', 'What tech trends matter today?'],
  },
  create: {
    zh: [
      {
        label: '① 文生图：赛博朋克雨夜街头',
        action: 'image',
        fill: '赛博朋克雨夜街头，电影感宽画幅，霓虹倒影',
      },
      {
        label: '② Cover 伴奏：冷民谣纯配器',
        action: 'music_cover',
        fill: 'cold indie folk instrumental, sparse guitar, 68 bpm, no vocals',
      },
      {
        label: '③ 打开 CYOA 文字冒险',
        action: 'cyoa',
        fill: '',
      },
    ],
    en: [
      {
        label: '① Image: cyberpunk rainy street',
        action: 'image',
        fill: 'Cyberpunk rainy street, cinematic wide shot, neon reflections',
      },
      {
        label: '② Cover: cold indie folk bed',
        action: 'music_cover',
        fill: 'cold indie folk instrumental, sparse guitar, 68 bpm, no vocals',
      },
      {
        label: '③ Open CYOA adventure',
        action: 'cyoa',
        fill: '',
      },
    ],
  },
  dev: {
    zh: ['用 Python 写一个并发下载器骨架', '这段报错怎么修？先问我要日志', '把这个函数改成更易测试的写法'],
    en: ['Python skeleton for a concurrent downloader', 'How to fix this error? Ask me for logs first', 'Refactor this function to be testable'],
  },
  knowledge: {
    zh: ['总结知识库里关于设定的要点', '根据资料回答：主角的动机是什么？', '找出资料中互相矛盾的地方'],
    en: ['Summarize key lore from the knowledge base', 'From the docs: what motivates the protagonist?', 'Find contradictions in the materials'],
  },
  lab: {
    zh: ['检测本地推理是否就绪', '对比两个模型的回答风格', '打开插件管理看看能扩展什么'],
    en: ['Check if local inference is ready', 'Compare answer styles of two models', 'Open plugin manager for extensions'],
  },
}

export function getCurrentWorkspaceMode() {
  return currentModeId
}

function isLauncherDismissed() {
  try {
    return localStorage.getItem(WORKSPACE_LAUNCHER_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function setLauncherDismissed(v) {
  try {
    localStorage.setItem(WORKSPACE_LAUNCHER_DISMISSED_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function ensureWorkspaceDom() {
  if ($('workspaceLauncher')) return

  const launcher = document.createElement('div')
  launcher.id = 'workspaceLauncher'
  launcher.className = 'workspace-launcher'
  launcher.setAttribute('aria-hidden', 'true')
  launcher.innerHTML = `
    <div class="workspace-launcher__backdrop" data-workspace-dismiss></div>
    <div class="workspace-launcher__panel" role="dialog" aria-labelledby="workspaceLauncherTitle">
      <div class="workspace-launcher__brand">
        <div class="workspace-launcher__logo">Ada</div>
        <h1 id="workspaceLauncherTitle" class="workspace-launcher__title">${t('workspace_title', 'Ada Chat 工作台')}</h1>
        <p class="workspace-launcher__subtitle">${t('workspace_subtitle', '选择你想做的事，其余高级能力收进实验室。')}</p>
      </div>
      <div class="workspace-launcher__grid" id="workspaceLauncherGrid"></div>
      <button type="button" class="workspace-launcher__skip" data-workspace-dismiss>
        ${t('workspace_skip', '继续当前会话')}
      </button>
    </div>
  `
  document.body.appendChild(launcher)

  const modeBar = document.createElement('div')
  modeBar.id = 'workspaceModeBar'
  modeBar.className = 'workspace-mode-bar'
  const sidebarHeader = document.querySelector('.sidebar-header')
  if (sidebarHeader) {
    sidebarHeader.insertAdjacentElement('afterend', modeBar)
  } else {
    document.querySelector('.sidebar')?.prepend(modeBar)
  }

  const homeBtn = document.createElement('button')
  homeBtn.type = 'button'
  homeBtn.id = 'workspaceHomeBtn'
  homeBtn.className = 'settings-btn-bottom workspace-home-btn'
  homeBtn.textContent = t('workspace_home', '🏠 工作台')
  homeBtn.addEventListener('click', () => openWorkspaceLauncher({ force: true }))
  const footer = document.querySelector('.sidebar-footer')
  if (footer) footer.insertBefore(homeBtn, footer.firstChild)
}

function renderLauncherCards() {
  const grid = $('workspaceLauncherGrid')
  if (!grid) return
  grid.innerHTML = ''
  WORKSPACE_MODES.forEach((mode) => {
    const card = document.createElement('button')
    card.type = 'button'
    card.className =
      'workspace-card' + (mode.id === currentModeId ? ' is-active' : '')
    card.dataset.mode = mode.id
    card.innerHTML = `
      <span class="workspace-card__icon">${mode.icon}</span>
      <span class="workspace-card__title">${t(mode.titleKey, mode.id)}</span>
      <span class="workspace-card__desc">${t(mode.descKey, '')}</span>
    `
    card.addEventListener('click', () => {
      applyWorkspaceMode(mode.id, { fromLauncher: true })
      closeWorkspaceLauncher()
    })
    grid.appendChild(card)
  })
}

function renderModeBar() {
  const bar = $('workspaceModeBar')
  if (!bar) return
  bar.innerHTML = ''
  WORKSPACE_MODES.forEach((mode) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className =
      'workspace-mode-chip' + (mode.id === currentModeId ? ' is-active' : '')
    btn.title = t(mode.descKey, '')
    btn.textContent = `${mode.icon} ${t(mode.titleKey, mode.id)}`
    btn.addEventListener('click', () => applyWorkspaceMode(mode.id))
    bar.appendChild(btn)
  })
}

function syncCategoryOptions(mode) {
  const select = $('category')
  if (!select) return
  const allow = mode.categoryAllow
  Array.from(select.options).forEach((opt) => {
    const ok = !allow || allow.includes(opt.value)
    opt.hidden = !ok
    opt.disabled = !ok
  })
  if (allow && !allow.includes(select.value)) {
    select.value = mode.defaultCategory
  } else if (!select.value) {
    select.value = mode.defaultCategory
  }
}

function syncAdvancedControls(mode) {
  const advanced = !!mode.showAdvancedControls
  document.body.classList.toggle('workspace-mode-lab', advanced)
  document.body.dataset.workspaceMode = mode.id

  document.querySelectorAll('.workspace-advanced-only').forEach((el) => {
    el.hidden = !advanced
    if (el instanceof HTMLElement) {
      el.style.display = advanced ? '' : 'none'
    }
  })

  // 非实验室：分类收进次要位置，优先角色卡
  const category = $('category')
  if (category) {
    category.classList.toggle('workspace-control--secondary', !advanced)
    if (!advanced && mode.id !== 'lab') {
      // 保留可用，但视觉降权
      category.title = t('workspace_category_hint', '任务类型（也可通过角色卡切换）')
    }
  }
}

function syncPlaceholder(modeId) {
  const msg = $('msg')
  if (!msg) return
  const lang = getLang() === 'zh' ? 'zh' : 'en'
  const map = MODE_PLACEHOLDERS[modeId] || MODE_PLACEHOLDERS.chat
  msg.placeholder = map[lang] || map.zh
}

function isCurrentChatEmpty() {
  const convs = globalThis.conversations
  const id = globalThis.currentConvId
  if (!Array.isArray(convs)) return true
  const conv = convs.find((c) => c.id === id)
  return !conv || !Array.isArray(conv.messages) || conv.messages.length === 0
}

function applyCreatePath(item) {
  const action = typeof item === 'string' ? 'fill' : String(item?.action || 'fill')
  const fill = typeof item === 'string' ? item : String(item?.fill || '')

  if (action === 'cyoa') {
    openAdaStudio()
    return
  }

  const cat = $('category')
  if (action === 'image' && cat) {
    cat.value = 'image'
  } else if (action === 'music_cover' && cat) {
    cat.value = 'music'
    const task = $('musicTaskType')
    if (task) task.value = 'cover'
    try {
      localStorage.setItem('adachat_music_task_type', 'cover')
    } catch {
      /* ignore */
    }
  }

  if (typeof globalThis.onCategoryChange === 'function') {
    globalThis.onCategoryChange()
  }
  if (action === 'music_cover' && typeof globalThis.syncMusicTaskTypeUi === 'function') {
    globalThis.syncMusicTaskTypeUi()
  }

  const msg = $('msg')
  if (msg && fill) {
    msg.value = fill
    msg.focus()
    msg.dispatchEvent(new Event('input', { bubbles: true }))
  } else {
    $('msg')?.focus()
  }
}

export function renderWorkspaceEmptyState() {
  const el = $('workspaceEmptyState')
  const log = $('log')
  if (!el) return
  const empty = isCurrentChatEmpty()
  const launcherOpen = !!$('workspaceLauncher')?.classList.contains('is-open')
  const show = empty && !launcherOpen
  el.hidden = !show
  if (log) log.classList.toggle('is-empty-chat', show)
  if (!show) return

  const lang = getLang() === 'zh' ? 'zh' : 'en'
  const title = $('workspaceEmptyTitle')
  const desc = $('workspaceEmptyDesc')
  const prompts = $('workspaceEmptyPrompts')
  if (title) {
    title.textContent =
      lang === 'zh'
        ? `${t('workspace_' + currentModeId, currentModeId)} · 开始`
        : `${t('workspace_' + currentModeId, currentModeId)} · Start`
  }
  if (desc) {
    desc.textContent = t(
      'workspace_' + currentModeId + '_desc',
      t('workspace_subtitle', '')
    )
  }
  if (prompts) {
    prompts.innerHTML = ''
    const list = (EMPTY_PROMPTS[currentModeId] || EMPTY_PROMPTS.chat)[lang] || []
    list.forEach((item) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'workspace-empty__prompt'
      const label =
        typeof item === 'string' ? item : String(item?.label || item?.fill || '')
      btn.textContent = label
      btn.addEventListener('click', () => {
        if (currentModeId === 'create' && typeof item === 'object') {
          applyCreatePath(item)
          return
        }
        const msg = $('msg')
        const text = typeof item === 'string' ? item : String(item?.fill || label)
        if (msg) {
          msg.value = text
          msg.focus()
          msg.dispatchEvent(new Event('input', { bubbles: true }))
        }
      })
      prompts.appendChild(btn)
    })
  }
}

function openStudioEntry() {
  const studio = $('adaStudioBanner')
  if (studio) studio.hidden = false
}

function hideStudioEntry() {
  const studio = $('adaStudioBanner')
  if (studio) studio.hidden = true
}

function syncKnowledgeDock(mode, opts = {}) {
  const dock = $('knowledgeDock')
  if (!dock) return
  const show = mode.id === 'knowledge'
  dock.hidden = !show
  if (!show) return
  refreshKnowledgeDock()
  if (opts.fromLauncher && opts.openSettings) {
    // 仅首次进入时可选打开设置；默认留在主界面摘要条
  }
}

export function refreshKnowledgeDock() {
  const statsEl = $('knowledgeDockStats')
  const hitsEl = $('knowledgeDockHits')
  const toggle = $('knowledgeDockRagEnable')
  const lang = getLang() === 'zh'

  let cols = []
  let hits = []
  let enabled = false
  try {
    if (typeof globalThis.getRagCollectionsSummary === 'function') {
      cols = globalThis.getRagCollectionsSummary() || []
    }
    if (typeof globalThis.getRagLastHits === 'function') {
      hits = globalThis.getRagLastHits() || []
    }
    const saved = localStorage.getItem('adachat_rag_settings_v1')
    if (saved) {
      const parsed = JSON.parse(saved)
      enabled = !!parsed.enabled
    }
  } catch {
    /* ignore */
  }

  if (toggle && toggle.checked !== enabled) toggle.checked = enabled

  const docCount = cols.reduce((s, c) => s + (c.docs || 0), 0)
  const chunkCount = cols.reduce((s, c) => s + (c.chunks || 0), 0)
  if (statsEl) {
    statsEl.textContent = lang
      ? `${cols.length} 个库 · ${docCount} 文件 · ${chunkCount} chunks · RAG ${enabled ? '开' : '关'}`
      : `${cols.length} bases · ${docCount} files · ${chunkCount} chunks · RAG ${enabled ? 'on' : 'off'}`
  }
  if (hitsEl) {
    if (!hits.length) {
      hitsEl.textContent = t(
        'rag_hits_empty',
        lang ? '暂无检索命中记录' : 'No retrieval hits yet'
      )
    } else {
      hitsEl.innerHTML = hits
        .slice(0, 3)
        .map((h) => {
          const title = `${h.docName || ''}#${(h.chunkIndex || 0) + 1}`
          return `<div class="knowledge-dock__hit">${escapeBasic(title)}</div>`
        })
        .join('')
    }
  }
}

function escapeBasic(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 打开 CYOA / Ada Studio：启用插件并进入其设置面板
 * Open CYOA / Ada Studio: enable plugin and open its settings
 */
export function openAdaStudio() {
  const MainApp = globalThis.MainApp
  if (MainApp && !MainApp.isPluginEnabled?.('cyoa')) {
    MainApp.setPluginEnabled?.('cyoa', true)
  }
  if (typeof globalThis.openSettings === 'function') {
    globalThis.openSettings()
  }
  setTimeout(() => {
    if (typeof globalThis.configurePlugin === 'function') {
      globalThis.configurePlugin('cyoa')
    } else if (typeof globalThis.showPluginManager === 'function') {
      globalThis.showPluginManager()
    }
  }, 80)
}

export function applyWorkspaceMode(modeId, opts = {}) {
  const mode = getWorkspaceModeById(modeId)
  currentModeId = mode.id
  writeStoredWorkspaceMode(mode.id)
  if (opts.fromLauncher) setLauncherDismissed(true)

  syncCategoryOptions(mode)
  syncAdvancedControls(mode)
  syncPlaceholder(mode.id)
  renderModeBar()

  const cat = $('category')
  if (cat && cat.value !== mode.defaultCategory) {
    cat.value = mode.defaultCategory
  }
  if (typeof globalThis.onCategoryChange === 'function') {
    globalThis.onCategoryChange()
  }

  if (mode.openStudio) openStudioEntry()
  else hideStudioEntry()

  syncKnowledgeDock(mode, opts)

  // 知识库模式：主界面摘要优先；仅显式要求时打开设置
  if (mode.openRag && opts.fromLauncher && opts.openRagSettings) {
    if (typeof globalThis.openSettings === 'function') globalThis.openSettings()
    setTimeout(() => {
      if (typeof globalThis.showRagSettings === 'function') {
        globalThis.showRagSettings()
      }
    }, 80)
  }

  document.dispatchEvent(
    new CustomEvent('workspaceModeChanged', { detail: { modeId: mode.id } })
  )

  if (typeof globalThis.renderModelPersonas === 'function') {
    globalThis.renderModelPersonas()
  }
  renderWorkspaceEmptyState()
}

export function openWorkspaceLauncher(opts = {}) {
  ensureWorkspaceDom()
  renderLauncherCards()
  const el = $('workspaceLauncher')
  if (!el) return
  if (!opts.force && isLauncherDismissed()) return
  el.classList.add('is-open')
  el.setAttribute('aria-hidden', 'false')
  renderWorkspaceEmptyState()
}

export function closeWorkspaceLauncher() {
  const el = $('workspaceLauncher')
  if (!el) return
  el.classList.remove('is-open')
  el.setAttribute('aria-hidden', 'true')
  setLauncherDismissed(true)
  renderWorkspaceEmptyState()
}

function maybeShowLauncherOnEmptyChat() {
  if (isLauncherDismissed()) {
    renderWorkspaceEmptyState()
    return
  }
  if (isCurrentChatEmpty()) openWorkspaceLauncher({ force: true })
  else renderWorkspaceEmptyState()
}

function wireKnowledgeDock() {
  const manage = $('knowledgeDockManageBtn')
  if (manage && !manage.dataset.wired) {
    manage.dataset.wired = '1'
    manage.addEventListener('click', () => {
      if (typeof globalThis.openSettings === 'function') globalThis.openSettings()
      setTimeout(() => {
        if (typeof globalThis.showRagSettings === 'function') {
          globalThis.showRagSettings()
        }
      }, 60)
    })
  }
  const toggle = $('knowledgeDockRagEnable')
  if (toggle && !toggle.dataset.wired) {
    toggle.dataset.wired = '1'
    toggle.addEventListener('change', () => {
      try {
        const raw = localStorage.getItem('adachat_rag_settings_v1')
        const settings = raw ? JSON.parse(raw) : {}
        settings.enabled = !!toggle.checked
        localStorage.setItem('adachat_rag_settings_v1', JSON.stringify(settings))
        if ($('ragEnable')) $('ragEnable').checked = !!toggle.checked
        if (typeof globalThis.loadRagSettings === 'function') {
          globalThis.loadRagSettings()
        }
      } catch {
        /* ignore */
      }
      refreshKnowledgeDock()
    })
  }
}

export function initWorkspaceUi() {
  ensureWorkspaceDom()
  wireKnowledgeDock()

  const launcher = $('workspaceLauncher')
  launcher?.addEventListener('click', (e) => {
    const target = e.target
    if (target && target.closest && target.closest('[data-workspace-dismiss]')) {
      closeWorkspaceLauncher()
    }
  })

  document.addEventListener('keydown', (e) => {
    if (
      e.key === 'Escape' &&
      $('workspaceLauncher')?.classList.contains('is-open')
    ) {
      closeWorkspaceLauncher()
    }
  })

  const studioBtn = $('adaStudioOpenBtn')
  if (studioBtn && !studioBtn.dataset.wired) {
    studioBtn.dataset.wired = '1'
    studioBtn.addEventListener('click', () => openAdaStudio())
  }
  const studioImageBtn = $('adaStudioImageBtn')
  if (studioImageBtn && !studioImageBtn.dataset.wired) {
    studioImageBtn.dataset.wired = '1'
    studioImageBtn.addEventListener('click', () => {
      applyCreatePath({ action: 'image', fill: '' })
    })
  }
  const studioMusicBtn = $('adaStudioMusicBtn')
  if (studioMusicBtn && !studioMusicBtn.dataset.wired) {
    studioMusicBtn.dataset.wired = '1'
    studioMusicBtn.addEventListener('click', () => {
      applyCreatePath({
        action: 'music_cover',
        fill: '',
      })
      if (typeof globalThis.showAppToast === 'function') {
        globalThis.showAppToast(
          getLang() === 'zh'
            ? 'Cover：请先 📁 上传源曲 WAV，再发送风格 Prompt'
            : 'Cover: upload source WAV, then send a style prompt',
          3600
        )
      }
    })
  }

  document.addEventListener('workspaceModeChanged', () => {
    refreshKnowledgeDock()
    renderWorkspaceEmptyState()
  })

  applyWorkspaceMode(readStoredWorkspaceMode())
  setTimeout(maybeShowLauncherOnEmptyChat, 400)

  // 会话切换/新对话后刷新空状态
  const _newChat = globalThis.newChat
  if (typeof _newChat === 'function' && !_newChat.__workspaceWrapped) {
    const wrapped = function (...args) {
      const ret = _newChat.apply(this, args)
      setTimeout(renderWorkspaceEmptyState, 0)
      return ret
    }
    wrapped.__workspaceWrapped = true
    globalThis.newChat = wrapped
  }
  const _switchChat = globalThis.switchChat
  if (typeof _switchChat === 'function' && !_switchChat.__workspaceWrapped) {
    const wrapped = function (...args) {
      const ret = _switchChat.apply(this, args)
      setTimeout(renderWorkspaceEmptyState, 0)
      return ret
    }
    wrapped.__workspaceWrapped = true
    globalThis.switchChat = wrapped
  }
  const _render = globalThis.renderCurrentConversation
  if (typeof _render === 'function' && !_render.__workspaceWrapped) {
    const wrapped = function (...args) {
      const ret = _render.apply(this, args)
      setTimeout(renderWorkspaceEmptyState, 0)
      return ret
    }
    wrapped.__workspaceWrapped = true
    globalThis.renderCurrentConversation = wrapped
  }
}
