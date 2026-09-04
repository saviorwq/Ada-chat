/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 工作台模式定义（产品分层入口）
 * Workspace mode registry — product-layer entry points
 */

export const WORKSPACE_MODE_KEY = 'adachat_workspace_mode_v1'
export const WORKSPACE_LAUNCHER_DISMISSED_KEY =
  'adachat_workspace_launcher_dismissed_v1'

/** @typedef {'chat'|'create'|'dev'|'knowledge'|'lab'} WorkspaceModeId */

/**
 * @type {Array<{
 *   id: WorkspaceModeId,
 *   icon: string,
 *   titleKey: string,
 *   descKey: string,
 *   defaultCategory: string,
 *   categoryAllow: string[]|null,
 *   showAdvancedControls: boolean,
 *   openRag?: boolean,
 *   openStudio?: boolean
 * }>}
 */
export const WORKSPACE_MODES = [
  {
    id: 'chat',
    icon: '💬',
    titleKey: 'workspace_chat',
    descKey: 'workspace_chat_desc',
    defaultCategory: 'chat',
    categoryAllow: ['chat', 'vision', 'ocr', 'translation'],
    showAdvancedControls: false,
  },
  {
    id: 'create',
    icon: '✨',
    titleKey: 'workspace_create',
    descKey: 'workspace_create_desc',
    defaultCategory: 'image',
    categoryAllow: ['image', 'music', 'video', 'chat'],
    showAdvancedControls: false,
    openStudio: true,
  },
  {
    id: 'dev',
    icon: '💻',
    titleKey: 'workspace_dev',
    descKey: 'workspace_dev_desc',
    defaultCategory: 'code',
    categoryAllow: ['code', 'chat'],
    showAdvancedControls: false,
  },
  {
    id: 'knowledge',
    icon: '📚',
    titleKey: 'workspace_knowledge',
    descKey: 'workspace_knowledge_desc',
    defaultCategory: 'chat',
    categoryAllow: ['chat'],
    showAdvancedControls: false,
    openRag: true,
  },
  {
    id: 'lab',
    icon: '🧪',
    titleKey: 'workspace_lab',
    descKey: 'workspace_lab_desc',
    defaultCategory: 'chat',
    categoryAllow: null,
    showAdvancedControls: true,
  },
]

export function getWorkspaceModeById(id) {
  return WORKSPACE_MODES.find((m) => m.id === id) || WORKSPACE_MODES[0]
}

export function readStoredWorkspaceMode() {
  try {
    const v = localStorage.getItem(WORKSPACE_MODE_KEY)
    if (WORKSPACE_MODES.some((m) => m.id === v)) return v
  } catch {
    /* ignore */
  }
  return 'chat'
}

export function writeStoredWorkspaceMode(id) {
  try {
    localStorage.setItem(WORKSPACE_MODE_KEY, id)
  } catch {
    /* ignore */
  }
}
