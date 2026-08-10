/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 插件 Tool Calling 路由（v1.3 + v1.4 诊断）
 * Plugin tool-calling router (v1.3 + v1.4 diagnostics)
 *
 * 收集已启用插件的 tools → OpenAI tools schema → 执行 → 回灌
 */

import {
  TOOL_DIAG,
  classifyToolError,
  formatToolDiagLabel,
  summarizeToolArgs,
  summarizeToolResult,
} from '@/config/tool-diagnostics.js'
import { getEffectiveToolAllowlist } from '@/config/model-personas.js'

const TOOL_CALLING_ENABLED_KEY = 'adachat_tool_calling_enabled_v1'
const TOOL_DISABLED_KEY = 'adachat_tool_disabled_v1'
const TOOL_EXEC_TIMEOUT_MS = 8000
const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_]{1,64}$/
const MAX_TOOL_ROUNDS = 3
/** 同一工具+参数连续出现次数上限 / Max consecutive identical tool+args */
const MAX_IDENTICAL_TOOL_STREAK = 2

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`tool timeout (${ms}ms)`)), ms)
    ),
  ])
}

function logTool(event, data = {}, level = 'info') {
  if (typeof globalThis.addDebugLog === 'function') {
    globalThis.addDebugLog(event, data, level)
  }
}

function lang() {
  return globalThis.currentLanguage === 'en' ? 'en' : 'zh'
}

