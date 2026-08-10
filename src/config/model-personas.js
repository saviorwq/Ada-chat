/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 模型角色卡定义 — 内置 + 用户自定义（v1.3 角色卡 2.0）
 * Model persona cards — built-in + user custom (v1.3 Persona 2.0)
 */

export const ACTIVE_PERSONA_KEY = 'adachat_active_persona_v1'
export const CUSTOM_PERSONAS_KEY = 'adachat_custom_personas_v1'
/** 会话级工具白名单：null=跟随全局；[]=禁用；string[]=仅这些 */
export const PERSONA_TOOL_ALLOWLIST_KEY = 'adachat_persona_tool_allowlist_v1'
/** 会话级 RAG 覆盖 JSON：{enabled,collection}|null */
export const PERSONA_RAG_OVERRIDE_KEY = 'adachat_persona_rag_override_v1'

/**
 * @typedef {{
 *   id: string,
 *   icon: string,
 *   titleKey?: string,
 *   descKey?: string,
 *   title?: string,
 *   desc?: string,
 *   category: string,
 *   keywords?: string[],
 *   temperature?: number,
 *   topP?: number,
 *   systemHint?: string,
 *   custom?: boolean,
 *   modelValue?: string,
 *   toolsMode?: 'inherit'|'none'|'allowlist',
 *   toolKeys?: string[],
 *   ragMode?: 'inherit'|'off'|'on',
 *   ragCollection?: string
 * }} ModelPersona
 */

/** @type {ModelPersona[]} */
export const MODEL_PERSONAS = [
  {
    id: 'deep_think',
    icon: '🧠',
    titleKey: 'persona_deep_think',
    descKey: 'persona_deep_think_desc',
    category: 'chat',
    keywords: [
      'o1',
      'o3',
      'r1',
      'reason',
      'think',
      'qwq',
      'deepseek-r',
      'gpt-5',
      'claude-3-opus',
      'claude-4',
    ],
    temperature: 0.4,
    systemHint:
      '请先简要梳理思路，再给出结论。回答要准确、有条理，必要时指出不确定之处。',
  },
  {
    id: 'code_expert',
    icon: '💻',
    titleKey: 'persona_code_expert',
    descKey: 'persona_code_expert_desc',
    category: 'code',
    keywords: [
      'coder',
      'code',
      'deepseek',
      'qwen2.5-coder',
      'qwen3-coder',
      'codellama',
      'starcoder',
      'devstral',
    ],
    temperature: 0.2,
    systemHint:
      '你是资深编程助手。优先给出可运行代码、指出风险，并简要说明关键设计取舍。',
  },
  {
    id: 'creative_art',
    icon: '🎨',
    titleKey: 'persona_creative_art',
    descKey: 'persona_creative_art_desc',
    category: 'image',
    keywords: [
      'flux',
      'sdxl',
      'stable-diffusion',
      'dall-e',
      'imagen',
      'kolors',
      'wan',
      'midjourney',
      'playground',
    ],
    temperature: 0.9,
  },
  {
    id: 'fast_chat',
    icon: '⚡',
    titleKey: 'persona_fast_chat',
    descKey: 'persona_fast_chat_desc',
    category: 'chat',
    keywords: [
      'mini',
      'flash',
      'turbo',
      'haiku',
      'lite',
      'small',
      'instant',
      'qwen2.5-7b',
      'qwen3-8b',
      'gpt-4o-mini',
    ],
    temperature: 0.7,
    systemHint: '请简洁直接地回答，优先给结论，细节按需补充。',
  },
  {
    id: 'vision_guide',
    icon: '👁️',
    titleKey: 'persona_vision_guide',
    descKey: 'persona_vision_guide_desc',
    category: 'vision',
    keywords: [
      'vision',
      'vl',
      'gpt-4o',
      'claude-3',
      'gemini',
      'qwen-vl',
      'qwen2-vl',
      'llava',
    ],
    temperature: 0.5,
  },
  {
    id: 'translator',
    icon: '🌐',
    titleKey: 'persona_translator',
    descKey: 'persona_translator_desc',
    category: 'translation',
    keywords: ['translate', 'translation', 'gpt', 'claude', 'qwen', 'deepseek'],
    temperature: 0.3,
  },
]

