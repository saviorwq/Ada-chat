/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * v1.4 Harden — 执行层破坏性冒烟（无需浏览器）
 * Destructive exec-layer smoke for Tool / RAG decode / diag codes
 *
 * Usage: node scripts/v1.4-harden-exec-layer.mjs
 */
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const results = []
function pass(id, note = '') {
  results.push({ id, ok: true, note })
  console.log(`✅ ${id}${note ? ' — ' + note : ''}`)
}
function fail(id, note = '') {
  results.push({ id, ok: false, note })
  console.error(`❌ ${id}${note ? ' — ' + note : ''}`)
}

// Minimal localStorage / DOM for modules that touch them
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.document = {
  getElementById: () => null,
  body: { classList: { contains: () => false } },
}
globalThis.currentLanguage = 'zh'
const debugLogs = []
globalThis.addDebugLog = (event, data, level) => {
  debugLogs.push({ event, data, level })
}

const plugins = [
  {
    id: 'example-hello',
    tools: [
      {
        name: 'get_time',
        description: 'time',
        parameters: { type: 'object', properties: {} },
        execute() {
          return { ok: true, iso: '2026-01-01T00:00:00.000Z' }
        },
      },
      {
        name: 'slow_tool',
        description: 'timeout',
        parameters: { type: 'object', properties: {} },
        async execute() {
          await new Promise((r) => setTimeout(r, 12000))
          return { ok: true }
        },
      },
      {
        name: 'boom_tool',
        description: 'throw',
        parameters: { type: 'object', properties: {} },
        execute() {
          throw new Error('boom_from_tool')
        },
      },
    ],
  },
]

globalThis.PluginSystem = {
  getAllPlugins: () => plugins,
}
globalThis.MainApp = {
  isPluginEnabled: (id) => id === 'example-hello',
}

const toolsUrl = pathToFileURL(
  path.join(root, 'src/ui/plugin-tools.js')
).href
const diagUrl = pathToFileURL(
  path.join(root, 'src/config/tool-diagnostics.js')
).href
const ragUrl = pathToFileURL(path.join(root, 'src/ui/rag.js')).href

const {
  executeToolCall,
  setToolCallingEnabled,
  setToolEnabled,
  collectOpenAITools,
  runToolCallingChat,
  getMaxToolRounds,
} = await import(toolsUrl)
const { TOOL_DIAG, classifyToolError } = await import(diagUrl)
const { decodeRagCitationsHeader } = await import(ragUrl)

setToolCallingEnabled(true)

// --- T1 tool not found ---
{
  const r = await executeToolCall({
    function: { name: 'nope__hallucinated', arguments: '{}' },
  })
  r.diag === TOOL_DIAG.NOT_FOUND.code && !r.ok
    ? pass('T1', r.diag)
    : fail('T1', JSON.stringify(r))
}

// --- T2 timeout ---
{
  const r = await executeToolCall({
    function: { name: 'example-hello__slow_tool', arguments: '{}' },
  })
  r.diag === TOOL_DIAG.TIMEOUT.code && !r.ok
    ? pass('T2', `${r.diag} ${r.error}`)
    : fail('T2', JSON.stringify(r))
}

// --- T3 throw ---
{
  const r = await executeToolCall({
    function: { name: 'example-hello__boom_tool', arguments: '{}' },
  })
  r.diag === TOOL_DIAG.THREW.code && !r.ok
    ? pass('T3', r.diag)
    : fail('T3', JSON.stringify(r))
}

// --- T4 invalid JSON ---
{
  const r = await executeToolCall({
    function: {
      name: 'example-hello__get_time',
      arguments: '{not-json',
    },
  })
  r.diag === TOOL_DIAG.INVALID_ARGS.code && !r.ok
    ? pass('T4', r.diag)
    : fail('T4', JSON.stringify(r))
}

// --- T8 no tools ---
{
  setToolCallingEnabled(false)
  const { runToolCallingChat: rtc } = await import(toolsUrl)
  // isToolCallingEnabled false → collect still lists tools; runToolCallingChat
  // uses collectOpenAITools which ignores global enable flag — check shouldAttach
  // For NO_TOOLS: temporarily clear plugins
  const prev = globalThis.PluginSystem.getAllPlugins
  globalThis.PluginSystem.getAllPlugins = () => []
  setToolCallingEnabled(true)
  const r = await rtc({ messages: [{ role: 'user', content: 'hi' }] })
  globalThis.PluginSystem.getAllPlugins = prev
  r.diag === TOOL_DIAG.NO_TOOLS.code
    ? pass('T8', r.diag)
    : fail('T8', JSON.stringify(r))
  setToolCallingEnabled(true)
}