export function isToolCallingEnabled() {
  try {
    const v = localStorage.getItem(TOOL_CALLING_ENABLED_KEY)
    // 默认开启：有工具且插件启用时即可用
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

export function setToolCallingEnabled(enabled) {
  try {
    localStorage.setItem(TOOL_CALLING_ENABLED_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function readDisabledToolKeys() {
  try {
    const raw = localStorage.getItem(TOOL_DISABLED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

function writeDisabledToolKeys(set) {
  try {
    localStorage.setItem(TOOL_DISABLED_KEY, JSON.stringify([...set]))
  } catch {
    /* ignore */
  }
}

export function toolKey(pluginId, toolName) {
  return `${pluginId}::${toolName}`
}

export function isToolEnabled(pluginId, toolName) {
  return !readDisabledToolKeys().has(toolKey(pluginId, toolName))
}

export function setToolEnabled(pluginId, toolName, enabled) {
  const set = readDisabledToolKeys()
  const key = toolKey(pluginId, toolName)
  if (enabled) set.delete(key)
  else set.add(key)
  writeDisabledToolKeys(set)
}

function normalizeParameters(params) {
  if (!params || typeof params !== 'object') {
    return { type: 'object', properties: {}, additionalProperties: true }
  }
  if (params.type) return params
  return {
    type: 'object',
    properties: params.properties || params,
    required: Array.isArray(params.required) ? params.required : undefined,
    additionalProperties:
      params.additionalProperties === undefined
        ? true
        : !!params.additionalProperties,
  }
}

/**
 * 规范化插件 tools 声明
 * @returns {Array<{name:string,description:string,parameters:object,execute:Function|null,pluginId:string}>}
 */
export function normalizePluginTools(pluginId, tools) {
  if (!Array.isArray(tools)) return []
  const out = []
  const seen = new Set()
  for (const t of tools) {
    if (!t || typeof t !== 'object') continue
    const name = String(t.name || '').trim()
    if (!TOOL_NAME_PATTERN.test(name)) continue
    if (seen.has(name)) continue
    seen.add(name)
    out.push({
      pluginId: String(pluginId),
      name,
      description: String(t.description || name),
      parameters: normalizeParameters(t.parameters),
      execute: typeof t.execute === 'function' ? t.execute : null,
      readOnly: t.readOnly !== false, // 默认只读更安全；写操作需显式 readOnly:false
    })
  }
  return out
}

function readActiveToolAllowlist() {
  // 会话快照优先 / Conversation snapshot wins
  const list = getEffectiveToolAllowlist()
  if (list === null || list === undefined) return null
  return new Set(Array.isArray(list) ? list.map(String) : [])
}

/**
 * 收集当前可用工具（已启用插件 + 未单独禁用 + 有 execute + 角色卡白名单）
 */
export function listAvailableTools() {
  const MainApp = globalThis.MainApp
  const PluginSystem = globalThis.PluginSystem
  if (!PluginSystem?.getAllPlugins || !MainApp?.isPluginEnabled) return []

  const allow = readActiveToolAllowlist()
  const all = []
  for (const plugin of PluginSystem.getAllPlugins()) {
    if (!MainApp.isPluginEnabled(plugin.id)) continue
    const tools = normalizePluginTools(plugin.id, plugin.tools)
    for (const tool of tools) {
      if (!tool.execute) continue
      if (!isToolEnabled(plugin.id, tool.name)) continue
      const key = toolKey(plugin.id, tool.name)
      if (allow && !allow.has(key)) continue
      all.push(tool)
    }
  }
  return all
}

/** OpenAI-compatible tools array */
export function collectOpenAITools() {
  return listAvailableTools().map((tool) => ({
    type: 'function',
    function: {
      name: `${tool.pluginId}__${tool.name}`,
      description: `[${tool.pluginId}] ${tool.description}`,
      parameters: tool.parameters,
    },
  }))
}

function parseQualifiedToolName(qualified) {
  const s = String(qualified || '')
  const idx = s.indexOf('__')
  if (idx <= 0) return { pluginId: '', name: s }
  return { pluginId: s.slice(0, idx), name: s.slice(idx + 2) }
}

/**
 * 按名称查找工具定义（忽略启用/禁用；用于区分 NOT_FOUND vs DISABLED）
 * Resolve tool definition by name (ignore enable flags; distinguish 002 vs 003)
 */
function findRegisteredTool(pluginId, name) {
  const MainApp = globalThis.MainApp
  const PluginSystem = globalThis.PluginSystem
  if (!PluginSystem?.getAllPlugins || !MainApp?.isPluginEnabled) return null
  const pid = String(pluginId || '')
  const tname = String(name || '')
  if (!pid || !tname) return null
  for (const plugin of PluginSystem.getAllPlugins()) {
    if (String(plugin.id) !== pid) continue
    if (!MainApp.isPluginEnabled(plugin.id)) return null
    const tools = normalizePluginTools(plugin.id, plugin.tools)
    const tool = tools.find((t) => t.name === tname && t.execute)
    return tool || null
  }
  return null
}

export async function executeToolCall(toolCall, meta = {}) {
  const fn = toolCall?.function || {}
  const qualified = String(fn.name || '')
  const { pluginId, name } = parseQualifiedToolName(qualified)
  const argsRaw = fn.arguments
  const started = Date.now()
  let args = {}
  try {
    args =
      typeof argsRaw === 'string'
        ? argsRaw.trim()
          ? JSON.parse(argsRaw)
          : {}
        : argsRaw && typeof argsRaw === 'object'
          ? argsRaw
          : {}
  } catch (e) {
    const diag = TOOL_DIAG.INVALID_ARGS
    logTool(
      'tool_exec',
      {
        diag: diag.code,
        tool: qualified,
        plugin: pluginId,
        args: summarizeToolArgs(argsRaw),
        ok: false,
        error: `invalid_arguments: ${e?.message || e}`,
        round: meta.round,
        ms: Date.now() - started,
      },
      'error'
    )
    return {
      ok: false,
      error: `invalid_arguments: ${e?.message || e}`,
      diag: diag.code,
    }
  }

  logTool('tool_call', {
    diag: TOOL_DIAG.OK.code,
    tool: qualified,
    plugin: pluginId,
    args: summarizeToolArgs(args),
    round: meta.round,
  })

  // 存在性 → 启用态 → 执行（勿用 listAvailableTools，否则禁用会被误判为不存在）
  // exists → enabled → execute (do not use listAvailableTools; disabled ≠ missing)
  const tool = findRegisteredTool(pluginId, name)
  if (!tool) {
    const diag = TOOL_DIAG.NOT_FOUND
    logTool(
      'tool_exec',
      {
        diag: diag.code,
        tool: qualified,
        plugin: pluginId,
        ok: false,
        error: `tool_not_found: ${qualified}`,
        round: meta.round,
        ms: Date.now() - started,
      },
      'error'
    )
    return {
      ok: false,
      error: `tool_not_found: ${qualified}`,
      diag: diag.code,
    }
  }
  if (!isToolEnabled(pluginId, name)) {
    const diag = TOOL_DIAG.DISABLED
    logTool(
      'tool_exec',
      {
        diag: diag.code,
        tool: qualified,
        plugin: pluginId,
        ok: false,
        error: `tool_disabled: ${qualified}`,
        round: meta.round,
        ms: Date.now() - started,
      },
      'error'
    )
    return {
      ok: false,
      error: `tool_disabled: ${qualified}`,
      diag: diag.code,
    }
  }
  // 角色卡白名单仍生效（与 listAvailableTools 一致，但不与「禁用」混淆存在性）
  // Persona allowlist still applies (same as listAvailableTools; not conflated with missing)
  const allow = readActiveToolAllowlist()
  if (allow && !allow.has(toolKey(pluginId, name))) {
    const diag = TOOL_DIAG.DISABLED
    logTool(
      'tool_exec',
      {
        diag: diag.code,
        tool: qualified,
        plugin: pluginId,
        ok: false,
        error: `tool_disabled: ${qualified}`,
        round: meta.round,
        ms: Date.now() - started,
      },
      'error'
    )
    return {
      ok: false,
      error: `tool_disabled: ${qualified}`,
      diag: diag.code,
    }
  }

  try {
    const result = await withTimeout(
      Promise.resolve(tool.execute(args, { pluginId, toolName: name })),
      TOOL_EXEC_TIMEOUT_MS
    )
    logTool('tool_exec', {
      diag: TOOL_DIAG.OK.code,
      tool: qualified,
      plugin: pluginId,
      ok: true,
      result: summarizeToolResult(result, true),
      round: meta.round,
      ms: Date.now() - started,
    })
    return { ok: true, result, diag: TOOL_DIAG.OK.code }
  } catch (e) {
    const err = String(e?.message || e)
    const diag = /timeout/i.test(err) ? TOOL_DIAG.TIMEOUT : TOOL_DIAG.THREW
    logTool(
      'tool_exec',
      {
        diag: diag.code,
        tool: qualified,
        plugin: pluginId,
        ok: false,
        error: err,
        round: meta.round,
        ms: Date.now() - started,
      },
      'error'
    )
    return { ok: false, error: err, diag: diag.code }
  }
}

export function getMaxToolRounds() {
  return MAX_TOOL_ROUNDS
}

/**
 * 当前供应商是否适合 Tool Calling（本地直连暂不支持）
 */
export function canUseToolsWithCurrentProvider() {
  try {
    const providerId = document.getElementById('providerSelect')?.value || ''
    const providers = globalThis.providers || []
    const p = providers.find((x) => x && x.id === providerId)
    if (!p) return true
    if (p.deployment_type === 'local' && p.inference_engine === 'direct') {
      return false
    }
  } catch {
    /* ignore */
  }
  return true
}

export function shouldAttachTools() {
  return (
    isToolCallingEnabled() &&
    canUseToolsWithCurrentProvider() &&
    collectOpenAITools().length > 0
  )
}

/**
 * 非流式 Tool Calling 多轮：LLM → tool_calls → execute → 回灌 → 最终文本
 * Non-stream tool-calling loop until final text (max rounds)
 *
 * @param {object} baseBody request body without stream
 * @param {(msg:string)=>void} [onStatus]
 * @param {{convId?: string}} [opts]
 * @returns {Promise<{content:string, rounds:number, error?:string}>}
 */
export async function runToolCallingChat(baseBody, onStatus, opts = {}) {
  const tools = collectOpenAITools()
  if (!tools.length) {
    const diag = TOOL_DIAG.NO_TOOLS
    logTool('tool_loop', { diag: diag.code, error: 'no_tools' }, 'warn')
    return {
      content: '',
      rounds: 0,
      error: 'no_tools',
      diag: diag.code,
    }
  }

  const convId =
    (opts && opts.convId) ||
    globalThis.currentConvId ||
    ''
  let messages = Array.isArray(baseBody.messages)
    ? baseBody.messages.map((m) => ({ ...m }))
    : []
  let lastContent = ''
  /** @type {Map<string, number>} */
  const streakMap = new Map()
  logTool('tool_loop_start', {
    tools: tools.length,
    max_rounds: MAX_TOOL_ROUNDS,
  })

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body = {
      ...baseBody,
      messages,
      tools,
      tool_choice: 'auto',
      stream: false,
      bypassCostOptimizer: true,
      client: baseBody.client || 'adachat',
    }

    const res = await fetch('ai_proxy.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    // Tool 路径也挂向量引用（最终轮尤其需要）
    // Attach vector citations on tool-calling path too
    if (
      convId &&
      typeof globalThis.applyRagCitationsFromResponse === 'function'
    ) {
      globalThis.applyRagCitationsFromResponse(res, convId)
    }
    const raw = await res.text()
    let json = null
    try {
      json = JSON.parse(raw)
    } catch {
      const diag = TOOL_DIAG.LLM_ROUND_FAIL
      logTool(
        'tool_loop',
        {
          diag: diag.code,
          round: round + 1,
          error: `non_json_response: HTTP ${res.status}`,
        },
        'error'
      )
      return {
        content: lastContent,
        rounds: round + 1,
        error: `non_json_response: HTTP ${res.status}`,
        diag: diag.code,
      }
    }
    if (!res.ok) {
      const err =
        json?.error?.message ||
        (typeof json?.error === 'string' ? json.error : '') ||
        `HTTP ${res.status}`
      const diag = TOOL_DIAG.LLM_ROUND_FAIL
      logTool(
        'tool_loop',
        { diag: diag.code, round: round + 1, error: String(err) },
        'error'
      )
      return {
        content: lastContent,
        rounds: round + 1,
        error: String(err),
        diag: diag.code,
      }
    }

    const msg = json?.choices?.[0]?.message || {}
    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : []
    const content = msg.content != null ? String(msg.content) : ''
    if (content) lastContent = content

    if (!toolCalls.length) {
      logTool('tool_loop_done', {
        rounds: round + 1,
        diag: TOOL_DIAG.OK.code,
      })
      return { content: lastContent || content || '', rounds: round + 1 }
    }

    messages.push({
      role: 'assistant',
      content: content || null,
      tool_calls: toolCalls,
    })

    for (const tc of toolCalls) {
      const qName = tc?.function?.name || 'tool'
      const argsKey = `${qName}|${String(tc?.function?.arguments || '')}`
      const streak = (streakMap.get(argsKey) || 0) + 1
      streakMap.set(argsKey, streak)
      if (streak > MAX_IDENTICAL_TOOL_STREAK) {
        const diag = TOOL_DIAG.REPEAT_LOOP
        const label = formatToolDiagLabel(diag, lang())
        if (typeof onStatus === 'function') onStatus(`⛔ ${label}`)
        logTool(
          'tool_loop',
          {
            diag: diag.code,
            tool: qName,
            streak,
            round: round + 1,
          },
          'error'
        )
        return {
          content:
            lastContent ||
            (lang() === 'zh'
              ? `[${diag.code}] 检测到重复工具调用，已中止以防死循环。`
              : `[${diag.code}] Repeated tool calls aborted.`),
          rounds: round + 1,
          error: 'repeated_tool_loop',
          diag: diag.code,
        }
      }

      if (typeof onStatus === 'function') {
        onStatus(`🔧 ${qName}`)
      }
      const exec = await executeToolCall(tc, { round: round + 1 })
      if (!exec.ok && exec.diag && typeof onStatus === 'function') {
        const d = classifyToolError(exec.error)
        onStatus(`⚠️ ${formatToolDiagLabel(d, lang())}`)
      }
      const payload = exec.ok
        ? exec.result
        : {
            ok: false,
            error: exec.error || 'tool_failed',
            diag: exec.diag || classifyToolError(exec.error).code,
          }
      messages.push({
        role: 'tool',
        tool_call_id: String(tc.id || `call_${round}`),
        content:
          typeof payload === 'string' ? payload : JSON.stringify(payload),
      })
    }
  }

  const diag = TOOL_DIAG.MAX_ROUNDS
  logTool(
    'tool_loop',
    { diag: diag.code, rounds: MAX_TOOL_ROUNDS, error: 'max_tool_rounds' },
    'warn'
  )
  return {
    content:
      lastContent ||
      (lang() === 'zh'
        ? `[${diag.code}] 已达工具轮次上限。`
        : `[${diag.code}] Max tool rounds reached.`),
    rounds: MAX_TOOL_ROUNDS,
    error: 'max_tool_rounds',
    diag: diag.code,
  }
}
