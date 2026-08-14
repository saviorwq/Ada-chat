/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/* eslint-disable no-empty, no-constant-condition, no-useless-catch -- streaming / HTTP fallbacks ported from script.js */
/**
 * 发送管线：请求构建、流式执行、意图路由、send（从 script.js 迁出）
 * Chat send pipeline — migrated from script.js
 *
 * 依赖 globalThis：conversations、PluginSystem、filterModelsByCategory、applyWordConversion、buildRagSystemPrompt、…
 */
import { sanitizeErrorMessage } from '@/ui/debug-tools.js'
import {
  isVideoJobResponse,
  pollVideoJobUntilDone,
} from '@/ui/video-generate.js'
import {
  isImageJobResponse,
  pollImageJobUntilDone,
} from '@/ui/image-generate.js'

const PDF_SCAN_MAX_PAGES = 5

function $(id) {
  return document.getElementById(id)
}

function getModeConfig() {
  return globalThis.AdaChatModeConfig || {}
}

function getI18nBundle() {
  const i18n = globalThis.AdaChatI18n || globalThis.i18n || { zh: {}, en: {} }
  const currentLanguage =
    typeof globalThis.currentLanguage === 'string'
      ? globalThis.currentLanguage
      : 'zh'
  return { i18n, currentLanguage }
}

/** 从 ai_proxy 非 2xx 响应中解析可读错误（含本地推理 install_hint） */
async function formatGatewayHttpError(response) {
  const status = response.status
  let raw = ''
  try {
    raw = await response.clone().text()
    const parsed = JSON.parse(raw)
    const parts = []
    if (parsed.error) parts.push(String(parsed.error))
    else parts.push(`HTTP error ${status}`)
    if (parsed.install_hint) parts.push(String(parsed.install_hint))
    if (parsed.hint) parts.push(String(parsed.hint))
    if (parsed.detail && parsed.detail !== parsed.error) {
      parts.push(String(parsed.detail))
    }
    return parts.join('\n')
  } catch (_) {
    if (raw && raw.trim()) {
      return `HTTP error ${status}: ${raw.trim().slice(0, 300)}`
    }
    return `HTTP error ${status}`
  }
}

function isLocalInferenceSetupError(text) {
  return /llama-cpp|requirements-local-inference|本地推理|install_hint|doctor_failed/i.test(
    String(text || '')
  )
}

/** 本地 HTTP（Vulkan llama-server 等）也按本地放宽超时 / Local HTTP providers need long idle too */
function isLocalHttpProviderSelected() {
  try {
    const id = document.getElementById('providerSelect')?.value || ''
    const p = (globalThis.providers || []).find((x) => x && x.id === id)
    if (!p) return false
    if (String(p.deployment_type || '') === 'local') return true
    const u = String(p.base_url || '').toLowerCase()
    return (
      u.includes('127.0.0.1') ||
      u.includes('localhost') ||
      u.startsWith('direct://')
    )
  } catch {
    return false
  }
}

function formatProviderError(err) {
  if (err == null || err === '') return ''
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    if (typeof err.message === 'string' && err.message) return err.message
    if (typeof err.error === 'string' && err.error) return err.error
    if (err.error && typeof err.error.message === 'string') {
      return err.error.message
    }
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}

function getModelTypeByValue(modelValue) {
  const models = Array.isArray(globalThis.allModels) ? globalThis.allModels : []
  const hit = models.find((m) => m && m.value === modelValue)
  return hit ? String(hit.type || '') : ''
}

/** 图像/视频任务禁止被角色卡对话模型覆盖 / Don't let persona chat model override image/video */
function resolveEffectiveModelForCategory(personaSnap, reqModelValue, category) {
  const personaModel =
    personaSnap && personaSnap.modelValue
      ? String(personaSnap.modelValue)
      : ''
  if (category === 'image' || category === 'video') {
    return reqModelValue
  }
  if (!personaModel) return reqModelValue
  const pType = getModelTypeByValue(personaModel)
  if (!pType) return reqModelValue
  if (pType === category) return personaModel
  if (category === 'code' && (pType === 'code' || pType === 'chat')) {
    return personaModel
  }
  if (
    (category === 'chat' ||
      category === 'vision' ||
      category === 'ocr' ||
      category === 'translation') &&
    pType === 'chat'
  ) {
    return personaModel
  }
  return reqModelValue
}

function syncUiToResolvedSelection(category, providerId, modelValue, imageMode) {
  const catEl = $('category')
  const provEl = $('providerSelect')
  const modelEl = $('model')
  if (catEl && category) catEl.value = category
  if (provEl && providerId) provEl.value = providerId
  if (typeof globalThis.filterModelsByCategory === 'function') {
    globalThis.filterModelsByCategory()
  }
  if (modelEl && modelValue) {
    const has = Array.from(modelEl.options || []).some(
      (o) => o.value === modelValue
    )
    if (!has) {
      const opt = document.createElement('option')
      opt.value = modelValue
      opt.textContent =
        (typeof globalThis.getModelLabel === 'function'
          ? globalThis.getModelLabel(modelValue)
          : '') ||
        String(modelValue).split('::').pop() ||
        modelValue
      modelEl.appendChild(opt)
    }
    modelEl.value = modelValue
  }
  const modeRow = $('modeRow')
  if (modeRow) {
    modeRow.style.display = category === 'image' ? 'flex' : 'none'
  }
  if (category === 'image' && imageMode && $('imageMode')) {
    $('imageMode').value = imageMode
  }
  if (typeof globalThis.syncImageModeUi === 'function') {
    globalThis.syncImageModeUi()
  } else if (typeof globalThis.refreshImageLoraUi === 'function') {
    globalThis.refreshImageLoraUi()
  }
  const updateUpload = globalThis.updateUploadAcceptByMode
  if (typeof updateUpload === 'function') {
    updateUpload(category, imageMode || $('imageMode')?.value)
  }
}

function canAutoFailover(text) {
  if (typeof globalThis.isTransientProviderError === 'function') {
    return globalThis.isTransientProviderError(text)
  }
  if (typeof globalThis.isRateLimitMessage === 'function') {
    return globalThis.isRateLimitMessage(text)
  }
  return false
}

const MISSING_BODY_ZH = '（模型未返回正文，可展开查看思考过程）'
const MISSING_BODY_EN =
  '(No final answer text; expand Thinking for details)'

/** 是否为「仅有思考、无正文」占位文案 / Missing-body placeholder? */
export function isMissingAssistantBodyPlaceholder(text) {
  const t = String(text || '').trim()
  if (!t) return false
  if (t === MISSING_BODY_ZH || t === MISSING_BODY_EN) return true
  return (
    t.startsWith('（模型未返回正文') ||
    t.startsWith('(No final answer text')
  )
}

const LOCAL_CTX_TOKENS_DEFAULT = 16384
const LOCAL_OUT_RESERVE_DEFAULT = 4096

function getLocalCtxTokens() {
  const raw = Number(localStorage.getItem('localCtxTokens') || 0)
  if (Number.isFinite(raw) && raw >= 2048) return Math.floor(raw)
  return LOCAL_CTX_TOKENS_DEFAULT
}

/** 向本机 llama-server 探活 n_ctx，供截断预算使用 / Probe live n_ctx for trim budget */
export async function probeAndStoreLocalCtxTokens() {
  try {
    const id = document.getElementById('providerSelect')?.value || ''
    const p = (globalThis.providers || []).find((x) => x && x.id === id)
    let base = String(p?.base_url || 'http://127.0.0.1:8080/v1')
    base = base.replace(/\/v1\/?$/i, '').replace(/\/+$/, '')
    if (!/127\.0\.0\.1|localhost/i.test(base)) return getLocalCtxTokens()
    const res = await fetch(base + '/props', { cache: 'no-store' })
    if (!res.ok) return getLocalCtxTokens()
    const data = await res.json()
    const n =
      Number(data?.default_generation_settings?.n_ctx) ||
      Number(data?.n_ctx) ||
      0
    if (Number.isFinite(n) && n >= 2048) {
      localStorage.setItem('localCtxTokens', String(n))
      return n
    }
  } catch {
    /* ignore */
  }
  return getLocalCtxTokens()
}

/** 从原请求抽出短任务摘要，避免续写再塞整篇设定 / Short task digest for continue */
function extractContinueTaskDigest(messages, maxChars = 1800) {
  const list = Array.isArray(messages) ? messages : []
  let lastUser = ''
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]?.role === 'user') {
      lastUser = messageContentToText(list[i].content)
      break
    }
  }
  const t = String(lastUser || '').trim()
  if (!t) return ''
  if (t.length <= maxChars) return t
  const head = Math.floor(maxChars * 0.35)
  const tail = Math.floor(maxChars * 0.55)
  return (
    t.slice(0, head) +
    '\n…（设定过长已省略）…\n' +
    t.slice(-tail)
  )
}

function buildSlimContinueMessages({
  requestBody,
  currentLanguage,
  assistantPartial,
  userContinue,
  taskDigest,
}) {
  const zh = currentLanguage === 'zh'
  const msgs = [
    {
      role: 'system',
      content: zh
        ? '你是写作助手。根据给定的任务摘要与已写片段，继续输出完整正文。不要输出思考过程。'
        : 'You are a writing assistant. Continue the answer from the given digest and partial text. No thinking.',
    },
  ]
  if (taskDigest) {
    msgs.push({
      role: 'user',
      content: (zh ? '【任务摘要】\n' : '[Task digest]\n') + taskDigest,
    })
    msgs.push({
      role: 'assistant',
      content: zh ? '好的，我先按摘要准备结构。' : 'Understood. Preparing the structure.',
    })
  }
  if (assistantPartial) {
    msgs.push({ role: 'assistant', content: String(assistantPartial) })
  }
  msgs.push({ role: 'user', content: String(userContinue) })
  const ctxTokens = getLocalCtxTokens()
  // 续写必须更狠地控预算，宁可少带设定也不能再超窗
  // Continue must stay well under ctx; prefer dropping digest over overflowing
  return trimMessagesForLocalContext(
    msgs,
    ctxTokens,
    Math.min(LOCAL_OUT_RESERVE_DEFAULT, Math.floor(ctxTokens * 0.35))
  )
}

/** 粗估 token（中英混合偏保守） / Rough token estimate for mixed CJK/ASCII */
function messageContentToText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (!p) return ''
        if (typeof p === 'string') return p
        if (typeof p.text === 'string') return p.text
        if (p.type === 'image_url') return '[image]'
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object' && typeof content.text === 'string') {
    return content.text
  }
  return String(content ?? '')
}

function estimateTextTokens(text) {
  const s = String(text || '')
  if (!s) return 0
  let cjk = 0
  let other = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0x3400 && c <= 0x9fff) cjk++
    else other++
  }
  return Math.ceil(cjk / 1.2 + other / 2.5) + 8
}

function estimateMessagesTokens(messages) {
  let n = 0
  for (const m of messages || []) {
    n += 4
    n += estimateTextTokens(messageContentToText(m?.content))
  }
  return n
}

/**
 * 本地上下文打满时压缩消息，给正文预留额度
 * Shrink local-prompt messages so generation has reserved room
 */
