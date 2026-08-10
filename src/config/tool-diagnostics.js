/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * Tool Calling 诊断码（v1.4 Harden）
 * Tool-calling diagnostic codes (v1.4 Harden)
 */

/** @type {Record<string, {code:string, zh:string, en:string}>} */
export const TOOL_DIAG = {
  OK: {
    code: 'TOOL_EXEC_000',
    zh: '工具执行成功',
    en: 'Tool executed successfully',
  },
  INVALID_ARGS: {
    code: 'TOOL_EXEC_001',
    zh: '工具参数非法 JSON',
    en: 'Invalid tool arguments JSON',
  },
  NOT_FOUND: {
    code: 'TOOL_EXEC_002',
    zh: '工具不存在或未启用',
    en: 'Tool not found or unavailable',
  },
  DISABLED: {
    code: 'TOOL_EXEC_003',
    zh: '工具已被禁用',
    en: 'Tool disabled by permission',
  },
  TIMEOUT: {
    code: 'TOOL_EXEC_004',
    zh: '工具执行超时',
    en: 'Tool execution timed out',
  },
  THREW: {
    code: 'TOOL_EXEC_005',
    zh: '工具执行抛错',
    en: 'Tool threw an error',
  },
  NO_TOOLS: {
    code: 'TOOL_EXEC_006',
    zh: '当前无可用工具',
    en: 'No tools available',
  },
  MAX_ROUNDS: {
    code: 'TOOL_EXEC_007',
    zh: '达到工具轮次上限（防死循环）',
    en: 'Max tool rounds reached (loop guard)',
  },
  REPEAT_LOOP: {
    code: 'TOOL_EXEC_008',
    zh: '检测到重复工具调用，已中止',
    en: 'Repeated tool calls aborted',
  },
  LLM_ROUND_FAIL: {
    code: 'TOOL_EXEC_009',
    zh: '工具轮次中上游响应失败',
    en: 'Upstream failed during tool round',
  },
}

export function classifyToolError(errorText) {
  const s = String(errorText || '').toLowerCase()
  if (!s) return TOOL_DIAG.THREW
  if (s.includes('invalid_arguments')) return TOOL_DIAG.INVALID_ARGS
  if (s.includes('tool_not_found')) return TOOL_DIAG.NOT_FOUND
  if (s.includes('tool_disabled')) return TOOL_DIAG.DISABLED
  if (s.includes('timeout')) return TOOL_DIAG.TIMEOUT
  if (s.includes('max_tool_rounds')) return TOOL_DIAG.MAX_ROUNDS
  if (s.includes('repeat') || s.includes('loop')) return TOOL_DIAG.REPEAT_LOOP
  if (s.includes('no_tools')) return TOOL_DIAG.NO_TOOLS
  if (
    s.includes('non_json') ||
    s.includes('http ') ||
    s.includes('upstream')
  ) {
    return TOOL_DIAG.LLM_ROUND_FAIL
  }
  return TOOL_DIAG.THREW
}

export function formatToolDiagLabel(diag, lang = 'zh') {
  if (!diag) return ''
  const msg = lang === 'zh' ? diag.zh : diag.en
  return `${diag.code} · ${msg}`
}

/** 截断参数供日志（防爆 localStorage） */
export function summarizeToolArgs(args) {
  try {
    const s = JSON.stringify(args ?? {})
    return s.length > 400 ? s.slice(0, 400) + '…' : s
  } catch {
    return '[unserializable]'
  }
}

/** 截断结果供日志 */
export function summarizeToolResult(result, ok) {
  try {
    const s =
      typeof result === 'string' ? result : JSON.stringify(result ?? null)
    const clipped = s.length > 500 ? s.slice(0, 500) + '…' : s
    return ok ? clipped : clipped
  } catch {
    return ok ? '[ok]' : '[error]'
  }
}