// --- T9 disabled ---
{
  setToolEnabled('example-hello', 'get_time', false)
  const r = await executeToolCall({
    function: { name: 'example-hello__get_time', arguments: '{}' },
  })
  r.diag === TOOL_DIAG.DISABLED.code && !r.ok
    ? pass('T9', r.diag)
    : fail('T9', JSON.stringify(r))
  setToolEnabled('example-hello', 'get_time', true)
}

// --- T6 repeat loop (mocked LLM always same tool_calls) ---
{
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    const body = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: `c${calls}`,
                type: 'function',
                function: {
                  name: 'example-hello__get_time',
                  arguments: '{}',
                },
              },
            ],
          },
        },
      ],
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(body),
    }
  }
  const r = await runToolCallingChat({
    messages: [{ role: 'user', content: 'time' }],
  })
  r.diag === TOOL_DIAG.REPEAT_LOOP.code
    ? pass('T6', `rounds=${r.rounds}`)
    : fail('T6', JSON.stringify(r))
}

// --- T7 max rounds (alternating args so streak never trips) ---
{
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    const body = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: calls >= 99 ? 'done' : '',
            tool_calls: [
              {
                id: `m${calls}`,
                type: 'function',
                function: {
                  name: 'example-hello__get_time',
                  arguments: JSON.stringify({ n: calls }),
                },
              },
            ],
          },
        },
      ],
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(body),
    }
  }
  const r = await runToolCallingChat({
    messages: [{ role: 'user', content: 'loop' }],
  })
  r.diag === TOOL_DIAG.MAX_ROUNDS.code && r.rounds === getMaxToolRounds()
    ? pass('T7', `rounds=${r.rounds}`)
    : fail('T7', JSON.stringify(r))
}

// --- T5 / T9-adjacent: LLM round fail (upstream HTTP) ---
{
  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    headers: { get: () => null },
    text: async () => JSON.stringify({ error: 'bad gateway' }),
  })
  const r = await runToolCallingChat({
    messages: [{ role: 'user', content: 'x' }],
  })
  r.diag === TOOL_DIAG.LLM_ROUND_FAIL.code
    ? pass('T5', 'upstream 502 → TOOL_EXEC_009')
    : fail('T5', JSON.stringify(r))
}

// --- T10 diag codes present in classify ---
{
  const codes = Object.values(TOOL_DIAG).map((d) => d.code)
  const need = [
    'TOOL_EXEC_001',
    'TOOL_EXEC_002',
    'TOOL_EXEC_003',
    'TOOL_EXEC_004',
    'TOOL_EXEC_005',
    'TOOL_EXEC_006',
    'TOOL_EXEC_007',
    'TOOL_EXEC_008',
    'TOOL_EXEC_009',
  ]
  const missing = need.filter((c) => !codes.includes(c))
  missing.length === 0 &&
  classifyToolError('tool timeout (8000ms)').code === 'TOOL_EXEC_004'
    ? pass('T10', 'diag catalog + classify ok')
    : fail('T10', missing.join(','))
}

// --- G2 UTF-8 citation decode ---
{
  const hits = [
    { docName: '量子纠缠笔记.md', preview: '纠缠对相隔再远也关联', chunkIndex: 0 },
  ]
  const json = JSON.stringify(hits)
  const b64 = Buffer.from(json, 'utf8').toString('base64')
  try {
    const decoded = decodeRagCitationsHeader(b64)
    decoded[0]?.docName === '量子纠缠笔记.md'
      ? pass('G2-decode', decoded[0].docName)
      : fail('G2-decode', JSON.stringify(decoded))
  } catch (e) {
    fail('G2-decode', String(e?.message || e))
  }
}

// sanity: tools collect when enabled
{
  const n = collectOpenAITools().length
  n >= 1 ? pass('T-collect', `${n} tools`) : fail('T-collect', 'no tools')
}

const failed = results.filter((r) => !r.ok)
console.log('\n--- summary ---')
console.log(`passed ${results.length - failed.length}/${results.length}`)
if (failed.length) {
  console.log('failed:', failed.map((f) => f.id).join(', '))
  process.exitCode = 1
} else {
  console.log('all exec-layer checks passed')
}
