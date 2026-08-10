/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * RAG module (v2)（原 adachat-rag.js）
 */
import { escapeHtml } from '@/shared/escape-html.js'

function $(id) {
  return document.getElementById(id)
}
function getLang() {
  return typeof globalThis.currentLanguage === 'string'
    ? globalThis.currentLanguage
    : 'zh'
}
function getI18n() {
  return globalThis.AdaChatI18n || globalThis.i18n || { zh: {}, en: {} }
}
function pack() {
  const i18n = getI18n()
  return i18n[getLang()] || i18n.en || {}
}

const RAG_SETTINGS_KEY = 'adachat_rag_settings_v1'
const RAG_STORE_CACHE_KEY = 'adachat_rag_store_cache_v2'
const RAG_STORE_LEGACY_KEY = 'adachat_rag_store_v1'
const RAG_SERVER_ENDPOINT = 'ai_proxy.php'
const RAG_MAX_FILE_BYTES_LOCAL = 1024 * 1024 // fallback local mode
const RAG_MAX_FILE_BYTES_SERVER = 5 * 1024 * 1024 // server mode

function getDefaultRagSettings() {
  return {
    enabled: false,
    topK: 4,
    maxChars: 1800,
    mode: 'vector',
    embedModel: 'qwen3-embedding:0.6b',
  }
}

let ragSettings = getDefaultRagSettings()
let ragStore = { version: 2, updatedAt: Date.now(), docs: [] }
let ragIndex = []
let ragIdfMap = {}
let ragAvgDocLen = 0
let ragStorageMode = 'local'
let ragVectorReady = false
/** 最近一次检索命中（供知识库面板可视化） / Last retrieval hits for KB UI */
let ragLastHits = []
const RAG_LAST_HITS_KEY = 'adachat_rag_last_hits_v1'

function loadRagLastHits() {
  try {
    const raw = localStorage.getItem(RAG_LAST_HITS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    ragLastHits = Array.isArray(parsed) ? parsed : []
  } catch {
    ragLastHits = []
  }
}

function saveRagLastHits(hits) {
  ragLastHits = Array.isArray(hits) ? hits.slice(0, 8) : []
  try {
    localStorage.setItem(RAG_LAST_HITS_KEY, JSON.stringify(ragLastHits))
  } catch {
    /* ignore */
  }
  renderRagRecentHits()
  if (typeof globalThis.refreshKnowledgeDock === 'function') {
    globalThis.refreshKnowledgeDock()
  }
}

function deriveCollectionName(docName) {
  const name = String(docName || '').replace(/\\/g, '/')
  if (name.includes('/')) {
    const parts = name.split('/').filter(Boolean)
    if (parts.length >= 2) return parts[0]
  }
  return getLang() === 'zh' ? '默认知识库' : 'Default'
}

export function getRagCollectionsSummary() {
  const docs = Array.isArray(ragStore?.docs) ? ragStore.docs : []
  const map = new Map()
  for (const doc of docs) {
    const col = deriveCollectionName(doc.name)
    const prev = map.get(col) || { name: col, docs: 0, chunks: 0 }
    prev.docs += 1
    prev.chunks += Array.isArray(doc.chunks) ? doc.chunks.length : 0
    map.set(col, prev)
  }
  return Array.from(map.values()).sort((a, b) => b.chunks - a.chunks)
}

export function getRagLastHits() {
  return ragLastHits.slice()
}

/** 供网关向量命中回写「最近命中」面板 / Mirror server vector hits into recent panel */
export function saveRagLastHitsFromExternal(hits) {
  saveRagLastHits(
    (Array.isArray(hits) ? hits : []).map((h) => ({
      docName: h.docName || h.doc_name || '',
      chunkIndex:
        typeof h.chunkIndex === 'number'
          ? h.chunkIndex
          : Number(h.chunk_index) || 0,
      score: h.score,
      preview: h.preview || String(h.text || '').slice(0, 120),
      at: Date.now(),
    }))
  )
}

/**
 * 解码 X-AdaChat-Rag-Citations（Base64 UTF-8 JSON）
 * Decode citation header (base64 of UTF-8 JSON)
 * @returns {array}
 */
export function decodeRagCitationsHeader(b64) {
  const raw = String(b64 || '').trim()
  if (!raw) return []
  const bin = atob(raw)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff
  const json = new TextDecoder('utf-8').decode(bytes)
  const hits = JSON.parse(json)
  return Array.isArray(hits) ? hits : []
}

/**
 * 从 fetch Response 挂载向量引用到最后一条助手消息
 * Attach vector RAG citations from response header onto last assistant msg
 */
export function applyRagCitationsFromResponse(response, convId) {
  try {
    const citB64 = response?.headers?.get?.('x-adachat-rag-citations')
    if (!citB64) return false
    const hits = decodeRagCitationsHeader(citB64)
    if (!hits.length) return false
    if (typeof globalThis.attachRagCitationsToLastAssistant === 'function') {
      const conv = (globalThis.conversations || []).find((c) => c.id === convId)
      const last = conv?.messages?.[conv.messages.length - 1]
      if (!last || last.role !== 'assistant') {
        if (typeof globalThis.appendToLastAIMessage === 'function') {
          globalThis.appendToLastAIMessage('', convId)
        }
      }
      globalThis.attachRagCitationsToLastAssistant(convId, hits)
    }
    saveRagLastHitsFromExternal(hits)
    return true
  } catch {
    return false
  }
}

function normalizeRagText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitIntoRagChunks(text, chunkSize = 1100, overlap = 160) {
  const clean = normalizeRagText(text)
  if (!clean) return []
  const paras = clean
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean)
  if (!paras.length) return []

  const out = []
  let cur = []
  let curLen = 0
  for (const p of paras) {
    if (p.length > chunkSize) {
      if (cur.length) {
        out.push(cur.join('\n\n').trim())
        cur = []
        curLen = 0
      }
      let i = 0
      while (i < p.length) {
        const part = p.slice(i, i + chunkSize).trim()
        if (part.length >= 24) out.push(part)
        if (i + chunkSize >= p.length) break
        i += Math.max(1, chunkSize - overlap)
      }
      continue
    }
    const addLen = p.length + (cur.length ? 2 : 0)
    if (curLen + addLen <= chunkSize) {
      cur.push(p)
      curLen += addLen
    } else {
      out.push(cur.join('\n\n').trim())
      cur = [p]
      curLen = p.length
    }
  }
  if (cur.length) out.push(cur.join('\n\n').trim())
  return out.filter((x) => x.length >= 24)
}