function trimMessagesForLocalContext(
  messages,
  ctxTokens = LOCAL_CTX_TOKENS_DEFAULT,
  reserveOut = LOCAL_OUT_RESERVE_DEFAULT
) {
  const list = Array.isArray(messages)
    ? messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
    : []
  if (!list.length) return { messages: list, trimmed: false, promptTokens: 0 }

  const budget = Math.max(1024, ctxTokens - Math.max(512, reserveOut))
  let promptTokens = estimateMessagesTokens(list)
  if (promptTokens <= budget) {
    return { messages: list, trimmed: false, promptTokens }
  }

  const systems = list.filter((m) => m.role === 'system')
  const nonsys = list.filter((m) => m.role !== 'system')
  let kept = nonsys.slice()
  while (
    kept.length > 1 &&
    estimateMessagesTokens([...systems, ...kept]) > budget
  ) {
    if (kept.length <= 2) break
    kept.splice(0, 1)
  }

  let out = [...systems, ...kept]
  promptTokens = estimateMessagesTokens(out)
  if (promptTokens <= budget) {
    return { messages: out, trimmed: true, promptTokens }
  }

  const lastIdx = out.length - 1
  if (lastIdx >= 0 && out[lastIdx].role === 'user') {
    const rawContent = out[lastIdx].content
    const raw = messageContentToText(rawContent)
    const overhead = estimateMessagesTokens(out.slice(0, lastIdx)) + 8
    const allow = Math.max(800, budget - overhead)
    const charBudget = Math.max(1200, Math.floor(allow * 1.6))
    if (raw.length > charBudget) {
      const head = Math.floor(charBudget * 0.45)
      const tail = Math.floor(charBudget * 0.45)
      const clipped =
        raw.slice(0, head) +
        '\n\n……（中间设定过长，已按本地上下文窗口截断；请仍根据保留内容完成任务）……\n\n' +
        raw.slice(-tail)
      // 多模态：只改 text 段，保留图片 / multimodal: rewrite text part only
      if (Array.isArray(rawContent)) {
        let replaced = false
        out[lastIdx] = {
          role: 'user',
          content: rawContent.map((p) => {
            if (!replaced && p && typeof p.text === 'string') {
              replaced = true
              return { ...p, text: clipped }
            }
            return p
          }),
        }
        if (!replaced) {
          out[lastIdx] = {
            role: 'user',
            content: [{ type: 'text', text: clipped }, ...rawContent],
          }
        }
      } else {
        out[lastIdx] = { role: 'user', content: clipped }
      }
    }
  }

  promptTokens = estimateMessagesTokens(out)
  return { messages: out, trimmed: true, promptTokens }
}

/** 正文像写到一半被截断（标题后无内容等） / Looks mid-generation truncated */
export function looksIncompleteAssistantOutput(text) {
  const t = String(text || '').trim()
  if (!t) return false
  if (isMissingAssistantBodyPlaceholder(t)) return true
  if (t.length < 1200) {
    if (/\n#{1,6}\s+[^\n]{0,40}$/.test(t)) return true
    if (/^#{1,6}\s+.+\n+#{1,6}\s+\S{0,24}$/.test(t)) return true
    if (/[、:：]\s*$/.test(t) && /#{1,6}\s+/.test(t)) return true
  }
  return false
}

/**
 * 续写被截断的正文（上下文打满常见）
 * Continue truncated answer body (common when context is full)
 */
async function continueIncompleteAssistantBody({
  requestBody,
  partialContent,
  currentLanguage,
  addDebugLog,
  debugRequestId,
  requestConvId,
}) {
  const zh = currentLanguage === 'zh'
  await probeAndStoreLocalCtxTokens()
  const partial = String(partialContent || '').trim().slice(0, 3500)
  const taskDigest = extractContinueTaskDigest(requestBody.messages, 1400)
  const trimmed = buildSlimContinueMessages({
    requestBody,
    currentLanguage,
    assistantPartial: partial,
    userContinue: zh
      ? '上文因上下文窗口限制被截断。请从断开处继续写完整内容，不要重复已写标题，直接接着写。'
      : 'Previous answer was truncated by context. Continue from the cut-off without repeating finished headings.',
    taskDigest,
  })
  const ctxTokens = getLocalCtxTokens()
  const room = Math.max(
    256,
    ctxTokens - (trimmed.promptTokens || 0) - 64
  )
  const contBody = {
    ...requestBody,
    messages: trimmed.messages,
    stream: false,
    max_tokens: Math.min(2048, room),
    chat_template_kwargs: {
      ...(requestBody.chat_template_kwargs || {}),
      enable_thinking: false,
    },
  }
  addDebugLog?.(
    'incomplete_body_continue_start',
    {
      request_id: debugRequestId,
      conv_id: requestConvId,
      partial_len: partial.length,
      prompt_tokens_est: trimmed.promptTokens,
      max_tokens: contBody.max_tokens,
      ctx: ctxTokens,
    },
    'warn'
  )
  const res = await fetch('ai_proxy.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contBody),
    credentials: 'same-origin',
  })
  const raw = await res.text()
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    /* ignore */
  }
  if (parsed?.error) {
    throw new Error(formatProviderError(parsed.error))
  }
  const parts = pickAssistantPartsFromChoice(parsed?.choices?.[0])
  const finalized = finalizeAssistantDisplayParts(
    parts.content,
    parts.reasoning,
    currentLanguage
  )
  const more = String(finalized.content || '').trim()
  if (!more || isMissingAssistantBodyPlaceholder(more)) {
    return { content: partial, reasoning: finalized.reasoning || '' }
  }
  const merged =
    more.length > partial.length && more.includes(partial.slice(0, 24))
      ? more
      : partial + '\n\n' + more
  return { content: merged, reasoning: finalized.reasoning || '' }
}

/** 从 choice/message 取出正文与思考（互不混用） / Split answer vs reasoning */
function pickAssistantPartsFromChoice(choice) {
  const delta = choice?.delta || null
  const msg = choice?.message || null
  const content = String(
    (delta && delta.content != null ? delta.content : null) ??
      (msg && msg.content != null ? msg.content : null) ??
      ''
  )
  const reasoning = String(
    (delta && delta.reasoning_content != null
      ? delta.reasoning_content
      : null) ??
      (msg && msg.reasoning_content != null ? msg.reasoning_content : null) ??
      (delta && delta.reasoning != null ? delta.reasoning : null) ??
      (msg && msg.reasoning != null ? msg.reasoning : null) ??
      ''
  )
  return { content, reasoning }
}

function splitThinkFromText(text) {
  if (typeof globalThis.splitAssistantThinkBlocks === 'function') {
    return globalThis.splitAssistantThinkBlocks(text)
  }
  let t = String(text || '')
  const parts = []
  t = t.replace(/<think\b[^>]*>([\s\S]*?)<\/think>/gi, (_, inner) => {
    const s = String(inner || '').trim()
    if (s) parts.push(s)
    return ''
  })
  t = t.replace(/<think\b[^>]*>([\s\S]*)$/gi, (_, inner) => {
    const s = String(inner || '').trim()
    if (s) parts.push(s)
    return ''
  })
  t = t.replace(/<\/?think\b[^>]*>/gi, '')
  return { content: t.trim(), reasoning: parts.join('\n\n').trim() }
}

function finalizeAssistantDisplayParts(content, reasoning, lang) {
  let body = String(content || '')
  let think = String(reasoning || '').trim()
  // 流式「思考中…」提示不是正文 / Streaming "Thinking…" hint is not the answer
  if (/^(思考中…|Thinking…)$/i.test(body.trim())) {
    body = ''
  }
  const fromBody = splitThinkFromText(body)
  if (fromBody.reasoning) {
    think = [think, fromBody.reasoning].filter(Boolean).join('\n\n').trim()
    body = fromBody.content
  } else {
    body = body.trim()
  }
  // reasoning 里带 </think> 时，后半段视为正文
  // If reasoning contains </think>, treat the tail as the answer body
  if (!body && think) {
    const m = think.match(/<\/think>\s*([\s\S]+)$/i)
    if (m && String(m[1] || '').trim()) {
      body = String(m[1]).trim()
      think = think
        .replace(/<\/think>[\s\S]*$/i, '')
        .replace(/<think\b[^>]*>/gi, '')
        .replace(/<\/think>/gi, '')
        .trim()
    }
  }
  if (!body && think) {
    const missing = true
    body = lang === 'zh' ? MISSING_BODY_ZH : MISSING_BODY_EN
    return { content: body, reasoning: think, missingBody: missing }
  }
  return { content: body, reasoning: think, missingBody: false }
}

/**
 * 思考模型只吐了 reasoning 时，自动续写一次正文（关闭思考）
 * When only reasoning was returned, one-shot continue without thinking
 */
async function continueMissingAssistantBody({
  requestBody,
  reasoning,
  currentLanguage,
  addDebugLog,
  debugRequestId,
  requestConvId,
}) {
  const zh = currentLanguage === 'zh'
  await probeAndStoreLocalCtxTokens()
  const thinkBrief = String(reasoning || '').trim().slice(0, 2500)
  const taskDigest = extractContinueTaskDigest(requestBody.messages, 1600)
  const trimmed = buildSlimContinueMessages({
    requestBody,
    currentLanguage,
    assistantPartial: zh
      ? '（上一轮只完成了内部思考，尚未写出正文。）'
      : '(Previous turn only finished internal reasoning.)',
    userContinue:
      (zh
        ? '请直接输出最终正文（大纲/章节等）。不要思考过程，不要 <think>。从第一条标题开始写。'
        : 'Output the final answer body only. No thinking. Start with the first heading.') +
      (thinkBrief
        ? (zh ? '\n\n【思考摘要】\n' : '\n\n[Reasoning digest]\n') + thinkBrief
        : ''),
    taskDigest,
  })
  const ctxTokens = getLocalCtxTokens()
  const room = Math.max(
    256,
    ctxTokens - (trimmed.promptTokens || 0) - 64
  )
  const contBody = {
    ...requestBody,
    messages: trimmed.messages,
    stream: false,
    max_tokens: Math.min(2048, room),
    chat_template_kwargs: {
      ...(requestBody.chat_template_kwargs || {}),
      enable_thinking: false,
    },
  }
  addDebugLog?.(
    'missing_body_continue_start',
    {
      request_id: debugRequestId,
      conv_id: requestConvId,
      model: contBody.model,
      prompt_tokens_est: trimmed.promptTokens,
      max_tokens: contBody.max_tokens,
      ctx: ctxTokens,
    },
    'warn'
  )
  const res = await fetch('ai_proxy.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contBody),
    credentials: 'same-origin',
  })
  const raw = await res.text()
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    /* ignore */
  }
  if (parsed?.error) {
    throw new Error(formatProviderError(parsed.error))
  }
  const parts = pickAssistantPartsFromChoice(parsed?.choices?.[0])
  const finalized = finalizeAssistantDisplayParts(
    parts.content,
    parts.reasoning,
    currentLanguage
  )
  if (isMissingAssistantBodyPlaceholder(finalized.content)) {
    return { content: '', reasoning: finalized.reasoning || '' }
  }
  addDebugLog?.('missing_body_continue_done', {
    request_id: debugRequestId,
    conv_id: requestConvId,
    content_length: (finalized.content || '').length,
  })
  return finalized
}