export function readCustomPersonas() {
  try {
    const raw = localStorage.getItem(CUSTOM_PERSONAS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p) => p && typeof p === 'object' && p.id && p.title)
      .map((p) => normalizeCustomPersona(p))
  } catch {
    return []
  }
}

function normalizeCustomPersona(p) {
  const toolsMode = ['inherit', 'none', 'allowlist'].includes(p.toolsMode)
    ? p.toolsMode
    : 'inherit'
  const ragMode = ['inherit', 'off', 'on'].includes(p.ragMode)
    ? p.ragMode
    : 'inherit'
  return {
    id: String(p.id),
    custom: true,
    icon: String(p.icon || '✨').slice(0, 4) || '✨',
    title: String(p.title || '').trim().slice(0, 48),
    desc: String(p.desc || '').trim().slice(0, 120),
    category: String(p.category || 'chat'),
    modelValue: String(p.modelValue || ''),
    systemHint: String(p.systemHint || ''),
    temperature:
      typeof p.temperature === 'number' && Number.isFinite(p.temperature)
        ? p.temperature
        : undefined,
    topP:
      typeof p.topP === 'number' && Number.isFinite(p.topP) ? p.topP : undefined,
    toolsMode,
    toolKeys: Array.isArray(p.toolKeys)
      ? p.toolKeys.map(String).filter(Boolean).slice(0, 64)
      : [],
    ragMode,
    ragCollection: String(p.ragCollection || ''),
    keywords: [],
  }
}

export function writeCustomPersonas(list) {
  try {
    const normalized = (Array.isArray(list) ? list : []).map((p) =>
      normalizeCustomPersona(p)
    )
    localStorage.setItem(CUSTOM_PERSONAS_KEY, JSON.stringify(normalized))
  } catch {
    /* ignore */
  }
}

export function upsertCustomPersona(persona) {
  const next = normalizeCustomPersona(persona)
  if (!next.id || !next.title) return null
  const list = readCustomPersonas()
  const idx = list.findIndex((p) => p.id === next.id)
  if (idx >= 0) list[idx] = next
  else list.push(next)
  writeCustomPersonas(list)
  return next
}

export function deleteCustomPersona(id) {
  const list = readCustomPersonas().filter((p) => p.id !== id)
  writeCustomPersonas(list)
  return list
}

export function getAllPersonas() {
  return [...MODEL_PERSONAS, ...readCustomPersonas()]
}

export function getPersonaById(id) {
  if (!id) return null
  return (
    MODEL_PERSONAS.find((p) => p.id === id) ||
    readCustomPersonas().find((p) => p.id === id) ||
    null
  )
}

export function readActivePersonaId() {
  try {
    return localStorage.getItem(ACTIVE_PERSONA_KEY) || ''
  } catch {
    return ''
  }
}

export function writeActivePersonaId(id) {
  try {
    if (!id) localStorage.removeItem(ACTIVE_PERSONA_KEY)
    else localStorage.setItem(ACTIVE_PERSONA_KEY, id)
  } catch {
    /* ignore */
  }
}

