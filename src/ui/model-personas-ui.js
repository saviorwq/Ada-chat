/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 模型角色卡 UI — 内置推荐 + 自定义角色卡 2.0
 * Model persona UI — built-in picks + custom Persona 2.0
 */

import {
  MODEL_PERSONAS,
  getPersonaById,
  readActivePersonaId,
  writeActivePersonaId,
  readCustomPersonas,
  upsertCustomPersona,
  deleteCustomPersona,
  newCustomPersonaId,
  applyPersonaRuntimeOverrides,
  clearPersonaRuntimeOverrides,
  getEffectivePersonaSystemHint,
  capturePersonaRuntimeSnapshot,
  beginRequestPersonaRuntime,
  endRequestPersonaRuntime,
  getRequestPersonaRuntime,
  getEffectiveRagOverride,
  getEffectiveToolAllowlist,
} from '@/config/model-personas.js'

export {
  capturePersonaRuntimeSnapshot,
  beginRequestPersonaRuntime,
  endRequestPersonaRuntime,
  getRequestPersonaRuntime,
  getEffectiveRagOverride,
  getEffectiveToolAllowlist,
  getEffectivePersonaSystemHint,
}

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

const PERSONA_HINT_KEY = 'adachat_persona_system_hint_v1'

function personaTitle(persona) {
  if (!persona) return ''
  if (persona.custom) return persona.title || persona.id
  return t(persona.titleKey, persona.id)
}

function personaDesc(persona) {
  if (!persona) return ''
  if (persona.custom) return persona.desc || ''
  return t(persona.descKey, '')
}

function scoreModelAgainstKeywords(model, keywords) {
  const hay = `${model.label || ''} ${model.value || ''}`.toLowerCase()
  let score = 0
  for (const kw of keywords) {
    const k = String(kw || '').toLowerCase()
    if (!k) continue
    if (hay.includes(k)) score += k.length >= 4 ? 3 : 2
  }
  if (model.type) score += 0.5
  return score
}

/**
 * 在当前供应商下为角色挑最佳模型；必要时跨供应商搜索
 * Pick best model for persona under current provider; fall back cross-provider
 */
export function findModelForPersona(persona) {
  if (persona?.modelValue) {
    const models = Array.isArray(globalThis.allModels) ? globalThis.allModels : []
    const hit = models.find((m) => m.value === persona.modelValue)
    if (hit) return hit
    return { value: persona.modelValue, label: persona.modelValue, type: persona.category }
  }

  const models = Array.isArray(globalThis.allModels) ? globalThis.allModels : []
  if (!models.length) return null

  const providerId = $('providerSelect')?.value || ''
  const typed = models.filter((m) => m.type === persona.category)
  const pool = typed.length ? typed : models

  const sameProvider = providerId
    ? pool.filter((m) => String(m.value || '').startsWith(`${providerId}::`))
    : pool

  const searchPools = [sameProvider, pool]
  let best = null
  let bestScore = 0
  for (const list of searchPools) {
    for (const m of list) {
      const s = scoreModelAgainstKeywords(m, persona.keywords || [])
      if (s > bestScore) {
        bestScore = s
        best = m
      }
    }
    if (best && bestScore > 0) break
  }

  if (!best && sameProvider.length) best = sameProvider[0]
  if (!best && pool.length) best = pool[0]
  return best
}

function applySampling(persona) {
  if (typeof persona.temperature === 'number') {
    localStorage.setItem('samplingTemperature', String(persona.temperature))
    const el = $('samplingTemperature')
    if (el) el.value = String(persona.temperature)
  }
  if (typeof persona.topP === 'number') {
    localStorage.setItem('samplingTopP', String(persona.topP))
    const el = $('samplingTopP')
    if (el) el.value = String(persona.topP)
  }
  if (persona.systemHint) {
    localStorage.setItem(PERSONA_HINT_KEY, persona.systemHint)
  } else {
    localStorage.removeItem(PERSONA_HINT_KEY)
  }
}

export function getActivePersonaSystemHint() {
  // 请求快照优先，避免改角色卡影响进行中会话
  // Prefer request snapshot so editing cards doesn't drift mid-chat
  return getEffectivePersonaSystemHint()
}