/**
 * 若首轮只有思考、或正文明显被截断：自动续写
 * If thinking-only or clearly truncated body: auto-continue
 */
async function resolveMissingBodyOrKeep({
  finalized,
  requestBody,
  currentLanguage,
  addDebugLog,
  debugRequestId,
  requestConvId,
  setLastAIMessageContent,
  setLastAIMessageReasoning,
}) {
  let streamContent = finalized?.content || ''
  const canContinue = Array.isArray(requestBody.messages)

  if (
    finalized?.missingBody &&
    finalized.reasoning &&
    canContinue
  ) {
    if (typeof setLastAIMessageContent === 'function') {
      setLastAIMessageContent(
        currentLanguage === 'zh'
          ? '（仅有思考过程，正在续写正文…）'
          : '(Thinking only — continuing for the answer…)',
        requestConvId
      )
    }
    try {
      const cont = await continueMissingAssistantBody({
        requestBody,
        reasoning: finalized.reasoning,
        currentLanguage,
        addDebugLog,
        debugRequestId,
        requestConvId,
      })
      if (cont?.content && !isMissingAssistantBodyPlaceholder(cont.content)) {
        streamContent = cont.content
        if (typeof setLastAIMessageContent === 'function') {
          setLastAIMessageContent(streamContent, requestConvId)
        }
        const mergedReason = [finalized.reasoning, cont.reasoning]
          .filter(Boolean)
          .join('\n\n')
          .trim()
        if (mergedReason && typeof setLastAIMessageReasoning === 'function') {
          setLastAIMessageReasoning(mergedReason, requestConvId)
        }
      } else if (typeof setLastAIMessageContent === 'function') {
        const tip =
          (currentLanguage === 'zh' ? MISSING_BODY_ZH : MISSING_BODY_EN) +
          (currentLanguage === 'zh'
            ? '\n\n提示：可在「设置 → 模型总设置」把 Max Tokens 调到 8192+ 后重试。'
            : '\n\nTip: set Max Tokens to 8192+ under Settings → Model General, then retry.')
        setLastAIMessageContent(tip, requestConvId)
        streamContent =
          currentLanguage === 'zh' ? MISSING_BODY_ZH : MISSING_BODY_EN
      }
    } catch (contErr) {
      addDebugLog?.(
        'missing_body_continue_error',
        {
          request_id: debugRequestId,
          conv_id: requestConvId,
          message: sanitizeErrorMessage(contErr?.message || String(contErr)),
        },
        'error'
      )
      const tip =
        (currentLanguage === 'zh' ? MISSING_BODY_ZH : MISSING_BODY_EN) +
        (currentLanguage === 'zh'
          ? '\n\n续写失败：' +
            sanitizeErrorMessage(contErr?.message || String(contErr))
          : '\n\nContinue failed: ' +
            sanitizeErrorMessage(contErr?.message || String(contErr)))
      if (typeof setLastAIMessageContent === 'function') {
        setLastAIMessageContent(tip, requestConvId)
      }
      streamContent =
        currentLanguage === 'zh' ? MISSING_BODY_ZH : MISSING_BODY_EN
    }
  }

  // 有正文但像写到「## 一、」就停：再续一次
  // Has body but looks cut off after a bare heading: continue once more
  if (
    canContinue &&
    looksIncompleteAssistantOutput(streamContent) &&
    !isMissingAssistantBodyPlaceholder(streamContent)
  ) {
    if (typeof setLastAIMessageContent === 'function') {
      setLastAIMessageContent(
        streamContent +
          (currentLanguage === 'zh'
            ? '\n\n（检测到输出被上下文截断，正在续写…）'
            : '\n\n(Output truncated by context — continuing…)'),
        requestConvId
      )
    }
    try {
      const cont = await continueIncompleteAssistantBody({
        requestBody,
        partialContent: streamContent,
        currentLanguage,
        addDebugLog,
        debugRequestId,
        requestConvId,
      })
      if (cont?.content) {
        streamContent = cont.content
        if (typeof setLastAIMessageContent === 'function') {
          setLastAIMessageContent(streamContent, requestConvId)
        }
      }
    } catch (contErr) {
      addDebugLog?.(
        'incomplete_body_continue_error',
        {
          request_id: debugRequestId,
          conv_id: requestConvId,
          message: sanitizeErrorMessage(contErr?.message || String(contErr)),
        },
        'error'
      )
      const tip =
        streamContent +
        (currentLanguage === 'zh'
          ? '\n\n（续写失败：上下文可能仍不足。请缩短设定后重试，或重启 llama 并提高 -c 上下文。）\n' +
            sanitizeErrorMessage(contErr?.message || String(contErr))
          : '\n\n(Continue failed: context may still be too small. Shorten the prompt or raise llama -c.)\n' +
            sanitizeErrorMessage(contErr?.message || String(contErr)))
      if (typeof setLastAIMessageContent === 'function') {
        setLastAIMessageContent(tip, requestConvId)
      }
    }
  }

  return streamContent
}

function failoverNotice(nextLabel, reason) {
  const { i18n, currentLanguage } = getI18nBundle()
  const base =
    i18n[currentLanguage].auto_switch_notice ||
    (currentLanguage === 'zh' ? '🔄 切换至：' : '🔄 Switching to: ')
  const why =
    currentLanguage === 'zh'
      ? reason
        ? `（${reason}）`
        : ''
      : reason
        ? ` (${reason})`
        : ''
  return '\n' + base + nextLabel + why + '\n'
}

// Normalize UI markers from input before building prompts.
export function normalizeUserInputText(raw) {
  return String(raw || '')
    .replace(/\s*\[图片\]\s*/g, ' ')
    .replace(/\s*\[文件:[^\]]+\]\s*/g, ' ')
    .trim()
}

// Build compact upload status tags for chat history rendering.
export function buildUploadDisplayMeta(
  currentBase64,
  currentUploadMeta,
  currentPdfPageImages
) {
  const mediaTag = currentBase64
    ? ' [图片]'
    : currentUploadMeta
      ? ` [文件:${currentUploadMeta.name}]`
      : ''
  const scanTag =
    Array.isArray(currentPdfPageImages) && currentPdfPageImages.length > 0
      ? ` [扫描页:${currentPdfPageImages.length}]`
      : ''
  return mediaTag + scanTag
}

// Resolve mode prompt config from centralized registry with safe fallback.
export function getModePromptConfig() {
  const modeMap = getModeConfig().modeMap || {}
  const chatLikeCategories = Object.keys(modeMap).filter(
    (k) => modeMap[k]?.isChatLike
  )
  if (!chatLikeCategories.length) {
    chatLikeCategories.push('chat', 'code', 'ocr', 'vision', 'translation')
  }
  const categorySystemPrompts = {
    code: '你是一个高级编程助手。请根据用户需求生成高质量代码，或对用户提供的代码进行分析、优化、调试。回复中使用 Markdown 代码块格式，注明编程语言。解释要简明扼要。',
    ocr:
      modeMap.ocr?.systemPrompt ||
      '你是一个专业的文字识别(OCR)助手。请准确识别用户上传图片中的所有文字内容，严格按照原始排版格式输出，不要遗漏任何文字，不要添加额外解释。',
    vision:
      modeMap.vision?.systemPrompt ||
      '你是一个专业的图像分析助手，擅长视觉理解。根据用户的指令分析上传的图片。你可以：分析服装穿搭与造型风格、描述场景与物体、解读图表数据、鉴别物品、评估设计等。请给出准确、详细且有条理的分析结果。',
    translation:
      modeMap.translation?.systemPrompt ||
      '你是一个专业翻译助手。请将用户提供的文本翻译为目标语言。如果用户没有指定目标语言：中文内容翻译为英文，其他语言翻译为中文。保持原文的格式和语气，翻译要自然流畅。如果用户上传了图片，请先识别图中文字再进行翻译。',
  }
  const categoryDefaultText = {
    ocr:
      modeMap.ocr?.defaultText ||
      '请识别这张图片中的所有文字，按原始排版输出。',
    vision: modeMap.vision?.defaultText || '请详细分析这张图片的内容。',
    translation:
      modeMap.translation?.defaultText || '请翻译这张图片中的所有文字。',
  }
  return { chatLikeCategories, categorySystemPrompts, categoryDefaultText }
}

export function buildHistoryMessagesForRequest(convId) {
  const conv = globalThis.conversations.find((c) => c.id === convId)
  if (!conv || !Array.isArray(conv.messages) || conv.messages.length === 0)
    return []

  // Exclude the latest user message, which will be rebuilt with current upload context.
  const source = conv.messages.slice(0, -1)
  const history = []

  for (const msg of source) {
    if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) continue
    if (msg.role === 'assistant') {
      const text = String(msg.content || '').trim()
      if (!text) continue
      history.push({ role: 'assistant', content: text })
      continue
    }

    // Normalize UI markers and category prefixes in stored user display text.
    const raw = String(msg.content || '')
    const cleaned = normalizeUserInputText(
      raw.replace(/^\[(文生图|图生图|编程|文字识别|图像理解|翻译)\]\s*/i, '')
    )
    const hasImage =
      typeof msg.image === 'string' && msg.image.startsWith('data:image/')
    if (hasImage) {
      const content = []
      if (cleaned) content.push({ type: 'text', text: cleaned })
      content.push({ type: 'image_url', image_url: { url: msg.image } })
      history.push({ role: 'user', content })
    } else if (cleaned) {
      history.push({ role: 'user', content: cleaned })
    }
  }
  return history
}