function tokenizeRagText(text) {
  const src = normalizeRagText(text).toLowerCase()
  if (!src) return []
  const tokens = []
  const en = src.match(/[a-z0-9_]{2,}/g) || []
  tokens.push(...en)

  const zhOnly = src.replace(/[^\u4e00-\u9fa5]/g, '')
  for (let i = 0; i < zhOnly.length; i++) {
    tokens.push(zhOnly[i])
  }
  for (let i = 0; i < zhOnly.length - 1; i++) {
    tokens.push(zhOnly.slice(i, i + 2))
  }
  return tokens
}

function buildTfMap(tokens) {
  const tf = Object.create(null)
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1
  }
  return tf
}

function countRagStats(store) {
  const docs = Array.isArray(store?.docs) ? store.docs : []
  let chunks = 0
  let chars = 0
  docs.forEach((d) => {
    const arr = Array.isArray(d?.chunks) ? d.chunks : []
    chunks += arr.length
    arr.forEach((c) => {
      chars += String(c || '').length
    })
  })
  return { docs: docs.length, chunks, chars }
}

function saveRagSettingsToLocal() {
  localStorage.setItem(RAG_SETTINGS_KEY, JSON.stringify(ragSettings))
}

function saveRagStoreCacheToLocal() {
  localStorage.setItem(RAG_STORE_CACHE_KEY, JSON.stringify(ragStore))
}