function selectModelValue(modelValue) {
  if (!modelValue) return
  const [pId] = String(modelValue).split('::')
  const providerSelect = $('providerSelect')
  if (providerSelect && pId && providerSelect.value !== pId) {
    providerSelect.value = pId
    if (typeof globalThis.onProviderChange === 'function') {
      void globalThis.onProviderChange()
    }
  }
  const modelSelect = $('model')
  if (!modelSelect) return
  if (!Array.from(modelSelect.options).some((o) => o.value === modelValue)) {
    if (typeof globalThis.filterModelsByCategory === 'function') {
      globalThis.filterModelsByCategory()
    }
  }
  if (Array.from(modelSelect.options).some((o) => o.value === modelValue)) {
    modelSelect.value = modelValue
  }
}

/**
 * @param {string} personaId
 * @param {{silent?:boolean, startChat?:boolean}} [opts]
 */
export function applyModelPersona(personaId, opts = {}) {
  const persona = getPersonaById(personaId)
  if (!persona) {
    writeActivePersonaId('')
    localStorage.removeItem(PERSONA_HINT_KEY)
    clearPersonaRuntimeOverrides()
    renderModelPersonas()
    return false
  }

  writeActivePersonaId(persona.id)
  applySampling(persona)
  applyPersonaRuntimeOverrides(persona)

  const cat = $('category')
  if (cat && cat.value !== persona.category) {
    const opt = Array.from(cat.options).find((o) => o.value === persona.category)
    if (opt && (opt.hidden || opt.disabled)) {
      if (typeof globalThis.applyWorkspaceMode === 'function') {
        globalThis.applyWorkspaceMode('lab')
      }
    }
    cat.value = persona.category
    if (typeof globalThis.onCategoryChange === 'function') {
      globalThis.onCategoryChange()
    }
  }

  const match = findModelForPersona(persona)
  if (match?.value) selectModelValue(match.value)

  renderModelPersonas()
  if (!opts.silent) {
    showPersonaToast(
      getLang() === 'zh'
        ? `已切换角色：${personaTitle(persona)}`
        : `Persona: ${personaTitle(persona)}`
    )
  }

  if (opts.startChat) {
    if (typeof globalThis.newChat === 'function') globalThis.newChat()
    const msg = $('msg')
    if (msg) {
      msg.focus()
      msg.placeholder =
        getLang() === 'zh'
          ? `以「${personaTitle(persona)}」身份提问…`
          : `Ask as “${personaTitle(persona)}”…`
    }
  }
  return true
}