// Build request payload for chat/image/video paths without side effects.
export function buildRequestPayload(ctx) {
  const {
    category,
    imageMode,
    text,
    currentBase64,
    currentUploadMeta,
    currentPdfText,
    currentFileText,
    currentPdfPageImages,
    convId,
  } = ctx

  const { chatLikeCategories, categorySystemPrompts, categoryDefaultText } =
    getModePromptConfig()
  const isChatLike = chatLikeCategories.includes(category)

  let finalPrompt = text
  let finalMessages = null
  let userText = text || ''

  if (isChatLike) {
    const currentActivePresetId = globalThis.currentActivePresetId || {
      system: null,
      role: null,
    }
    const presets = globalThis.presets || []
    const currentLanguage =
      typeof globalThis.currentLanguage === 'string'
        ? globalThis.currentLanguage
        : 'zh'
    const activeSystemId = currentActivePresetId.system
    const systemPreset = presets.find(
      (p) => p.id === activeSystemId && p.type === 'system'
    )

    userText = text || categoryDefaultText[category] || text
    if (
      (category === 'ocr' || category === 'translation') &&
      currentUploadMeta?.isPdf &&
      currentPdfText
    ) {
      userText =
        (text || categoryDefaultText[category] || '请处理这份PDF文本。') +
        '\n\n[PDF文本]\n' +
        currentPdfText
    } else if (
      (category === 'ocr' || category === 'translation') &&
      currentUploadMeta?.isPdf &&
      currentPdfPageImages.length > 0
    ) {
      userText =
        (text ||
          categoryDefaultText[category] ||
          '请识别并处理这份扫描PDF内容。') +
        `\n\n[说明] 该PDF为扫描版，已附加 ${currentPdfPageImages.length} 页图像，请逐页识别。`
    } else if (
      (category === 'code' || category === 'chat') &&
      String(currentFileText || '').trim()
    ) {
      const fname = currentUploadMeta?.name || 'upload'
      userText =
        (text || categoryDefaultText[category] || '请根据上传的文件协助处理。') +
        `\n\n[文件:${fname}]\n` +
        String(currentFileText)
    }

    let content = [{ type: 'text', text: userText }]
    if (currentBase64) {
      content.push({ type: 'image_url', image_url: { url: currentBase64 } })
    }
    if (currentPdfPageImages.length > 0) {
      currentPdfPageImages.forEach((img) => {
        content.push({ type: 'image_url', image_url: { url: img } })
      })
    }

    finalMessages = []
    if (categorySystemPrompts[category]) {
      finalMessages.push({
        role: 'system',
        content: categorySystemPrompts[category],
      })
    } else if (systemPreset) {
      finalMessages.push({ role: 'system', content: systemPreset.content })
    }
    const preferredUserAddress =
      typeof globalThis.getPreferredUserAddress === 'function'
        ? globalThis.getPreferredUserAddress()
        : ''
    if (preferredUserAddress) {
      finalMessages.push({
        role: 'system',
        content:
          currentLanguage === 'zh'
            ? `请将用户称呼为“${preferredUserAddress}”。在自然对话中可偶尔使用，不要每句都重复。`
            : `Address the user as "${preferredUserAddress}" naturally. Use it occasionally and avoid repeating it in every sentence.`,
      })
    }
    const ragPrompt =
      typeof globalThis.buildRagSystemPrompt === 'function'
        ? globalThis.buildRagSystemPrompt(userText)
        : ''
    if (ragPrompt) {
      finalMessages.push({
        role: 'system',
        content: ragPrompt,
      })
      // 助手气泡尚未创建：先暂存，等发送链路再挂载
      // Assistant bubble not created yet — stash until execute path
      if (typeof globalThis.getRagLastHits === 'function') {
        const hits = globalThis.getRagLastHits() || []
        if (hits.length) {
          globalThis.__pendingRagCitations = {
            convId: ctx.convId || globalThis.currentConvId,
            hits,
          }
        }
      }
    }
    const personaHint =
      typeof globalThis.getActivePersonaSystemHint === 'function'
        ? String(globalThis.getActivePersonaSystemHint() || '').trim()
        : ''
    if (personaHint) {
      finalMessages.push({ role: 'system', content: personaHint })
    }
    finalMessages.push(...buildHistoryMessagesForRequest(convId))
    finalMessages.push({ role: 'user', content: content })
  } else if (category === 'image') {
    const currentActivePresetId = globalThis.currentActivePresetId || {
      system: null,
      role: null,
    }
    const presets = globalThis.presets || []
    const activeRoleId = currentActivePresetId.role
    const rolePreset = presets.find(
      (p) => p.id === activeRoleId && p.type === 'role'
    )
    // 去掉重试/编辑时叠上的 [文生图] 标签，避免污染出图提示词
    // Strip stacked category tags from retries/edits
    let imageText = String(text || '')
      .replace(/^(?:\[(?:文生图|图生图)\]\s*)+/gi, '')
      .trim()
    const roleText = String(rolePreset?.content || '').trim()
    // 图生图：跳过「写实人像」类预设——会强行拉成 portrait，看起来像只重绘参考图
    // img2img: skip portrait role presets that fight outfit/scene changes
    const portraitLike =
      /portrait|人像|特写|close[\s-]?up|headshot/i.test(roleText) ||
      /realistic portrait of a person/i.test(roleText)
    if (roleText && !(imageMode === 'img2img' && portraitLike)) {
      // 用户描述放最前：角色预设只作风格补充
      finalPrompt = imageText ? `${imageText}\n${roleText}` : roleText
    } else {
      finalPrompt = imageText
    }
    if (imageMode === 'img2img' && finalPrompt) {
      // 把「改什么」放前，减弱参考图构图锁死
      finalPrompt =
        `change outfit and scene according to prompt, keep same face identity, full body visible\n` +
        finalPrompt
    }
  }

  const requestBody = {
    model: ctx.modelValue,
    task: isChatLike ? 'chat' : category,
    prompt: finalPrompt,
    stream: isChatLike,
    // Default client marker for first-party Ada Chat requests.
    client: 'adachat',
  }
  if (isChatLike) {
    const t = parseFloat(localStorage.getItem('samplingTemperature') || '0.7')
    if (Number.isFinite(t)) {
      requestBody.temperature = Math.max(0, Math.min(2, t))
    }
    const topP = parseFloat(localStorage.getItem('samplingTopP') || '1')
    if (Number.isFinite(topP)) {
      requestBody.top_p = Math.max(0, Math.min(1, topP))
    }
    const presencePenalty = parseFloat(
      localStorage.getItem('samplingPresencePenalty') || '0'
    )
    if (Number.isFinite(presencePenalty)) {
      requestBody.presence_penalty = Math.max(-2, Math.min(2, presencePenalty))
    }
    const frequencyPenalty = parseFloat(
      localStorage.getItem('samplingFrequencyPenalty') || '0'
    )
    if (Number.isFinite(frequencyPenalty)) {
      requestBody.frequency_penalty = Math.max(
        -2,
        Math.min(2, frequencyPenalty)
      )
    }
    const maxTokensRaw = (
      localStorage.getItem('samplingMaxTokens') || ''
    ).trim()
    if (maxTokensRaw !== '') {
      const mt = parseInt(maxTokensRaw, 10)
      if (Number.isFinite(mt) && mt > 0) {
        requestBody.max_tokens = mt
      }
    }
    const stopRaw = localStorage.getItem('samplingStopSequences') || ''
    const stopList = stopRaw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8)
    if (stopList.length) {
      requestBody.stop = stopList
    }
    // 本地 Vulkan/HTTP：压缩过长设定，预留生成额度，避免写到一半被截断
    // Local Vulkan/HTTP: trim huge prompts and reserve room for generation
    if (
      requestBody.max_tokens == null &&
      isLocalHttpProviderSelected()
    ) {
      requestBody.max_tokens = 8192
    }
    if (isLocalHttpProviderSelected() && Array.isArray(finalMessages)) {
      const ctxTokens = getLocalCtxTokens()
      const trimmed = trimMessagesForLocalContext(
        finalMessages,
        ctxTokens,
        LOCAL_OUT_RESERVE_DEFAULT
      )
      finalMessages = trimmed.messages
      const room = Math.max(
        256,
        ctxTokens - (trimmed.promptTokens || 0) - 64
      )
      const want = Number(requestBody.max_tokens) || LOCAL_OUT_RESERVE_DEFAULT
      requestBody.max_tokens = Math.min(want, room, 8192)
      if (trimmed.trimmed && typeof globalThis.showAppToast === 'function') {
        const { currentLanguage } = getI18nBundle()
        globalThis.showAppToast(
          currentLanguage === 'zh'
            ? '设定过长：已按本地上下文窗口自动截断，并为正文预留额度'
            : 'Prompt trimmed to fit local context and reserve answer tokens',
          3200
        )
      }
    }
  }
  if (category === 'image') {
    requestBody.mode = imageMode
    if (imageMode === 'img2img' && currentBase64) {
      requestBody.image = currentBase64
      const strength = parseFloat($('imageStrength')?.value || '0.85')
      requestBody.strength = Number.isFinite(strength) ? strength : 0.85
    }
    const loraId = String($('imageLora')?.value || '').trim()
    if (loraId) {
      requestBody.lora_id = loraId
      const scale = parseFloat($('imageLoraScale')?.value || '0.8')
      requestBody.lora_scale = Number.isFinite(scale) ? scale : 0.8
    }
  } else if (category === 'video' && currentBase64) {
    requestBody.image = currentBase64
  } else if (isChatLike) {
    requestBody.messages = finalMessages
    if (typeof globalThis.buildRagRequestPayload === 'function') {
      requestBody.rag = globalThis.buildRagRequestPayload(userText)
    }
  } else {
    requestBody.prompt = text
  }

  return { requestBody, isChatLike }
}

