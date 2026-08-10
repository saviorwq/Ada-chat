/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 插件 / 内联 handler 依赖的 globalThis 默认值（须在首包尽早执行）
 * Default globalThis fields expected by plugins and legacy inline handlers
 */

export function installLegacyWindowDefaults() {
  if (typeof globalThis === 'undefined') return
  const g = globalThis
  g.currentBase64 = g.currentBase64 || ''
  if (typeof g.allModels === 'undefined') g.allModels = []
  g.providers = g.providers || []
  g.pendingUserEditRestart = g.pendingUserEditRestart || null
  if (typeof g.currentUploadMeta === 'undefined') g.currentUploadMeta = null
  if (typeof g.currentPdfText === 'undefined') g.currentPdfText = ''
  if (typeof g.currentPdfPageImages === 'undefined') g.currentPdfPageImages = []
}