function showPersonaToast(msg) {
  let el = $('personaToast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'personaToast'
    el.className = 'persona-toast'
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.classList.add('is-visible')
  clearTimeout(showPersonaToast._timer)
  showPersonaToast._timer = setTimeout(() => {
    el.classList.remove('is-visible')
  }, 2200)
}

function listPluginToolsForEditor() {
  const MainApp = globalThis.MainApp
  const PluginSystem = globalThis.PluginSystem
  const ToolApi = globalThis.AdaPluginTools
  if (!PluginSystem?.getAllPlugins) return []
  const out = []
  for (const plugin of PluginSystem.getAllPlugins()) {
    if (MainApp && !MainApp.isPluginEnabled(plugin.id)) continue
    const tools =
      typeof ToolApi?.normalizePluginTools === 'function'
        ? ToolApi.normalizePluginTools(plugin.id, plugin.tools)
        : Array.isArray(plugin.tools)
          ? plugin.tools
          : []
    for (const tool of tools) {
      if (!tool?.name) continue
      const key =
        typeof ToolApi?.toolKey === 'function'
          ? ToolApi.toolKey(plugin.id, tool.name)
          : `${plugin.id}::${tool.name}`
      out.push({
        key,
        pluginId: plugin.id,
        name: tool.name,
        description: tool.description || tool.name,
      })
    }
  }
  return out
}

function ensurePersonaEditorModal() {
  let modal = $('personaEditorModal')
  if (modal) return modal
  modal = document.createElement('div')
  modal.id = 'personaEditorModal'
  modal.className = 'persona-editor-modal'
  modal.hidden = true
  modal.innerHTML = `
    <div class="persona-editor-modal__backdrop" data-persona-editor-close></div>
    <div class="persona-editor-modal__panel" role="dialog" aria-labelledby="personaEditorTitle">
      <div class="persona-editor-modal__header">
        <h3 id="personaEditorTitle"></h3>
        <button type="button" class="persona-editor-modal__close" data-persona-editor-close aria-label="Close">✕</button>
      </div>
      <div class="persona-editor-modal__body">
        <div class="persona-editor-grid">
          <label class="persona-editor-field">
            <span data-i18n-persona="persona_field_icon">图标</span>
            <input id="personaEditIcon" maxlength="4" value="✨" />
          </label>
          <label class="persona-editor-field persona-editor-field--grow">
            <span data-i18n-persona="persona_field_title">名称</span>
            <input id="personaEditTitle" maxlength="48" />
          </label>
        </div>
        <label class="persona-editor-field">
          <span data-i18n-persona="persona_field_desc">简介</span>
          <input id="personaEditDesc" maxlength="120" />
        </label>
        <div class="persona-editor-grid">
          <label class="persona-editor-field">
            <span data-i18n-persona="persona_field_category">任务类型</span>
            <select id="personaEditCategory">
              <option value="chat">chat</option>
              <option value="code">code</option>
              <option value="image">image</option>
              <option value="vision">vision</option>
              <option value="translation">translation</option>
              <option value="ocr">ocr</option>
            </select>
          </label>
          <label class="persona-editor-field persona-editor-field--grow">
            <span data-i18n-persona="persona_field_model">绑定模型</span>
            <select id="personaEditModel"></select>
          </label>
        </div>
        <label class="persona-editor-field">
          <span data-i18n-persona="persona_field_system">System 提示词</span>
          <textarea id="personaEditSystem" rows="4"></textarea>
        </label>
        <label class="persona-editor-field">
          <span data-i18n-persona="persona_field_tools">工具</span>
          <select id="personaEditToolsMode">
            <option value="inherit">inherit</option>
            <option value="none">none</option>
            <option value="allowlist">allowlist</option>
          </select>
          <div id="personaEditToolsList" class="persona-editor-tools"></div>
        </label>
        <div class="persona-editor-grid">
          <label class="persona-editor-field">
            <span data-i18n-persona="persona_field_rag">知识库</span>
            <select id="personaEditRagMode">
              <option value="inherit">inherit</option>
              <option value="off">off</option>
              <option value="on">on</option>
            </select>
          </label>
          <label class="persona-editor-field persona-editor-field--grow">
            <span data-i18n-persona="persona_field_collection">集合（可选）</span>
            <select id="personaEditRagCollection"></select>
          </label>
        </div>
        <input type="hidden" id="personaEditId" value="" />
      </div>
      <div class="persona-editor-modal__footer">
        <button type="button" id="personaEditDelete" class="persona-editor-btn persona-editor-btn--danger" hidden></button>
        <div class="persona-editor-modal__footer-spacer"></div>
        <button type="button" id="personaEditCancel" class="persona-editor-btn" data-persona-editor-close></button>
        <button type="button" id="personaEditSave" class="persona-editor-btn persona-editor-btn--primary"></button>
        <button type="button" id="personaEditSaveChat" class="persona-editor-btn persona-editor-btn--accent"></button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  modal.querySelectorAll('[data-persona-editor-close]').forEach((el) => {
    el.addEventListener('click', () => closePersonaEditor())
  })
  $('personaEditSave')?.addEventListener('click', () => savePersonaEditor(false))
  $('personaEditSaveChat')?.addEventListener('click', () => savePersonaEditor(true))
  $('personaEditDelete')?.addEventListener('click', () => {
    const id = $('personaEditId')?.value
    if (!id) return
    const ok = confirm(
      getLang() === 'zh' ? '确定删除此自定义角色卡？' : 'Delete this custom persona?'
    )
    if (!ok) return
    deleteCustomPersona(id)
    if (readActivePersonaId() === id) applyModelPersona('', { silent: true })
    closePersonaEditor()
    renderModelPersonas()
  })
  $('personaEditToolsMode')?.addEventListener('change', syncToolsListVisibility)
  $('personaEditRagMode')?.addEventListener('change', syncRagCollectionVisibility)
  return modal
}

function localizeEditorChrome() {
  const zh = getLang() === 'zh'
  const titleEl = $('personaEditorTitle')
  if (titleEl) {
    titleEl.textContent = $('personaEditId')?.value
      ? t('persona_edit_title', zh ? '编辑角色卡' : 'Edit persona')
      : t('persona_new_title', zh ? '新建角色卡' : 'New persona')
  }
  const map = {
    persona_field_icon: zh ? '图标' : 'Icon',
    persona_field_title: zh ? '名称' : 'Name',
    persona_field_desc: zh ? '简介' : 'Description',
    persona_field_category: zh ? '任务类型' : 'Category',
    persona_field_model: zh ? '绑定模型' : 'Model',
    persona_field_system: zh ? 'System 提示词' : 'System prompt',
    persona_field_tools: zh ? '工具' : 'Tools',
    persona_field_rag: zh ? '知识库' : 'Knowledge',
    persona_field_collection: zh ? '集合（可选）' : 'Collection (optional)',
  }
  document.querySelectorAll('[data-i18n-persona]').forEach((el) => {
    const key = el.getAttribute('data-i18n-persona')
    if (key && map[key]) el.textContent = t(key, map[key])
  })
  const toolsMode = $('personaEditToolsMode')
  if (toolsMode) {
    ;[
      ['inherit', zh ? '跟随全局 Tool Calling' : 'Follow global tools'],
      ['none', zh ? '不使用工具' : 'No tools'],
      ['allowlist', zh ? '仅勾选的工具' : 'Selected tools only'],
    ].forEach(([v, label], i) => {
      if (toolsMode.options[i]) {
        toolsMode.options[i].value = v
        toolsMode.options[i].textContent = label
      }
    })
  }
  const ragMode = $('personaEditRagMode')
  if (ragMode) {
    ;[
      ['inherit', zh ? '跟随全局 RAG' : 'Follow global RAG'],
      ['off', zh ? '关闭知识库' : 'RAG off'],
      ['on', zh ? '启用知识库' : 'RAG on'],
    ].forEach(([v, label], i) => {
      if (ragMode.options[i]) {
        ragMode.options[i].value = v
        ragMode.options[i].textContent = label
      }
    })
  }
  if ($('personaEditCancel'))
    $('personaEditCancel').textContent = t('persona_cancel', zh ? '取消' : 'Cancel')
  if ($('personaEditSave'))
    $('personaEditSave').textContent = t('persona_save', zh ? '保存' : 'Save')
  if ($('personaEditSaveChat'))
    $('personaEditSaveChat').textContent = t(
      'persona_save_chat',
      zh ? '保存并开聊' : 'Save & chat'
    )
  if ($('personaEditDelete'))
    $('personaEditDelete').textContent = t('persona_delete', zh ? '删除' : 'Delete')
}

function fillModelOptions(selected) {
  const sel = $('personaEditModel')
  if (!sel) return
  const models = Array.isArray(globalThis.allModels) ? globalThis.allModels : []
  sel.innerHTML = ''
  const empty = document.createElement('option')
  empty.value = ''
  empty.textContent =
    getLang() === 'zh' ? '（使用当前模型）' : '(Use current model)'
  sel.appendChild(empty)
  for (const m of models) {
    const opt = document.createElement('option')
    opt.value = m.value
    opt.textContent = m.label || m.value
    sel.appendChild(opt)
  }
  const cur = selected || $('model')?.value || ''
  if (cur && !Array.from(sel.options).some((o) => o.value === cur)) {
    const opt = document.createElement('option')
    opt.value = cur
    opt.textContent = cur
    sel.appendChild(opt)
  }
  sel.value = cur || ''
}

function fillCollectionOptions(selected) {
  const sel = $('personaEditRagCollection')
  if (!sel) return
  sel.innerHTML = ''
  const all = document.createElement('option')
  all.value = ''
  all.textContent =
    getLang() === 'zh' ? '全部集合' : 'All collections'
  sel.appendChild(all)
  let cols = []
  if (typeof globalThis.getRagCollectionsSummary === 'function') {
    cols = globalThis.getRagCollectionsSummary() || []
  }
  for (const c of cols) {
    const opt = document.createElement('option')
    opt.value = c.name
    opt.textContent = `${c.name} (${c.docs})`
    sel.appendChild(opt)
  }
  sel.value = selected || ''
}

function fillToolsList(selectedKeys) {
  const box = $('personaEditToolsList')
  if (!box) return
  const selected = new Set((selectedKeys || []).map(String))
  const tools = listPluginToolsForEditor()
  if (!tools.length) {
    box.innerHTML = `<div class="hint">${
      getLang() === 'zh'
        ? '暂无可用工具（请先在插件管理中启用带 tools 的插件）'
        : 'No tools yet (enable plugins that declare tools)'
    }</div>`
    return
  }
  box.innerHTML = tools
    .map((tool) => {
      const id = `personaTool_${tool.key.replace(/[^a-zA-Z0-9_]/g, '_')}`
      const checked = selected.has(tool.key) ? 'checked' : ''
      return `<label class="persona-editor-tool">
        <input type="checkbox" id="${id}" data-tool-key="${tool.key}" ${checked} />
        <span><strong>${tool.pluginId}</strong> · ${tool.name}</span>
      </label>`
    })
    .join('')
}

function syncToolsListVisibility() {
  const mode = $('personaEditToolsMode')?.value || 'inherit'
  const box = $('personaEditToolsList')
  if (box) box.style.display = mode === 'allowlist' ? '' : 'none'
}

function syncRagCollectionVisibility() {
  const mode = $('personaEditRagMode')?.value || 'inherit'
  const field = $('personaEditRagCollection')?.closest('.persona-editor-field')
  if (field) field.style.opacity = mode === 'on' ? '1' : '0.55'
}

/**
 * @param {string|null} [editId]
 */
export function openPersonaEditor(editId = null) {
  const modal = ensurePersonaEditorModal()
  const existing = editId ? getPersonaById(editId) : null
  const isEdit = !!(existing && existing.custom)

  $('personaEditId').value = isEdit ? existing.id : ''
  $('personaEditIcon').value = isEdit ? existing.icon || '✨' : '✨'
  $('personaEditTitle').value = isEdit ? existing.title || '' : ''
  $('personaEditDesc').value = isEdit ? existing.desc || '' : ''
  $('personaEditCategory').value = isEdit
    ? existing.category || 'chat'
    : $('category')?.value || 'chat'
  $('personaEditSystem').value = isEdit
    ? existing.systemHint || ''
    : getActivePersonaSystemHint() || ''
  $('personaEditToolsMode').value = isEdit
    ? existing.toolsMode || 'inherit'
    : 'inherit'
  $('personaEditRagMode').value = isEdit ? existing.ragMode || 'inherit' : 'inherit'

  fillModelOptions(isEdit ? existing.modelValue : $('model')?.value)
  fillCollectionOptions(isEdit ? existing.ragCollection : '')
  fillToolsList(isEdit ? existing.toolKeys : [])
  syncToolsListVisibility()
  syncRagCollectionVisibility()

  const del = $('personaEditDelete')
  if (del) del.hidden = !isEdit

  localizeEditorChrome()
  modal.hidden = false
  document.body.classList.add('persona-editor-open')
  $('personaEditTitle')?.focus()
}

export function closePersonaEditor() {
  const modal = $('personaEditorModal')
  if (modal) modal.hidden = true
  document.body.classList.remove('persona-editor-open')
}

function collectEditorPersona() {
  const id = $('personaEditId')?.value || newCustomPersonaId()
  const title = String($('personaEditTitle')?.value || '').trim()
  if (!title) {
    alert(getLang() === 'zh' ? '请填写角色名称' : 'Please enter a persona name')
    return null
  }
  const toolKeys = Array.from(
    document.querySelectorAll('#personaEditToolsList input[data-tool-key]:checked')
  ).map((el) => el.getAttribute('data-tool-key'))

  return {
    id,
    custom: true,
    icon: String($('personaEditIcon')?.value || '✨').trim() || '✨',
    title,
    desc: String($('personaEditDesc')?.value || '').trim(),
    category: String($('personaEditCategory')?.value || 'chat'),
    modelValue: String($('personaEditModel')?.value || ''),
    systemHint: String($('personaEditSystem')?.value || '').trim(),
    toolsMode: String($('personaEditToolsMode')?.value || 'inherit'),
    toolKeys,
    ragMode: String($('personaEditRagMode')?.value || 'inherit'),
    ragCollection: String($('personaEditRagCollection')?.value || ''),
  }
}

function savePersonaEditor(startChat) {
  const draft = collectEditorPersona()
  if (!draft) return
  const saved = upsertCustomPersona(draft)
  if (!saved) return
  closePersonaEditor()
  applyModelPersona(saved.id, { silent: !startChat, startChat: !!startChat })
  if (!startChat) {
    showPersonaToast(
      getLang() === 'zh' ? `已保存：${saved.title}` : `Saved: ${saved.title}`
    )
  }
}

export function renderModelPersonas() {
  const strip = $('modelPersonaStrip')
  if (!strip) return
  const active = readActivePersonaId()
  const mode = document.body.dataset.workspaceMode || 'chat'

  const builtin = MODEL_PERSONAS.filter((p) => {
    if (mode === 'dev') return p.category === 'code' || p.id === 'fast_chat'
    if (mode === 'create')
      return p.category === 'image' || p.id === 'deep_think' || p.id === 'fast_chat'
    if (mode === 'knowledge') return p.category === 'chat'
    return true
  })
  const customs = readCustomPersonas()

  strip.innerHTML = ''
  const label = document.createElement('span')
  label.className = 'persona-strip__label'
  label.textContent = t('persona_strip_label', 'Ada 推荐')
  strip.appendChild(label)

  const appendChip = (p, isCustom) => {
    const wrap = document.createElement('div')
    wrap.className = 'persona-chip-wrap'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className =
      'persona-chip' +
      (p.id === active ? ' is-active' : '') +
      (isCustom ? ' persona-chip--custom' : '')
    btn.title = personaDesc(p)
    btn.innerHTML = `<span class="persona-chip__icon">${p.icon}</span><span class="persona-chip__title">${personaTitle(p)}</span>`
    btn.addEventListener('click', () => {
      if (readActivePersonaId() === p.id) {
        applyModelPersona('', { silent: true })
        showPersonaToast(
          getLang() === 'zh' ? '已取消角色卡' : 'Persona cleared'
        )
      } else {
        applyModelPersona(p.id)
      }
    })
    wrap.appendChild(btn)
    if (isCustom) {
      const edit = document.createElement('button')
      edit.type = 'button'
      edit.className = 'persona-chip__edit'
      edit.title = getLang() === 'zh' ? '编辑' : 'Edit'
      edit.textContent = '✎'
      edit.addEventListener('click', (e) => {
        e.stopPropagation()
        openPersonaEditor(p.id)
      })
      wrap.appendChild(edit)
    }
    strip.appendChild(wrap)
  }

  builtin.forEach((p) => appendChip(p, false))
  customs.forEach((p) => appendChip(p, true))

  const addBtn = document.createElement('button')
  addBtn.type = 'button'
  addBtn.className = 'persona-chip persona-chip--add'
  addBtn.title = t('persona_new_title', getLang() === 'zh' ? '新建角色卡' : 'New persona')
  addBtn.innerHTML = `<span class="persona-chip__icon">＋</span><span class="persona-chip__title">${t('persona_add', getLang() === 'zh' ? '自定义' : 'Custom')}</span>`
  addBtn.addEventListener('click', () => openPersonaEditor(null))
  strip.appendChild(addBtn)

  const hint = $('personaActiveHint')
  if (hint) {
    const persona = active ? getPersonaById(active) : null
    if (!persona) {
      hint.hidden = true
      hint.textContent = ''
    } else {
      const modelLabel =
        $('model')?.selectedOptions?.[0]?.textContent ||
        $('model')?.value ||
        ''
      const bits = [personaTitle(persona), personaDesc(persona)]
      if (persona.custom) {
        if (persona.toolsMode === 'allowlist')
          bits.push(
            getLang() === 'zh'
              ? `工具 ${persona.toolKeys?.length || 0}`
              : `tools ${persona.toolKeys?.length || 0}`
          )
        else if (persona.toolsMode === 'none')
          bits.push(getLang() === 'zh' ? '无工具' : 'no tools')
        if (persona.ragMode === 'on')
          bits.push(
            persona.ragCollection
              ? `RAG:${persona.ragCollection}`
              : 'RAG'
          )
      }
      if (modelLabel)
        bits.push(
          getLang() === 'zh' ? `模型 ${modelLabel}` : `Model ${modelLabel}`
        )
      hint.hidden = false
      hint.textContent = bits.filter(Boolean).join(' · ')
    }
  }
}

export function initModelPersonasUi() {
  renderModelPersonas()
  document.addEventListener('workspaceModeChanged', () => renderModelPersonas())
  const active = readActivePersonaId()
  if (active) applyModelPersona(active, { silent: true })
}