// Execute request with model fallback, streaming parse, and retry policy.
export async function executeRequestWithFallback(ctx) {
  const {
    requestBody,
    isChatLike,
    category,
    requestConvId,
    debugRequestId,
    totalTimeout,
    idleTimeout,
  } = ctx

  const { i18n, currentLanguage } = getI18nBundle()
  const PluginSystem = globalThis.PluginSystem
  const addDebugLog = globalThis.addDebugLog
  const updateLastAssistantRequestMeta =
    globalThis.updateLastAssistantRequestMeta
  const appendToLastAIMessage = globalThis.appendToLastAIMessage
  const setLastAIMessageContent = globalThis.setLastAIMessageContent
  const setLastAIMessageReasoning = globalThis.setLastAIMessageReasoning
  const finishAIMessage = globalThis.finishAIMessage

  const autoSwitch =
    typeof globalThis.isAutoSwitchEnabled === 'function' &&
    globalThis.isAutoSwitchEnabled()
  let modelsToTry = [requestBody.model]
  if (autoSwitch) {
    modelsToTry = [
      ...modelsToTry,
      ...(typeof globalThis.getAlternateModels === 'function'
        ? globalThis.getAlternateModels(category, requestBody.model)
        : []),
    ]
  }

  const flushPendingRagCitations = () => {
    const pending = globalThis.__pendingRagCitations
    if (
      !pending ||
      pending.convId !== requestConvId ||
      !Array.isArray(pending.hits) ||
      !pending.hits.length
    ) {
      return
    }
    if (typeof appendToLastAIMessage === 'function') {
      // 确保存在助手消息再挂引用 / Ensure assistant msg exists before attach
      const conv = (globalThis.conversations || []).find(
        (c) => c.id === requestConvId
      )
      const last = conv?.messages?.[conv.messages.length - 1]
      if (!last || last.role !== 'assistant') {
        appendToLastAIMessage('', requestConvId)
      }
    }
    if (typeof globalThis.attachRagCitationsToLastAssistant === 'function') {
      globalThis.attachRagCitationsToLastAssistant(
        requestConvId,
        pending.hits
      )
    }
    globalThis.__pendingRagCitations = null
  }
  if (isChatLike) flushPendingRagCitations()

  const allow = await PluginSystem.runHook('beforeSend', requestBody)
  if (!allow) {
    console.log('发送被插件拦截')
    addDebugLog(
      'request_blocked_by_plugin',
      {
        request_id: debugRequestId,
        conv_id: requestConvId,
      },
      'warn'
    )
    globalThis.isReceiving = false
    $('sendBtn').disabled = false
    return
  }

  for (let mi = 0; mi < modelsToTry.length; mi++) {
    requestBody.model = modelsToTry[mi]

    if (mi > 0) {
      const label =
        typeof globalThis.getModelLabel === 'function'
          ? globalThis.getModelLabel(modelsToTry[mi])
          : String(modelsToTry[mi] || '')
      updateLastAssistantRequestMeta(requestConvId, { model: modelsToTry[mi] })
      appendToLastAIMessage(
        failoverNotice(
          label,
          currentLanguage === 'zh' ? '上家失败，自动重试' : 'previous failed'
        ),
        requestConvId
      )
      addDebugLog(
        'model_switch',
        {
          request_id: debugRequestId,
          conv_id: requestConvId,
          to_model: modelsToTry[mi],
          to_label: label,
        },
        'warn'
      )
      if (typeof globalThis.showAutoSwitchToast === 'function')
        globalThis.showAutoSwitchToast(label)
      // 同步供应商+模型下拉，避免 UI 仍显示旧模型
      // Sync provider+model selects so UI matches the active attempt
      const nextVal = String(modelsToTry[mi] || '')
      const nextProvider = nextVal.includes('::') ? nextVal.split('::')[0] : ''
      syncUiToResolvedSelection(
        category,
        nextProvider || $('providerSelect')?.value,
        nextVal,
        $('imageMode')?.value
      )
    }

    let shouldRetry = false
    const attemptStartedAt = Date.now()

    try {
      const useTools =
        isChatLike &&
        typeof globalThis.shouldAttachTools === 'function' &&
        globalThis.shouldAttachTools()

      if (useTools && typeof globalThis.runToolCallingChat === 'function') {
        const statusPrefix =
          currentLanguage === 'zh' ? '\n⚙️ 调用工具：' : '\n⚙️ Tool: '
        const result = await globalThis.runToolCallingChat(
          { ...requestBody, stream: false },
          (label) => {
            appendToLastAIMessage(statusPrefix + label, requestConvId)
          },
          { convId: requestConvId }
        )
        addDebugLog('tool_calling_done', {
          request_id: debugRequestId,
          conv_id: requestConvId,
          rounds: result.rounds,
          error: result.error || '',
          diag: result.diag || '',
        })
        if (result.error && !result.content) {
          const coded = result.diag
            ? `[${result.diag}] ${result.error}`
            : result.error
          throw new Error(coded)
        }
        if (result.content) {
          // 状态行之后追加最终回答；若尚无内容则整段写入
          appendToLastAIMessage(
            (result.rounds > 0 ? '\n\n' : '') + result.content,
            requestConvId
          )
        } else {
          appendToLastAIMessage('[空响应]', requestConvId)
        }
        await PluginSystem.runHook('afterResponse', {
          requestBody,
          response: { status: 200, ok: true, headers: {} },
          category,
          isChatLike,
          requestConvId,
          requestId: debugRequestId,
          attemptIndex: mi,
          toolRounds: result.rounds,
        })
        if (typeof finishAIMessage === 'function') finishAIMessage(requestConvId)
        break
      }

      const abortController = new AbortController()
      const response = await fetch('ai_proxy.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      })
      addDebugLog('response_received', {
        request_id: debugRequestId,
        conv_id: requestConvId,
        model: requestBody.model,
        status: response.status,
        attempt_ms: Date.now() - attemptStartedAt,
      })
      // 向量 RAG 引用（响应头，UTF-8 Base64）/ Vector RAG citations header
      if (typeof globalThis.applyRagCitationsFromResponse === 'function') {
        globalThis.applyRagCitationsFromResponse(response, requestConvId)
      }
      const responseHeaders = {}
      try {
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value
        })
      } catch {}
      await PluginSystem.runHook('afterResponse', {
        requestBody,
        response: {
          status: response.status,
          ok: response.ok,
          headers: responseHeaders,
        },
        category,
        isChatLike,
        requestConvId,
        requestId: debugRequestId,
        attemptIndex: mi,
      })

      if (
        response.status === 429 &&
        autoSwitch &&
        mi < modelsToTry.length - 1
      ) {
        shouldRetry = true
      } else if (!response.ok) {
        let errDetail = ''
        try {
          errDetail = await formatGatewayHttpError(response)
        } catch (_) {
          errDetail = `HTTP error ${response.status}`
        }
        if (
          autoSwitch &&
          mi < modelsToTry.length - 1 &&
          !isLocalInferenceSetupError(errDetail) &&
          canAutoFailover(errDetail)
        ) {
          shouldRetry = true
        }
        if (!shouldRetry) {
          const hint =
            autoSwitch && mi >= modelsToTry.length - 1
              ? currentLanguage === 'zh'
                ? '\n（已尝试备用模型，仍失败。可在设置中调整自动切换列表或稍后重试。）'
                : '\n(Tried fallback models. Adjust auto-switch list or retry later.)'
              : !autoSwitch
                ? currentLanguage === 'zh'
                  ? '\n（提示：开启「模型自动切换」可在限流/网关抖动时换模型重试。）'
                  : '\n(Tip: enable Auto-switch to retry on rate limits / gateway errors.)'
                : ''
          throw new Error(errDetail + hint)
        }
      }

      if (!shouldRetry && isChatLike) {
        const ctype = String(
          response.headers.get('content-type') || ''
        ).toLowerCase()
        const isSSE = ctype.includes('text/event-stream')
        let streamContent = ''
        const isLocalInference =
          String(response.headers.get('x-adachat-local-inference') || '')
            .toLowerCase() === 'direct' || isLocalHttpProviderSelected()

        const abortStream = async (reader) => {
          try {
            abortController.abort()
          } catch {
            /* ignore */
          }
          try {
            if (reader) await reader.cancel()
          } catch {
            /* ignore */
          }
        }

        // Fallback path: some providers return non-SSE JSON even when stream=true.
        if (!isSSE) {
          const raw = await response.text()
          let parsed = null
          try {
            parsed = JSON.parse(raw)
          } catch (_) {}
          const parts = pickAssistantPartsFromChoice(parsed?.choices?.[0])
          const finalized = finalizeAssistantDisplayParts(
            parts.content,
            parts.reasoning,
            currentLanguage
          )
          if (finalized.content || finalized.reasoning) {
            streamContent = finalized.content
            if (typeof setLastAIMessageContent === 'function') {
              setLastAIMessageContent(streamContent, requestConvId)
            } else {
              appendToLastAIMessage(streamContent, requestConvId)
            }
            if (
              finalized.reasoning &&
              typeof setLastAIMessageReasoning === 'function'
            ) {
              setLastAIMessageReasoning(finalized.reasoning, requestConvId)
            }
            streamContent = await resolveMissingBodyOrKeep({
              finalized,
              requestBody,
              currentLanguage,
              addDebugLog,
              debugRequestId,
              requestConvId,
              setLastAIMessageContent,
              setLastAIMessageReasoning,
            })
          } else if (parsed?.error) {
            streamContent = String(parsed.error)
            appendToLastAIMessage(streamContent, requestConvId)
          } else if (raw && raw.trim()) {
            streamContent = raw.trim()
            appendToLastAIMessage(streamContent, requestConvId)
          } else {
            appendToLastAIMessage('[空响应]', requestConvId)
          }
        } else {
          const reader = response.body.getReader()
          const decoder = new TextDecoder('utf-8')
          let buffer = ''
          let rawStreamText = ''
          let streamReasoning = ''
          let thinkingHintShown = false
          const thinkingHint =
            currentLanguage === 'zh' ? '思考中…' : 'Thinking…'
          const startTime = Date.now()
          let lastActivity = Date.now()
          // 本地 GGUF 首次加载常超过默认 600s；放宽总超时与空闲超时
          // Local GGUF cold-start often exceeds default 600s; relax both timeouts
          const effectiveIdleTimeout = isLocalInference
            ? Math.max(idleTimeout, 900000)
            : idleTimeout
          const effectiveTotalTimeout = isLocalInference
            ? Math.max(totalTimeout, 2400000)
            : totalTimeout

          const consumeLine = (line) => {
            const trimmed = String(line || '').trim()
            if (!trimmed || trimmed.startsWith(':')) return
            if (!trimmed.startsWith('data:')) return
            const data = trimmed.substring(5).trim()
            if (!data || data === '[DONE]') return
            try {
              const parsed = JSON.parse(data)
              const errMsg =
                parsed?.error?.message ||
                (typeof parsed?.error === 'string' ? parsed.error : '')
              if (errMsg) {
                throw new Error(String(errMsg))
              }
              const parts = pickAssistantPartsFromChoice(parsed.choices?.[0])
              if (parts.reasoning) {
                streamReasoning += parts.reasoning
                if (!streamContent && !thinkingHintShown) {
                  thinkingHintShown = true
                  appendToLastAIMessage(thinkingHint, requestConvId)
                }
              }
              if (parts.content) {
                if (thinkingHintShown && !streamContent) {
                  streamContent = parts.content
                  if (typeof setLastAIMessageContent === 'function') {
                    setLastAIMessageContent(streamContent, requestConvId)
                  } else {
                    appendToLastAIMessage(streamContent, requestConvId)
                  }
                } else {
                  streamContent += parts.content
                  appendToLastAIMessage(parts.content, requestConvId)
                }
              }
            } catch (e) {
              if (e instanceof Error && e.message && data && !data.startsWith('{')) {
                console.warn('解析流数据失败', e, data)
                return
              }
              throw e
            }
          }

          while (true) {
            if (Date.now() - startTime > effectiveTotalTimeout) {
              await abortStream(reader)
              throw new Error(
                `响应超时（超过 ${effectiveTotalTimeout / 1000} 秒）` +
                  (isLocalInference
                    ? '。本地模型首次加载/预填充较慢，可在「设置 → 模型总设置」再调高总超时，或换更小的 GGUF / 缩短上下文。'
                    : '')
              )
            }
            if (Date.now() - lastActivity > effectiveIdleTimeout) {
              await abortStream(reader)
              throw new Error(
                `${effectiveIdleTimeout / 1000} 秒内无数据，连接可能已断开` +
                  (isLocalInference
                    ? '（已中止上游请求以释放 GPU 算力；常驻模型显存会保留到停止 llama-server）'
                    : '')
              )
            }
            let readResult = null
            while (readResult === null) {
              if (Date.now() - lastActivity > effectiveIdleTimeout) {
                await abortStream(reader)
                throw new Error(
                  `${effectiveIdleTimeout / 1000} 秒内无数据，连接可能已断开` +
                    (isLocalInference
                      ? '（已中止上游请求以释放 GPU 算力；常驻模型显存会保留到停止 llama-server）'
                      : '')
                )
              }
              readResult = await Promise.race([
                reader.read(),
                new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
              ])
            }
            const { done, value } = readResult
            if (done) break
            lastActivity = Date.now()
            const chunkText = decoder.decode(value, { stream: true })
            rawStreamText += chunkText
            buffer += chunkText
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              consumeLine(line)
            }
          }

          // Flush tail buffer without trailing newline.
          if (buffer && buffer.trim()) {
            consumeLine(buffer)
          }

          // Last fallback for non-standard streaming payloads.
          if (!streamContent && rawStreamText.trim() && !isLocalInference) {
            let parsed = null
            try {
              parsed = JSON.parse(rawStreamText)
            } catch (_) {}
            const parts = pickAssistantPartsFromChoice(parsed?.choices?.[0])
            if (parts.content) streamContent += parts.content
            if (parts.reasoning) streamReasoning += parts.reasoning
          }

          const finalized = finalizeAssistantDisplayParts(
            streamContent,
            streamReasoning,
            currentLanguage
          )
          streamContent = finalized.content
          if (typeof setLastAIMessageContent === 'function') {
            setLastAIMessageContent(streamContent, requestConvId)
          }
          if (
            finalized.reasoning &&
            typeof setLastAIMessageReasoning === 'function'
          ) {
            setLastAIMessageReasoning(finalized.reasoning, requestConvId)
          }
          streamContent = await resolveMissingBodyOrKeep({
            finalized,
            requestBody,
            currentLanguage,
            addDebugLog,
            debugRequestId,
            requestConvId,
            setLastAIMessageContent,
            setLastAIMessageReasoning,
          })
        }

        // 本地直连：空流不再二次加载；给可读错误，避免空白气泡卡死观感
        // Local direct: no second load; surface a readable empty-output error
        if (
          !shouldRetry &&
          isLocalInference &&
          (!streamContent || !String(streamContent).trim()) &&
          !isMissingAssistantBodyPlaceholder(streamContent)
        ) {
          streamContent =
            currentLanguage === 'zh'
              ? '[错误] 本地推理无输出（worker 可能未拉起或已崩溃）'
              : '[Error] Local inference returned no output (worker may have failed)'
          if (typeof setLastAIMessageContent === 'function') {
            setLastAIMessageContent(streamContent, requestConvId)
          } else {
            appendToLastAIMessage(streamContent, requestConvId)
          }
          addDebugLog(
            'local_stream_empty',
            {
              request_id: debugRequestId,
              conv_id: requestConvId,
              model: requestBody.model,
            },
            'error'
          )
        }

        // If stream path produced no visible text, retry once in non-stream mode.
        // 本地 GGUF 加载耗时长，禁止 fallback 二次加载同一模型。
        if (
          !shouldRetry &&
          !isLocalInference &&
          (!streamContent || !String(streamContent).trim())
        ) {
          addDebugLog(
            'stream_empty_fallback_start',
            {
              request_id: debugRequestId,
              conv_id: requestConvId,
              model: requestBody.model,
            },
            'warn'
          )
          try {
            const fallbackBody = { ...requestBody, stream: false }
            const fallbackRes = await fetch('ai_proxy.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(fallbackBody),
            })
            const fallbackRaw = await fallbackRes.text()
            let fallbackJson = null
            try {
              fallbackJson = JSON.parse(fallbackRaw)
            } catch (_) {}
            const fbParts = pickAssistantPartsFromChoice(
              fallbackJson?.choices?.[0]
            )
            const fbFinal = finalizeAssistantDisplayParts(
              fbParts.content,
              fbParts.reasoning,
              currentLanguage
            )
            if (fbFinal.content || fbFinal.reasoning) {
              streamContent = fbFinal.content
              if (typeof setLastAIMessageContent === 'function') {
                setLastAIMessageContent(streamContent, requestConvId)
              } else {
                appendToLastAIMessage(streamContent, requestConvId)
              }
              if (
                fbFinal.reasoning &&
                typeof setLastAIMessageReasoning === 'function'
              ) {
                setLastAIMessageReasoning(fbFinal.reasoning, requestConvId)
              }
            } else if (fallbackJson?.error) {
              streamContent = String(fallbackJson.error)
              appendToLastAIMessage(streamContent, requestConvId)
            } else if ((fallbackRaw || '').trim()) {
              streamContent = (fallbackRaw || '').trim()
              appendToLastAIMessage(streamContent, requestConvId)
            } else {
              appendToLastAIMessage('[空回复]', requestConvId)
            }
            addDebugLog(
              'stream_empty_fallback_done',
              {
                request_id: debugRequestId,
                conv_id: requestConvId,
                model: requestBody.model,
                content_length: (streamContent || '').length,
              },
              'warn'
            )
          } catch (fallbackErr) {
            addDebugLog(
              'stream_empty_fallback_error',
              {
                request_id: debugRequestId,
                conv_id: requestConvId,
                model: requestBody.model,
                message: sanitizeErrorMessage(
                  fallbackErr?.message || String(fallbackErr)
                ),
              },
              'error'
            )
          }
        }

        if (
          autoSwitch &&
          mi < modelsToTry.length - 1 &&
          canAutoFailover(streamContent)
        ) {
          shouldRetry = true
        }
        addDebugLog('stream_finished', {
          request_id: debugRequestId,
          conv_id: requestConvId,
          model: requestBody.model,
          content_length: streamContent.length,
        })
      } else if (!shouldRetry) {
        const result = await response.json()
        if (result.error) {
          const errText = formatProviderError(result.error)
          if (
            autoSwitch &&
            mi < modelsToTry.length - 1 &&
            canAutoFailover(errText)
          ) {
            appendToLastAIMessage('[' + errText + ']', requestConvId)
            shouldRetry = true
          } else {
            let errLine = '错误：' + errText
            if (result.install_hint) {
              errLine += '\n' + result.install_hint
            } else if (result.hint) {
              errLine += '\n' + result.hint
            }
            appendToLastAIMessage(errLine, requestConvId)
          }
        } else if (category === 'video' && isVideoJobResponse(result)) {
          await pollVideoJobUntilDone(result.job_id, requestConvId, {
            append: appendToLastAIMessage,
            updateMeta: (meta) =>
              updateLastAssistantRequestMeta(requestConvId, meta),
          })
        } else if (category === 'image' && isImageJobResponse(result)) {
          await pollImageJobUntilDone(result.job_id, requestConvId, {
            append: appendToLastAIMessage,
            updateMeta: (meta) =>
              updateLastAssistantRequestMeta(requestConvId, meta),
          })
        } else {
          let imageUrl = null
          if (result.data && result.data[0] && result.data[0].url) {
            imageUrl = result.data[0].url
          } else if (result.images && result.images[0]) {
            imageUrl = result.images[0]
          } else if (result.image) {
            imageUrl = result.image
          } else if (
            result.output &&
            result.output[0] &&
            result.output[0].url
          ) {
            imageUrl = result.output[0].url
          }
          if (imageUrl) {
            appendToLastAIMessage('生成图片：' + imageUrl, requestConvId)
          } else {
            appendToLastAIMessage(
              JSON.stringify(result, null, 2),
              requestConvId
            )
          }
        }
      }

      if (shouldRetry) {
        addDebugLog(
          'request_retry',
          {
            request_id: debugRequestId,
            conv_id: requestConvId,
            model: requestBody.model,
          },
          'warn'
        )
        continue
      }
      addDebugLog('request_success', {
        request_id: debugRequestId,
        conv_id: requestConvId,
        model: requestBody.model,
      })
      break
    } catch (e) {
      console.error('请求失败', e)
      addDebugLog(
        'request_error',
        {
          request_id: debugRequestId,
          conv_id: requestConvId,
          model: requestBody.model,
          attempt_ms: Date.now() - attemptStartedAt,
          message: sanitizeErrorMessage(e.message),
        },
        'error'
      )
      if (
        autoSwitch &&
        mi < modelsToTry.length - 1 &&
        canAutoFailover(e.message) &&
        !isLocalInferenceSetupError(e.message)
      ) {
        continue
      }
      const tip =
        !autoSwitch && canAutoFailover(e.message)
          ? currentLanguage === 'zh'
            ? '\n（可开启「模型自动切换」以便失败时换模型重试）'
            : '\n(Enable Auto-switch to retry with another model)'
          : ''
      appendToLastAIMessage('\n\n[错误] ' + e.message + tip, requestConvId)
      break
    }
  }

  addDebugLog('request_end', {
    request_id: debugRequestId,
    conv_id: requestConvId,
  })
  finishAIMessage(requestConvId)
}