/** @returns {string[]|null} null=继承全局；数组=白名单（可为空） */
export function readPersonaToolAllowlist() {
  try {
    const raw = localStorage.getItem(PERSONA_TOOL_ALLOWLIST_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.map(String)
  } catch {
    return null
  }
}

export function writePersonaToolAllowlist(keysOrNull) {
  try {
    if (keysOrNull === null || keysOrNull === undefined) {
      localStorage.removeItem(PERSONA_TOOL_ALLOWLIST_KEY)
    } else {
      localStorage.setItem(
        PERSONA_TOOL_ALLOWLIST_KEY,
        JSON.stringify(Array.isArray(keysOrNull) ? keysOrNull.map(String) : [])
      )
    }
  } catch {
    /* ignore */
  }
}

/** @returns {{enabled:boolean,collection:string}|null} */
export function readPersonaRagOverride() {
  try {
    const raw = localStorage.getItem(PERSONA_RAG_OVERRIDE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      enabled: !!parsed.enabled,
      collection: String(parsed.collection || ''),
    }
  } catch {
    return null
  }
}

export function writePersonaRagOverride(overrideOrNull) {
  try {
    if (!overrideOrNull) {
      localStorage.removeItem(PERSONA_RAG_OVERRIDE_KEY)
      return
    }
    localStorage.setItem(
      PERSONA_RAG_OVERRIDE_KEY,
      JSON.stringify({
        enabled: !!overrideOrNull.enabled,
        collection: String(overrideOrNull.collection || ''),
      })
    )
  } catch {
    /* ignore */
  }
}

export function clearPersonaRuntimeOverrides() {
  writePersonaToolAllowlist(null)
  writePersonaRagOverride(null)
}

export function applyPersonaRuntimeOverrides(persona) {
  if (!persona || !persona.custom) {
    clearPersonaRuntimeOverrides()
    return
  }
  const toolsMode = persona.toolsMode || 'inherit'
  if (toolsMode === 'none') writePersonaToolAllowlist([])
  else if (toolsMode === 'allowlist')
    writePersonaToolAllowlist(persona.toolKeys || [])
  else writePersonaToolAllowlist(null)

  const ragMode = persona.ragMode || 'inherit'
  if (ragMode === 'off') writePersonaRagOverride({ enabled: false, collection: '' })
  else if (ragMode === 'on')
    writePersonaRagOverride({
      enabled: true,
      collection: String(persona.ragCollection || ''),
    })
  else writePersonaRagOverride(null)
}

export function newCustomPersonaId() {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * 请求级角色运行时（会话快照优先于「活」角色卡）
 * Request-scoped persona runtime (conversation snapshot over live card)
 * @type {null|{
 *   personaId:string,
 *   systemHint:string,
 *   toolAllowlist:string[]|null,
 *   ragOverride:{enabled:boolean,collection:string}|null,
 *   modelValue:string,
 *   capturedAt:number
 * }}
 */
let requestPersonaRuntime = null

export function beginRequestPersonaRuntime(snap) {
  requestPersonaRuntime = snap || null
}

export function endRequestPersonaRuntime() {
  requestPersonaRuntime = null
}

export function getRequestPersonaRuntime() {
  return requestPersonaRuntime
}

/** 从当前 UI / localStorage 抓取快照（首条消息时冻结到会话） */
export function capturePersonaRuntimeSnapshot() {
  let systemHint = ''
  try {
    systemHint = localStorage.getItem('adachat_persona_system_hint_v1') || ''
  } catch {
    systemHint = ''
  }
  let modelValue = ''
  try {
    modelValue = document.getElementById('model')?.value || ''
  } catch {
    modelValue = ''
  }
  return {
    personaId: readActivePersonaId() || '',
    systemHint: String(systemHint || ''),
    toolAllowlist: readPersonaToolAllowlist(),
    ragOverride: readPersonaRagOverride(),
    modelValue: String(modelValue || ''),
    capturedAt: Date.now(),
  }
}

/** 有效工具白名单：请求快照 > 活角色卡 */
export function getEffectiveToolAllowlist() {
  const rt = requestPersonaRuntime
  if (rt && Object.prototype.hasOwnProperty.call(rt, 'toolAllowlist')) {
    return rt.toolAllowlist
  }
  return readPersonaToolAllowlist()
}

/** 有效 RAG 覆盖：请求快照 > 活角色卡 */
export function getEffectiveRagOverride() {
  const rt = requestPersonaRuntime
  if (rt && Object.prototype.hasOwnProperty.call(rt, 'ragOverride')) {
    return rt.ragOverride
  }
  return readPersonaRagOverride()
}

/** 有效 system hint：请求快照 > 活角色卡 */
export function getEffectivePersonaSystemHint() {
  const rt = requestPersonaRuntime
  if (rt && typeof rt.systemHint === 'string') {
    return rt.systemHint
  }
  try {
    return localStorage.getItem('adachat_persona_system_hint_v1') || ''
  } catch {
    return ''
  }
}