function normalizeRagStoreShape(saved) {
  if (!saved || !Array.isArray(saved.docs)) {
    return { version: 2, updatedAt: Date.now(), docs: [] }
  }
  const docs = saved.docs
    .filter((d) => d && typeof d === 'object' && Array.isArray(d.chunks))
    .map((d) => ({
      id: String(
        d.id || `rag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      ),
      name: String(d.name || 'untitled').slice(0, 220),
      chunks: d.chunks.map((x) => normalizeRagText(x)).filter(Boolean),
      updatedAt: Number(d.updatedAt || Date.now()),
    }))
    .filter((d) => d.chunks.length > 0)
  return {
    version: 2,
    updatedAt: Number(saved.updatedAt || Date.now()),
    docs,
  }
}

export function loadRagSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(RAG_SETTINGS_KEY) || 'null')
    ragSettings = { ...getDefaultRagSettings(), ...(saved || {}) }
  } catch {
    ragSettings = getDefaultRagSettings()
  }
  if (ragSettings.mode !== 'vector' && ragSettings.mode !== 'lexical') {
    ragSettings.mode = 'lexical'
  }
}

function fetchRagStoreRemote() {
  return fetch(`${RAG_SERVER_ENDPOINT}?action=get_rag_store&_=${Date.now()}`)
    .then((r) => r.json())
    .then((json) => {
      if (!json || !json.success || !json.store)
        throw new Error('invalid_remote_store')
      return normalizeRagStoreShape(json.store)
    })
}

function pushRagStoreRemote() {
  const payload = { store: ragStore }
  return fetch(`${RAG_SERVER_ENDPOINT}?action=save_rag_store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then((r) => r.json())
    .then((json) => {
      if (!json || !json.success || !json.store)
        throw new Error(json?.error || 'save_failed')
      return normalizeRagStoreShape(json.store)
    })
}

export function loadRagStore() {
  let localSnapshot = { version: 2, updatedAt: Date.now(), docs: [] }
  try {
    const rawCache = localStorage.getItem(RAG_STORE_CACHE_KEY)
    const rawLegacy = localStorage.getItem(RAG_STORE_LEGACY_KEY)
    const cache = JSON.parse(rawCache || rawLegacy || 'null')
    ragStore = normalizeRagStoreShape(cache)
    localSnapshot = normalizeRagStoreShape(cache)
    ragStorageMode = 'local'
    saveRagStoreCacheToLocal()
  } catch {
    ragStore = { version: 2, updatedAt: Date.now(), docs: [] }
    localSnapshot = { version: 2, updatedAt: Date.now(), docs: [] }
    ragStorageMode = 'local'
  }

  // Server-first sync (non-blocking). Fallback remains local cache.
  fetchRagStoreRemote()
    .then((remote) => {
      const localHasData = (localSnapshot.docs || []).length > 0
      const remoteHasData = (remote.docs || []).length > 0
      const localUpdatedAt = Number(localSnapshot.updatedAt || 0)
      const remoteUpdatedAt = Number(remote.updatedAt || 0)

      if (
        localHasData &&
        (!remoteHasData || localUpdatedAt > remoteUpdatedAt)
      ) {
        // Keep local as source-of-truth and sync up to server.
        ragStore = localSnapshot
        saveRagStore().finally(() => {
          rebuildRagIndex()
          renderRagDocList()
        })
        return
      }

      ragStore = remote
      ragStorageMode = 'server'
      saveRagStoreCacheToLocal()
      rebuildRagIndex()
      renderRagDocList()
    })
    .catch(() => {
      // Keep local mode silently.
    })
}

function saveRagStore() {
  ragStore.updatedAt = Date.now()
  saveRagStoreCacheToLocal()
  // Best effort remote persistence
  return pushRagStoreRemote()
    .then((remote) => {
      ragStore = remote
      ragStorageMode = 'server'
      saveRagStoreCacheToLocal()
      return true
    })
    .catch(() => {
      ragStorageMode = 'local'
      return false
    })
}

export function rebuildRagIndex() {
  ragIndex = []
  ragIdfMap = {}
  ragAvgDocLen = 0

  const docs = Array.isArray(ragStore?.docs) ? ragStore.docs : []
  if (!docs.length) return

  const df = Object.create(null)
  let totalChunkLen = 0
  for (const doc of docs) {
    const chunks = Array.isArray(doc.chunks) ? doc.chunks : []
    chunks.forEach((chunkText, idx) => {
      const tokens = tokenizeRagText(chunkText)
      if (!tokens.length) return
      const tf = buildTfMap(tokens)
      const uniq = new Set(tokens)
      uniq.forEach((t) => {
        df[t] = (df[t] || 0) + 1
      })
      const tokenLen = tokens.length
      totalChunkLen += tokenLen
      ragIndex.push({
        id: `${doc.id}_${idx}`,
        docId: doc.id,
        docName: doc.name,
        chunkIndex: idx,
        text: chunkText,
        tf,
        tokenLen,
      })
    })
  }

  const totalChunks = ragIndex.length
  if (!totalChunks) return
  ragAvgDocLen = totalChunkLen / totalChunks

  Object.keys(df).forEach((token) => {
    // BM25-style idf
    const n = df[token]
    ragIdfMap[token] = Math.log(1 + (totalChunks - n + 0.5) / (n + 0.5))
  })
}

function scoreChunkBm25(item, qtf) {
  const k1 = 1.2
  const b = 0.75
  const dl = Math.max(1, item.tokenLen || 1)
  const avgdl = Math.max(1, ragAvgDocLen || 1)
  let score = 0
  for (const token of Object.keys(qtf)) {
    const tf = item.tf[token] || 0
    if (!tf) continue
    const idf = ragIdfMap[token] || 0.0001
    const numerator = tf * (k1 + 1)
    const denominator = tf + k1 * (1 - b + b * (dl / avgdl))
    score += idf * (numerator / denominator) * Math.min(3, qtf[token])
  }
  return score
}

function readPersonaRagOverride() {
  // 会话快照优先 / Conversation snapshot wins
  if (typeof globalThis.getEffectiveRagOverride === 'function') {
    return globalThis.getEffectiveRagOverride()
  }
  try {
    const raw = localStorage.getItem('adachat_persona_rag_override_v1')
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

function isRagEffectivelyEnabled() {
  const override = readPersonaRagOverride()
  if (override) return !!override.enabled
  return !!ragSettings.enabled
}

function retrieveRagChunks(query) {
  const tokens = tokenizeRagText(query)
  if (!tokens.length || !ragIndex.length) return []
  const override = readPersonaRagOverride()
  const collection = override?.collection ? String(override.collection) : ''
  const qtf = buildTfMap(tokens)
  const scored = []
  for (const item of ragIndex) {
    if (collection) {
      const col = deriveCollectionName(item.docName)
      if (col !== collection) continue
    }
    const score = scoreChunkBm25(item, qtf)
    if (score > 0) scored.push({ ...item, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, Math.max(1, parseInt(ragSettings.topK, 10) || 4))
}

export function buildRagSystemPrompt(userText) {
  if (!isRagEffectivelyEnabled()) return null
  const override = readPersonaRagOverride()
  const collectionFilter = override?.collection ? String(override.collection) : ''
  // In vector mode, retrieval is executed on server side only when backend is ready.
  // Collection-scoped personas stay on client lexical to honor the filter.
  // 有集合过滤时走本地词法检索，以便按知识库收窄。
  if (
    !collectionFilter &&
    (ragSettings.mode || 'vector') === 'vector' &&
    ragStorageMode === 'server' &&
    ragVectorReady
  )
    return null
  const top = retrieveRagChunks(userText || '')
  if (!top.length) {
    saveRagLastHits([])
    return null
  }
  const maxChars = Math.max(600, parseInt(ragSettings.maxChars, 10) || 1800)
  let used = 0
  const refs = []
  const hitMeta = []
  for (const chunk of top) {
    const snippet = normalizeRagText(chunk.text)
    if (!snippet) continue
    if (used + snippet.length > maxChars) break
    used += snippet.length
    refs.push(`【来源:${chunk.docName}#${chunk.chunkIndex + 1}】\n${snippet}`)
    hitMeta.push({
      docName: chunk.docName,
      chunkIndex: chunk.chunkIndex,
      score: chunk.score,
      preview: snippet.slice(0, 120),
      at: Date.now(),
    })
  }
  saveRagLastHits(hitMeta)
  if (!refs.length) return null
  return (
    '以下是从本地知识库检索到的参考资料。回答时请优先参考这些内容；若资料不足，请明确说明并给出保守结论。\n\n' +
    refs.join('\n\n')
  )
}

export function buildRagRequestPayload(userText) {
  const mode = String(ragSettings.mode || 'vector')
  const vectorUsable = mode === 'vector' && ragVectorReady
  const override = readPersonaRagOverride()
  const collectionFilter = override?.collection ? String(override.collection) : ''
  // 集合过滤由前端 lexical 注入，避免服务端向量注入重复/无法过滤
  const serverEnabled =
    isRagEffectivelyEnabled() && !collectionFilter && vectorUsable
  return {
    enabled: serverEnabled,
    mode: vectorUsable && !collectionFilter ? 'vector' : 'lexical',
    topK: Math.max(1, parseInt(ragSettings.topK, 10) || 4),
    maxChars: Math.max(600, parseInt(ragSettings.maxChars, 10) || 1800),
    embedModel:
      String(ragSettings.embedModel || 'qwen3-embedding:0.6b').trim() ||
      'qwen3-embedding:0.6b',
    query: String(userText || '').trim(),
    collection: collectionFilter || undefined,
  }
}

export function toggleRagEmbedModelCustomInput() {
  const selectEl = $('ragEmbedModel')
  const customEl = $('ragEmbedModelCustom')
  if (!selectEl || !customEl) return
  const useCustom = String(selectEl.value || '') === '__custom__'
  customEl.style.display = useCustom ? '' : 'none'
}

function getSelectedRagEmbedModel() {
  const selectEl = $('ragEmbedModel')
  const customEl = $('ragEmbedModelCustom')
  if (!selectEl) return String(ragSettings.embedModel || 'qwen3-embedding:0.6b')
  if (String(selectEl.value || '') === '__custom__') {
    const v = String(customEl?.value || '').trim()
    return v || String(ragSettings.embedModel || 'qwen3-embedding:0.6b')
  }
  return (
    String(selectEl.value || '').trim() ||
    String(ragSettings.embedModel || 'qwen3-embedding:0.6b')
  )
}

async function loadRagEmbedModelOptions() {
  const selectEl = $('ragEmbedModel')
  const customEl = $('ragEmbedModelCustom')
  if (!selectEl) return

  const current =
    String(ragSettings.embedModel || 'qwen3-embedding:0.6b').trim() ||
    'qwen3-embedding:0.6b'
  let modelNames = []

  try {
    // List enabled models and keep embedding models from all providers.
    const modelsRes = await fetch(
      `ai_proxy.php?action=list_models&_=${Date.now()}`
    )
    const modelsParsed = await readJsonResponseSafe(modelsRes)
    const list = Array.isArray(modelsParsed?.data?.models)
      ? modelsParsed.data.models
      : []

    const out = []
    const seen = new Set()
    for (const m of list) {
      if (!m || String(m.type || '') !== 'embedding') continue
      const rawValue = String(m.value || '')
      const sep = rawValue.indexOf('::')
      if (sep <= 0) continue
      const modelId = rawValue.slice(sep + 2).trim()
      if (!modelId || seen.has(modelId)) continue
      seen.add(modelId)
      out.push(modelId)
    }
    modelNames = out
  } catch {
    // Fallback to current value only.
    modelNames = []
  }

  if (!modelNames.length) {
    modelNames = ['qwen3-embedding:0.6b']
  }

  selectEl.innerHTML = ''
  modelNames.forEach((name) => {
    const opt = document.createElement('option')
    opt.value = name
    opt.textContent = name
    selectEl.appendChild(opt)
  })
  const customOpt = document.createElement('option')
  customOpt.value = '__custom__'
  customOpt.textContent = '自定义输入...'
  selectEl.appendChild(customOpt)

  if (modelNames.includes(current)) {
    selectEl.value = current
    if (customEl) customEl.value = ''
  } else {
    selectEl.value = '__custom__'
    if (customEl) customEl.value = current
  }
  toggleRagEmbedModelCustomInput()
}

function renderRagCollections() {
  const el = $('ragCollections')
  if (!el) return
  const t = pack()
  const cols = getRagCollectionsSummary()
  if (!cols.length) {
    el.innerHTML = ''
    return
  }
  el.innerHTML =
    `<div class="rag-collections__title">${t.rag_collections || '知识库'}</div>` +
    `<div class="rag-collections__grid">` +
    cols
      .map(
        (c) => `
      <div class="rag-collection-card">
        <div class="rag-collection-card__name">${escapeHtml(c.name)}</div>
        <div class="rag-collection-card__meta">${c.docs} ${t.rag_files || '文件'} · ${c.chunks} chunks</div>
      </div>`
      )
      .join('') +
    `</div>`
}

function renderRagRecentHits() {
  const el = $('ragRecentHits')
  if (!el) return
  const t = pack()
  if (!ragLastHits.length) {
    el.innerHTML = `<div class="hint">${t.rag_hits_empty || '暂无检索命中记录'}</div>`
    return
  }
  el.innerHTML =
    `<div class="rag-hits__title">${t.rag_recent_hits || '最近命中'}</div>` +
    ragLastHits
      .map((h) => {
        const title = `${h.docName || ''}#${(h.chunkIndex || 0) + 1}`
        return `
        <div class="rag-hit-item">
          <div class="rag-hit-item__title">${escapeHtml(title)}</div>
          <div class="rag-hit-item__preview">${escapeHtml(h.preview || '')}</div>
        </div>`
      })
      .join('')
}

function renderRagDocList() {
  const listEl = $('ragDocList')
  const statsEl = $('ragStats')
  if (!listEl || !statsEl) return
  const t = pack()
  const docs = ragStore.docs || []
  const stat = countRagStats(ragStore)
  const modeLabel = ragStorageMode === 'server' ? 'server' : 'local'
  statsEl.textContent =
    `${t.rag_docs_count}: ${stat.docs} · ` +
    `${t.rag_chunks_count}: ${stat.chunks} · ` +
    `chars: ${stat.chars} · mode: ${modeLabel}`

  renderRagCollections()
  renderRagRecentHits()

  if (!docs.length) {
    listEl.innerHTML = `<div class="hint">${t.rag_docs_empty}</div>`
    return
  }

  listEl.innerHTML = docs
    .map((doc) => {
      const charCount = (doc.chunks || []).reduce(
        (s, t) => s + String(t || '').length,
        0
      )
      const col = deriveCollectionName(doc.name)
      return `
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; padding:10px 12px; border:1px solid var(--border); border-radius:var(--radius-md); margin-bottom:8px;">
                <div>
                    <div style="font-weight:600;">${escapeHtml(doc.name)}</div>
                    <div class="hint" style="font-size:12px;">${escapeHtml(col)} · ${doc.chunks?.length || 0} chunks · ${charCount} chars</div>
                </div>
                <button class="deselect-all-btn" onclick="deleteRagDoc('${escapeHtml(doc.id)}')">🗑️</button>
            </div>
        `
    })
    .join('')
}

function renderRagVectorStatus(status, extraMsg = '') {
  const el = $('ragVectorStatus')
  if (!el) return
  if (!status || typeof status !== 'object') {
    el.textContent = extraMsg || ''
    return
  }
  const py = status.python ? `python=${status.python}` : 'python=unknown'
  const chroma = status.chromadb_usable
    ? 'chromadb=ok'
    : status.chromadb_installed
      ? 'chromadb=broken'
      : 'chromadb=missing'
  const np = status.numpy_usable ? 'numpy=ok' : 'numpy=missing'
  const ollama = status.ollama_reachable ? 'ollama=ok' : 'ollama=offline'
  const ready = status.vector_ready ? 'vector=ready' : 'vector=not-ready'
  const parts = [py, chroma, np, ollama, ready]
  if (extraMsg) parts.push(extraMsg)
  el.textContent = parts.join(' | ')
}

function formatRagErrorDetail(detail) {
  if (!detail || !Array.isArray(detail.attempts) || !detail.attempts.length)
    return ''
  const last = detail.attempts[detail.attempts.length - 1] || {}
  const cmd = String(last.cmd || '').trim()
  const out = String(last.output || '').trim()
  const snippets = []
  if (cmd) snippets.push(`cmd: ${cmd}`)
  if (out) snippets.push(`output: ${out}`)
  return snippets.join('\n')
}

async function readJsonResponseSafe(res) {
  const raw = await res.text()
  const text = String(raw || '').trim()
  if (!text) {
    return {
      ok: false,
      data: null,
      raw: '',
      status: res?.status || 0,
      statusText: res?.statusText || '',
    }
  }
  try {
    return {
      ok: true,
      data: JSON.parse(text),
      raw: text,
      status: res?.status || 0,
      statusText: res?.statusText || '',
    }
  } catch {
    return {
      ok: false,
      data: null,
      raw: text,
      status: res?.status || 0,
      statusText: res?.statusText || '',
    }
  }
}

export async function checkRagVectorStatus(showAlert = false) {
  try {
    const res = await fetch(
      `${RAG_SERVER_ENDPOINT}?action=rag_vector_status&_=${Date.now()}`
    )
    const parsed = await readJsonResponseSafe(res)
    const json = parsed.data
    if (!parsed.ok || !json) {
      ragVectorReady = false
      renderRagVectorStatus(
        null,
        'vector status unavailable (empty/non-json response)'
      )
      if (showAlert)
        alert(
          `检查失败：服务返回空响应或非 JSON (HTTP ${parsed.status || 0} ${parsed.statusText || ''}).\n${parsed.raw ? parsed.raw.slice(0, 600) : ''}`
        )
      return null
    }
    if (!json || !json.success) {
      ragVectorReady = false
      renderRagVectorStatus(
        null,
        `vector status unavailable (${json?.error || 'unknown_error'})`
      )
      if (showAlert) {
        const detail = formatRagErrorDetail(json?.detail)
        const hint = json?.hint ? `\n${json.hint}` : ''
        alert(
          `检查失败: ${json?.error || 'unknown_error'}${hint}${detail ? `\n\n${detail}` : ''}`
        )
      }
      return null
    }
    ragVectorReady = !!json?.status?.vector_ready
    renderRagVectorStatus(json.status || {})
    if (showAlert) {
      const ok = !!json?.status?.vector_ready
      alert(
        ok ? '向量环境可用。' : '向量环境未就绪，请先安装依赖或启动 Ollama。'
      )
    }
    return json.status || null
  } catch (e) {
    ragVectorReady = false
    renderRagVectorStatus(null, 'vector status unavailable')
    if (showAlert) alert(`检查失败: ${e?.message || e}`)
    return null
  }
}

export async function installRagVectorDeps() {
  try {
    const res = await fetch(
      `${RAG_SERVER_ENDPOINT}?action=rag_vector_install_deps`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    const parsed = await readJsonResponseSafe(res)
    const json = parsed.data
    if (!parsed.ok || !json) {
      alert(
        `安装失败：服务返回空响应或非 JSON (HTTP ${parsed.status || 0} ${parsed.statusText || ''}).\n${parsed.raw ? parsed.raw.slice(0, 600) : ''}`
      )
      await checkRagVectorStatus(false)
      return false
    }
    if (!json || !json.success) {
      const detail = formatRagErrorDetail(json?.detail)
      alert(
        `安装失败：${json?.error || 'unknown_error'}\n${json?.hint || ''}${detail ? `\n\n${detail}` : ''}`
      )
      await checkRagVectorStatus(false)
      return false
    }
    await checkRagVectorStatus(false)
    alert('向量依赖安装完成。')
    return true
  } catch (e) {
    alert(`安装失败：${e?.message || e}`)
    await checkRagVectorStatus(false)
    return false
  }
}

export function showRagSettings() {
  if (typeof globalThis.setSettingsMenuActive === 'function') {
    globalThis.setSettingsMenuActive('ragMenuItem')
  }
  if (typeof globalThis.hideAllPanels === 'function') globalThis.hideAllPanels()
  const panel = $('ragPanel')
  if (panel) panel.style.display = 'block'
  $('settingsContentTitle').textContent = pack().rag_knowledge
  if ($('ragEnable')) $('ragEnable').checked = !!ragSettings.enabled
  if ($('ragTopK')) $('ragTopK').value = ragSettings.topK || 4
  if ($('ragMaxChars')) $('ragMaxChars').value = ragSettings.maxChars || 1800
  if ($('ragMode')) $('ragMode').value = ragSettings.mode || 'vector'
  loadRagEmbedModelOptions()
  loadRagLastHits()
  renderRagDocList()
  checkRagVectorStatus(false)
}

export function saveRagSettings() {
  ragSettings.enabled = !!$('ragEnable')?.checked
  ragSettings.topK = Math.max(
    1,
    Math.min(10, parseInt($('ragTopK')?.value, 10) || 4)
  )
  ragSettings.maxChars = Math.max(
    600,
    Math.min(5000, parseInt($('ragMaxChars')?.value, 10) || 1800)
  )
  ragSettings.mode = String($('ragMode')?.value || 'vector')
  ragSettings.embedModel =
    String(getSelectedRagEmbedModel() || 'qwen3-embedding:0.6b').trim() ||
    'qwen3-embedding:0.6b'
  saveRagSettingsToLocal()
  if (typeof globalThis.refreshKnowledgeDock === 'function') {
    globalThis.refreshKnowledgeDock()
  }
  alert(pack().rag_saved)
}

export async function rebuildRagVectorIndex(showAlert = true) {
  const embedModel =
    String(ragSettings.embedModel || 'qwen3-embedding:0.6b').trim() ||
    'qwen3-embedding:0.6b'
  try {
    const res = await fetch(`${RAG_SERVER_ENDPOINT}?action=rag_rebuild_index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embed_model: embedModel }),
    })
    const parsed = await readJsonResponseSafe(res)
    const json = parsed.data
    if (!parsed.ok || !json) {
      if (showAlert)
        alert(
          `向量索引重建失败：服务返回空响应或非 JSON (HTTP ${parsed.status || 0} ${parsed.statusText || ''}).\n${parsed.raw ? parsed.raw.slice(0, 600) : ''}`
        )
      return false
    }
    if (!json || !json.success) {
      const err = String(json?.error || 'unknown_error')
      if (showAlert) {
        if (err.includes('chromadb_not_installed')) {
          const goInstall = confirm(
            '检测到缺少 chromadb，是否现在一键安装向量依赖？'
          )
          if (goInstall) {
            const ok = await installRagVectorDeps()
            if (ok) {
              return await rebuildRagVectorIndex(showAlert)
            }
          }
        } else {
          const detail = formatRagErrorDetail(json?.detail)
          const hint = json?.hint ? `\n${json.hint}` : ''
          alert(
            `向量索引重建失败: ${err}${hint}${detail ? `\n\n${detail}` : ''}`
          )
        }
      }
      return false
    }
    if (showAlert) {
      const indexed = Number(json?.result?.indexed || 0)
      alert(`向量索引重建完成，已索引 ${indexed} 条。`)
    }
    return true
  } catch (e) {
    if (showAlert) alert(`向量索引重建失败: ${e?.message || e}`)
    return false
  }
}

export async function importRagFiles(fileList) {
  const files = Array.from(fileList || [])
  if (!files.length) return
  const acceptedExt = ['txt', 'md', 'json', 'csv', 'log']
  let imported = 0

  const maxBytes =
    ragStorageMode === 'server'
      ? RAG_MAX_FILE_BYTES_SERVER
      : RAG_MAX_FILE_BYTES_LOCAL

  for (const file of files) {
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!acceptedExt.includes(ext)) continue
    if (file.size > maxBytes) continue

    const raw = await file.text()
    const text = normalizeRagText(raw)
    if (!text) continue

    const chunks = splitIntoRagChunks(text)
    if (!chunks.length) continue

    const id = `rag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const existingIndex = (ragStore.docs || []).findIndex(
      (d) => d.name === file.name
    )
    const doc = { id, name: file.name, chunks, updatedAt: Date.now() }
    if (existingIndex >= 0) ragStore.docs[existingIndex] = doc
    else ragStore.docs.push(doc)
    imported++
  }

  if (!imported) {
    alert(pack().rag_import_none)
    return
  }

  await saveRagStore()
  rebuildRagIndex()
  renderRagDocList()
  if (
    (ragSettings.mode || 'vector') === 'vector' &&
    ragStorageMode === 'server'
  ) {
    await rebuildRagVectorIndex(false)
  }
  alert(`${pack().rag_import_done}: ${imported}`)
}

export async function importRagFolder(fileList) {
  await importRagFiles(fileList)
}

export async function deleteRagDoc(docId) {
  if (!confirm(pack().rag_delete_doc_confirm)) return
  ragStore.docs = (ragStore.docs || []).filter((d) => d.id !== docId)
  await saveRagStore()
  rebuildRagIndex()
  renderRagDocList()
  if (
    (ragSettings.mode || 'vector') === 'vector' &&
    ragStorageMode === 'server'
  ) {
    await rebuildRagVectorIndex(false)
  }
}

export async function clearRagKnowledge() {
  ragStore.docs = []
  await saveRagStore()
  rebuildRagIndex()
  renderRagDocList()
  if (
    (ragSettings.mode || 'vector') === 'vector' &&
    ragStorageMode === 'server'
  ) {
    await rebuildRagVectorIndex(false)
  }
}