export async function ensurePdfPreparedForRecognition(
  category,
  currentUploadMeta,
  currentPdfText,
  currentPdfPageImages,
  currentUploadFile
) {
  if (!(category === 'ocr' || category === 'translation')) {
    return { ok: true, pages: currentPdfPageImages }
  }
  if (
    !currentUploadMeta?.isPdf ||
    currentPdfText ||
    (currentPdfPageImages || []).length > 0
  ) {
    return { ok: true, pages: currentPdfPageImages }
  }
  if (!currentUploadFile) {
    alert('PDF 文件状态丢失，请重新选择文件。')
    return { ok: false, pages: currentPdfPageImages }
  }
  try {
    const { images, renderedPages } = await globalThis.extractPdfPageImages(
      currentUploadFile,
      { maxPages: PDF_SCAN_MAX_PAGES, scale: 1.25, maxDimension: 1360 }
    )
    const pages = images || []
    globalThis.currentPdfPageImages = pages
    if (pages.length > 0) {
      console.log(
        `扫描PDF模式：已渲染 ${renderedPages} 页用于OCR（最多前${PDF_SCAN_MAX_PAGES}页）`
      )
    }
    return { ok: true, pages }
  } catch (e) {
    alert(`扫描PDF页面失败：${e.message || e}`)
    return { ok: false, pages: currentPdfPageImages }
  }
}

export function getIntentRouteStorageKey(category) {
  return `intentRouteModel_${category}`
}

export function getIntentRouteDefaultModel(category) {
  return localStorage.getItem(getIntentRouteStorageKey(category)) || ''
}

export function getPresetBoundModelForCategory(category) {
  const currentActivePresetId = globalThis.currentActivePresetId
  const presets = globalThis.presets || []
  // Optional preset extension: preset.route_models = { image, vision, ocr, translation, code }
  const activeSystemId = currentActivePresetId?.system
  if (!activeSystemId || !Array.isArray(presets)) return ''
  const preset = presets.find(
    (p) => p && p.id === activeSystemId && p.type === 'system'
  )
  if (
    !preset ||
    !preset.route_models ||
    typeof preset.route_models !== 'object'
  )
    return ''
  const modelValue = String(preset.route_models[category] || '').trim()
  return modelValue
}

export function applyPresetBoundChatModel(force = false) {
  const categoryEl = $('category')
  const providerSelect = $('providerSelect')
  const modelSelect = $('model')
  if (!categoryEl || !providerSelect || !modelSelect) return
  if (categoryEl.value !== 'chat') return
  const presetChatModel = getPresetBoundModelForCategory('chat')
  if (!presetChatModel || !presetChatModel.includes('::')) return
  if (!force && modelSelect.value === presetChatModel) return

  const [targetProvider] = presetChatModel.split('::')
  if (!targetProvider) return
  if (providerSelect.value !== targetProvider) {
    providerSelect.value = targetProvider
  }
  if (typeof globalThis.filterModelsByCategory === 'function')
    globalThis.filterModelsByCategory()
  const hasOption = Array.from(modelSelect.options || []).some(
    (opt) => opt.value === presetChatModel
  )
  if (hasOption) modelSelect.value = presetChatModel
}

export function setIntentRouteDefaultModel(category, modelValue) {
  if (!modelValue) {
    localStorage.removeItem(getIntentRouteStorageKey(category))
  } else {
    localStorage.setItem(getIntentRouteStorageKey(category), modelValue)
  }
}

export function pickFallbackModelForCategory(category, preferredProviderId) {
  const models = Array.isArray(globalThis.allModels) ? globalThis.allModels : []
  const inPreferred = preferredProviderId
    ? models.find(
        (m) =>
          m.type === category &&
          String(m.value || '').startsWith(preferredProviderId + '::')
      )
    : null
  if (inPreferred) return inPreferred.value
  const any = models.find((m) => m.type === category)
  return any ? any.value : ''
}

export function getModelLabelByValue(modelValue) {
  if (!modelValue) return ''
  const models = Array.isArray(globalThis.allModels) ? globalThis.allModels : []
  const hit = models.find((m) => m.value === modelValue)
  return hit ? hit.label : ''
}

export function getCategoryDisplayName(category) {
  const { i18n, currentLanguage } = getI18nBundle()
  const keyMap = {
    image: 'category_image',
    video: 'category_video',
    vision: 'category_vision',
    ocr: 'category_ocr',
    translation: 'category_translation',
    code: 'category_code',
  }
  const key = keyMap[category]
  return (
    (key && i18n[currentLanguage] && i18n[currentLanguage][key]) || category
  )
}

export function buildProfessionalLeadIn(category, modelValue) {
  const { currentLanguage } = getI18nBundle()
  const modelLabel =
    getModelLabelByValue(modelValue) ||
    String(modelValue || '')
      .split('::')
      .pop() ||
    (currentLanguage === 'zh' ? '已选模型' : 'selected model')
  const categoryLabel = getCategoryDisplayName(category)
  if (currentLanguage === 'zh') {
    return `好的，我这就帮你调用「${modelLabel}」处理「${categoryLabel}」任务。\n以下是结果：\n`
  }
  return `Sure — I'll use "${modelLabel}" for the "${categoryLabel}" task.\nHere is the result:\n`
}

export function detectChatIntentRoute(text, hasImage, hasPdf) {
  const input = String(text || '').toLowerCase()
  const hasCodeWord =
    /(写代码|代码|debug|修复|报错|函数|脚本|sql|python|javascript|typescript|java|c\+\+|regex|编程)/i.test(
      input
    )
  const hasDrawWord =
    /(画|画图|绘制|生成图片|做图|生图|生图工具|图像生成|文生图|海报|插画|画一张|draw|image|illustration|poster|出图|渲染|生成一张|来一张|做一张|开始生成)/i.test(
      input
    )
  const hasGenericGenerateWord = /(生成|generate)/i.test(input)
  const hasOcrWord =
    /(识别文字|提取文字|ocr|读图中文字|图片文字|扫描文字)/i.test(input)
  const hasTranslateWord = /(翻译|translate|译成|翻成)/i.test(input)
  const hasVisionWord =
    /(识图|看图|分析图片|分析这张图|图里有什么|describe image|analyze image|视觉分析)/i.test(
      input
    )

  if (hasImage || hasPdf) {
    if (hasTranslateWord)
      return {
        category: 'translation',
        reason: 'image_translation',
        confidence: 'high',
      }
    if (hasOcrWord)
      return { category: 'ocr', reason: 'image_ocr', confidence: 'high' }
    if (hasVisionWord)
      return { category: 'vision', reason: 'image_vision', confidence: 'high' }
    if (input.trim())
      return {
        category: 'vision',
        reason: 'image_default_vision',
        confidence: 'low',
      }
  }
  if (hasDrawWord)
    return { category: 'image', reason: 'text2img', confidence: 'high' }
  // If preset already binds an image model, generic "generate" phrasing should still route to image.
  if (
    !hasCodeWord &&
    !hasTranslateWord &&
    !hasOcrWord &&
    hasGenericGenerateWord &&
    getPresetBoundModelForCategory('image')
  ) {
    return {
      category: 'image',
      reason: 'preset_image_generate',
      confidence: 'medium',
    }
  }
  if (hasCodeWord)
    return { category: 'code', reason: 'coding', confidence: 'high' }
  return null
}

export function populateIntentRouteModelSelectors() {
  const { currentLanguage } = getI18nBundle()
  const categoryMap = {
    image: 'intentRouteModelImage',
    vision: 'intentRouteModelVision',
    ocr: 'intentRouteModelOcr',
    translation: 'intentRouteModelTranslation',
    code: 'intentRouteModelCode',
  }
  const models = Array.isArray(globalThis.allModels) ? globalThis.allModels : []
  Object.entries(categoryMap).forEach(([category, elementId]) => {
    const el = $(elementId)
    if (!el) return
    const currentVal = getIntentRouteDefaultModel(category)
    el.innerHTML = ''
    const empty = document.createElement('option')
    empty.value = ''
    empty.textContent = currentLanguage === 'zh' ? '（自动选择）' : '(Auto)'
    el.appendChild(empty)
    models
      .filter((m) => m.type === category)
      .forEach((m) => {
        const opt = document.createElement('option')
        opt.value = m.value
        opt.textContent = m.label
        el.appendChild(opt)
      })
    el.value = currentVal
  })
}

function unlockSendUi() {
  globalThis.isReceiving = false
  const btn = $('sendBtn')
  if (btn) btn.disabled = false
}

// ---------- 发送请求（使用激活的预设和单词转换）----------
export async function send() {
  const { i18n, currentLanguage } = getI18nBundle()
  let requestConvId = globalThis.currentConvId

  try {
  const msgInput = $('msg')
  const modelSelect = $('model')
  const categoryEl = $('category')
  if (!msgInput || !modelSelect || !categoryEl) {
    console.error('send: missing #msg / #model / #category')
    alert(
      currentLanguage === 'zh'
        ? '发送控件未就绪，请刷新页面后重试。'
        : 'Send controls are not ready. Please refresh.'
    )
    return
  }
  let category = categoryEl.value
  let imageMode = $('imageMode')?.value
  const currentBase64 = globalThis.currentBase64
  const currentUploadMeta = globalThis.currentUploadMeta || null
  const currentPdfText = (globalThis.currentPdfText || '').trim()
  const currentFileText = String(globalThis.currentFileText || '')
  let currentPdfPageImages = Array.isArray(globalThis.currentPdfPageImages)
    ? globalThis.currentPdfPageImages
    : []
  const currentUploadFile = $('file-input')?.files?.[0] || null

  let text = normalizeUserInputText(msgInput.value)

  if (isLocalHttpProviderSelected()) {
    try {
      await probeAndStoreLocalCtxTokens()
    } catch {
      /* ignore */
    }
  }

  const isGameModeActive =
    document.body.classList.contains('game-mode-active') ||
    document.body.classList.contains('cyoa-game-mode')
  const autoRouteEnabled = localStorage.getItem('intentRouteEnabled') === '1'
  const hasUploadImage = !!currentBase64
  const hasUploadPdf = !!currentUploadMeta?.isPdf
  let routeInfo = null
  let resolvedModelValue = modelSelect.value
  let resolvedProviderId = $('providerSelect')?.value || ''

  if (!isGameModeActive && category === 'chat') {
    // 总开关关闭 = 完全不自动改分类（含关键词/预设绑定）
    // Master switch off = never auto-change category (keywords/preset alike)
    if (autoRouteEnabled) {
      routeInfo = detectChatIntentRoute(text, hasUploadImage, hasUploadPdf)
      if (routeInfo && routeInfo.category) {
        const presetBoundModel = getPresetBoundModelForCategory(
          routeInfo.category
        )
        category = routeInfo.category
        if (category === 'image') {
          imageMode = 'text2img'
          if ($('imageMode')) $('imageMode').value = 'text2img'
        }
        const userBoundModel = getIntentRouteDefaultModel(category)
        resolvedModelValue =
          userBoundModel ||
          presetBoundModel ||
          pickFallbackModelForCategory(category, resolvedProviderId)
        if (resolvedModelValue && resolvedModelValue.includes('::')) {
          resolvedProviderId = resolvedModelValue.split('::')[0]
        }
        if (!resolvedModelValue) {
          alert(
            currentLanguage === 'zh'
              ? '未找到可用的「' +
                  getCategoryDisplayName(category) +
                  '」模型。请切换到云端供应商并选择对应类型模型。'
              : 'No model available for this task category. Switch to a cloud provider with matching models.'
          )
          return
        }
        syncUiToResolvedSelection(
          category,
          resolvedProviderId,
          resolvedModelValue,
          imageMode
        )
        const routeTargetLabel = getCategoryDisplayName(routeInfo.category)
        const routeModelLabel =
          getModelLabelByValue(resolvedModelValue) ||
          resolvedModelValue ||
          'Auto'
        const lowConfidence = routeInfo.confidence === 'low'
        if (lowConfidence) {
          const tpl =
            i18n[currentLanguage].intent_route_confirm_low ||
            '检测到可能是 {target} 任务，准备使用模型：{model}。是否继续？'
          const msg = tpl
            .replace('{target}', routeTargetLabel)
            .replace('{model}', routeModelLabel)
          if (!confirm(msg)) {
            return
          }
        }
        const hitTpl =
          i18n[currentLanguage].intent_route_hit ||
          '自动路由：{target} · 模型：{model}'
        const hitMsg = hitTpl
          .replace('{target}', routeTargetLabel)
          .replace('{model}', routeModelLabel)
        globalThis.addDebugLog('intent_route_hit', {
          target_category: routeInfo.category,
          confidence: routeInfo.confidence || 'high',
          model: resolvedModelValue,
          source: 'global_auto_route',
          reason: routeInfo.reason || '',
        })
        if (typeof globalThis.showAppToast === 'function')
          globalThis.showAppToast(hitMsg)
      }
    }
  }

  // 手动选图像/视频时：若当前模型类型不匹配，自动落到可用图像模型并同步 UI
  // Manual image/video: if current model type mismatches, fall back and sync UI
  if (
    (category === 'image' || category === 'video') &&
    resolvedModelValue &&
    getModelTypeByValue(resolvedModelValue) !== category
  ) {
    const fb = pickFallbackModelForCategory(category, null)
    if (!fb) {
      alert(
        currentLanguage === 'zh'
          ? '本地 GPU 对话模型不能做图像/视频生成。请切换到带图像模型的云端供应商（如硅基流动）。'
          : 'Local chat GGUF cannot do image/video. Switch to a cloud provider with image models.'
      )
      return
    }
    resolvedModelValue = fb
    resolvedProviderId = fb.includes('::') ? fb.split('::')[0] : resolvedProviderId
    syncUiToResolvedSelection(category, resolvedProviderId, resolvedModelValue, imageMode)
  }

  const pdfPrepare = await ensurePdfPreparedForRecognition(
    category,
    currentUploadMeta,
    currentPdfText,
    currentPdfPageImages,
    currentUploadFile
  )
  if (!pdfPrepare.ok) return
  currentPdfPageImages = pdfPrepare.pages || []

  if (category === 'ocr' && !currentBase64) {
    if (currentUploadMeta?.isPdf) {
      if (!currentPdfText && currentPdfPageImages.length === 0) {
        alert('PDF 未提取到文本且无法渲染页面，无法进行OCR。')
        return
      }
    } else {
      alert(
        i18n[currentLanguage].ocr_need_image || '请先上传需要识别文字的图片'
      )
      return
    }
  }
  if (category === 'vision' && !currentBase64) {
    alert(i18n[currentLanguage].vision_need_image || '请先上传需要分析的图片')
    return
  }
  if (
    category === 'translation' &&
    !text &&
    !currentBase64 &&
    !(
      currentUploadMeta?.isPdf &&
      (currentPdfText || currentPdfPageImages.length > 0)
    )
  ) {
    alert(
      i18n[currentLanguage].translation_need_input ||
        '请输入要翻译的文本或上传含文字的图片'
    )
    return
  }
  const imageNeedCategories = ['ocr', 'vision', 'translation']
  if (
    !text &&
    !imageNeedCategories.includes(category) &&
    (category !== 'image' || imageMode !== 'img2img' || !currentBase64) &&
    (category !== 'video' || !currentBase64)
  ) {
    alert('请输入提示词或上传图片')
    return
  }
  if (!resolvedModelValue) {
    alert('请先选择模型')
    return
  }
  if (globalThis.isReceiving) {
    // 若上次异常导致发送钮假死，允许用户点击时强制解锁再发
    // If prior request left UI stuck, unlock on click then proceed
    const stuckMs = Number(globalThis.__adachatReceivingSince || 0)
    const stuckLong =
      !stuckMs || Date.now() - stuckMs > 2000
    if (stuckLong && $('sendBtn')?.disabled) {
      unlockSendUi()
    } else {
      alert('正在接收回复，请稍候')
      return
    }
  }

  // 应用单词转换（仅在文生图模式下）
  if (category === 'image' && imageMode === 'text2img') {
    const originalText = text
    text =
      typeof globalThis.applyWordConversion === 'function'
        ? globalThis.applyWordConversion(text)
        : text
    if (originalText !== text) {
      console.log('单词转换应用:', originalText, '->', text)
    }
  }

  requestConvId = globalThis.currentConvId
  const debugRequestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  if (
    globalThis.pendingUserEditRestart &&
    globalThis.pendingUserEditRestart.convId === requestConvId
  ) {
    const conv = globalThis.conversations.find((c) => c.id === requestConvId)
    if (
      conv &&
      Number.isInteger(globalThis.pendingUserEditRestart.userIdx) &&
      globalThis.pendingUserEditRestart.userIdx >= 0
    ) {
      conv.messages = conv.messages.slice(
        0,
        globalThis.pendingUserEditRestart.userIdx
      )
      globalThis.saveConversations()
      globalThis.renderChatList()
      globalThis.renderCurrentConversation()
    }
    globalThis.pendingUserEditRestart = null
  }
  const requestBuildContext = {
    category,
    imageMode,
    text,
    currentBase64,
    currentUploadMeta,
    currentPdfText,
    currentFileText,
    currentPdfPageImages,
    modelValue: resolvedModelValue,
  }
  let allowBuild = true
  try {
    if (globalThis.PluginSystem?.runHook) {
      allowBuild = await globalThis.PluginSystem.runHook(
        'beforeBuildRequest',
        requestBuildContext
      )
    }
  } catch (hookErr) {
    console.error('beforeBuildRequest hook failed', hookErr)
    allowBuild = true
  }
  if (!allowBuild) {
    console.log('构建请求被插件拦截')
    globalThis.addDebugLog(
      'request_blocked_by_plugin',
      {
        request_id: debugRequestId,
        conv_id: requestConvId,
        stage: 'beforeBuildRequest',
      },
      'warn'
    )
    alert(
      currentLanguage === 'zh'
        ? '发送被插件拦截，请检查插件设置。'
        : 'Send blocked by a plugin. Check plugin settings.'
    )
    return
  }
  const reqCategory = requestBuildContext.category
  const reqImageMode = requestBuildContext.imageMode
  const reqText = requestBuildContext.text
  const reqCurrentBase64 = requestBuildContext.currentBase64
  const reqCurrentUploadMeta = requestBuildContext.currentUploadMeta
  const reqCurrentPdfText = requestBuildContext.currentPdfText
  const reqCurrentFileText = String(requestBuildContext.currentFileText || '')
  const reqCurrentPdfPageImages = Array.isArray(
    requestBuildContext.currentPdfPageImages
  )
    ? requestBuildContext.currentPdfPageImages
    : []
  const reqModelValue = requestBuildContext.modelValue || resolvedModelValue

  const categoryTags = {
    image: `[${reqImageMode === 'text2img' ? '文生图' : '图生图'}] ${reqText}`,
    video: `[文生视频] ${reqText || '根据参考图生成视频'}`,
    code: `[编程] ${reqText}`,
    ocr: `[文字识别] ${reqText || '提取图片文字'}`,
    vision: `[图像理解] ${reqText || '分析图片内容'}`,
    translation: `[翻译] ${reqText || '翻译图片中的文字'}`,
  }
  const uploadMetaSuffix = buildUploadDisplayMeta(
    reqCurrentBase64,
    reqCurrentUploadMeta,
    reqCurrentPdfPageImages
  )
  if (categoryTags[reqCategory]) {
    globalThis.addMessageToCurrent(
      'user',
      categoryTags[reqCategory] + uploadMetaSuffix,
      requestConvId,
      {
        ...(reqCurrentBase64 ? { image: reqCurrentBase64 } : {}),
        requestMeta: {
          category: reqCategory,
          imageMode: reqImageMode || '',
          provider: resolvedProviderId || $('providerSelect')?.value || '',
          model: reqModelValue || '',
        },
      }
    )
  } else {
    const userDisplayText = ((reqText || '') + uploadMetaSuffix).trim()
    globalThis.addMessageToCurrent('user', userDisplayText, requestConvId, {
      ...(reqCurrentBase64 ? { image: reqCurrentBase64 } : {}),
      requestMeta: {
        category: reqCategory,
        imageMode: reqImageMode || '',
        provider: resolvedProviderId || $('providerSelect')?.value || '',
        model: reqModelValue || '',
      },
    })
  }

  // 先冻结会话角色快照，再构建请求（工具/RAG/system 均读快照）
  // Freeze persona snapshot before build so tools/RAG/system use it
  let personaSnap = null
  try {
    if (typeof globalThis.ensureConversationPersonaSnapshot === 'function') {
      personaSnap = globalThis.ensureConversationPersonaSnapshot(requestConvId)
    }
  } catch {
    personaSnap = null
  }

  if (personaSnap?.modelValue) {
    const modelSel = $('model')
    const stillThere =
      modelSel &&
      Array.from(modelSel.options || []).some(
        (o) => o.value === personaSnap.modelValue
      )
    if (!stillThere) {
      // 不阻断发送：清除失效绑定，改用当前下拉模型
      // Don't block send: drop stale bind, use current select
      const gone = String(personaSnap.modelValue)
      personaSnap = { ...personaSnap, modelValue: reqModelValue || '' }
      try {
        const conv = (globalThis.conversations || []).find(
          (c) => c.id === requestConvId
        )
        if (conv?.personaRuntime) {
          conv.personaRuntime.modelValue = personaSnap.modelValue
          if (typeof globalThis.saveConversations === 'function') {
            globalThis.saveConversations()
          }
        }
      } catch {
        /* ignore */
      }
      const tip =
        currentLanguage === 'zh'
          ? `[提示] 会话原绑定模型不可用，已改用当前选择：${reqModelValue || '（空）'}（原：${gone}）`
          : `[Notice] Bound model unavailable; using current selection instead.`
      if (typeof globalThis.showAppToast === 'function') {
        globalThis.showAppToast(tip)
      } else {
        console.warn(tip)
      }
    }
  }

  const effectiveModel = resolveEffectiveModelForCategory(
    personaSnap,
    reqModelValue,
    reqCategory
  )
  if (!effectiveModel) {
    alert(
      currentLanguage === 'zh' ? '请先选择模型' : 'Please select a model first'
    )
    return
  }

  if (typeof globalThis.beginRequestPersonaRuntime === 'function') {
    globalThis.beginRequestPersonaRuntime(personaSnap)
  }

  // 非对话任务：控件显示与真实请求模型对齐
  // Non-chat tasks: keep selects aligned with the model actually used
  if (reqCategory !== 'chat' && effectiveModel) {
    const effProvider = effectiveModel.includes('::')
      ? effectiveModel.split('::')[0]
      : resolvedProviderId
    syncUiToResolvedSelection(
      reqCategory,
      effProvider,
      effectiveModel,
      reqImageMode
    )
  }

  let requestBody
  let isChatLike
  try {
    ;({ requestBody, isChatLike } = buildRequestPayload({
      category: reqCategory,
      imageMode: reqImageMode,
      text: reqText,
      currentBase64: reqCurrentBase64,
      currentUploadMeta: reqCurrentUploadMeta,
      currentPdfText: reqCurrentPdfText,
      currentFileText: reqCurrentFileText,
      currentPdfPageImages: reqCurrentPdfPageImages,
      modelValue: effectiveModel,
      convId: requestConvId,
    }))
    globalThis.addDebugLog('request_start', {
      request_id: debugRequestId,
      conv_id: requestConvId,
      persona_id: personaSnap?.personaId || '',
      ...(typeof globalThis.summarizeRequestBody === 'function'
        ? globalThis.summarizeRequestBody(requestBody)
        : {}),
    })

    if (reqCategory !== 'chat') {
      const assistantRequestMeta = {
        category: reqCategory,
        imageMode: reqImageMode || '',
        provider:
          (effectiveModel.includes('::')
            ? effectiveModel.split('::')[0]
            : '') ||
          resolvedProviderId ||
          $('providerSelect')?.value ||
          '',
        model: effectiveModel || '',
      }
      globalThis.addMessageToCurrent(
        'assistant',
        buildProfessionalLeadIn(reqCategory, effectiveModel),
        requestConvId,
        { requestMeta: assistantRequestMeta }
      )
    }

    globalThis.removePreview()
    msgInput.value = ''
    msgInput.style.height = 'auto'

    globalThis.isReceiving = true
    globalThis.__adachatReceivingSince = Date.now()
    const sendBtn = $('sendBtn')
    if (sendBtn) sendBtn.disabled = true

    const totalTimeout =
      parseInt(localStorage.getItem('timeoutTotal') || '600') * 1000
    const idleTimeout =
      parseInt(localStorage.getItem('timeoutIdle') || '120') * 1000
    await executeRequestWithFallback({
      requestBody,
      isChatLike,
      category: reqCategory,
      requestConvId,
      debugRequestId,
      totalTimeout,
      idleTimeout,
    })
  } catch (sendErr) {
    console.error('send failed', sendErr)
    const tip =
      currentLanguage === 'zh'
        ? '[错误] 发送失败：' + (sendErr?.message || String(sendErr))
        : '[Error] Send failed: ' + (sendErr?.message || String(sendErr))
    try {
      if (typeof globalThis.addMessageToCurrent === 'function') {
        globalThis.addMessageToCurrent('assistant', tip, requestConvId)
      } else {
        alert(tip)
      }
    } catch {
      alert(tip)
    }
  } finally {
    if (typeof globalThis.endRequestPersonaRuntime === 'function') {
      try {
        globalThis.endRequestPersonaRuntime()
      } catch {
        /* ignore */
      }
    }
    // 始终恢复发送钮，避免 disabled 导致「点击无反应」
    // Always re-enable send; disabled button swallows clicks
    try {
      if (typeof globalThis.finishAIMessage === 'function') {
        globalThis.finishAIMessage(requestConvId)
      } else {
        unlockSendUi()
      }
    } catch {
      unlockSendUi()
    }
    globalThis.__adachatReceivingSince = 0
  }
  } catch (outerErr) {
    console.error('send outer failed', outerErr)
    unlockSendUi()
    alert(
      (currentLanguage === 'zh' ? '发送异常：' : 'Send error: ') +
        (outerErr?.message || String(outerErr))
    )
  }
}
