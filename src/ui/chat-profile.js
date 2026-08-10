/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 聊天资料 / 头像（从 script.js 迁出；chat-render 依赖 globalThis.getRoleProfile）
 * Chat profile & avatars — migrated from script.js; chat-render uses globalThis.getRoleProfile
 */
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

const CHAT_PROFILE_KEY = 'chat_profile_settings'
const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024

export function getDefaultChatProfile() {
  return {
    user: { name: '你', avatar: '' },
    assistant: { name: 'Ada', avatar: '', callUserAs: '' },
  }
}

export function loadChatProfileSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_PROFILE_KEY) || 'null')
    const def = getDefaultChatProfile()
    return {
      user: { ...def.user, ...(saved?.user || {}) },
      assistant: { ...def.assistant, ...(saved?.assistant || {}) },
    }
  } catch {
    return getDefaultChatProfile()
  }
}

export function saveChatProfileSettings(profile) {
  localStorage.setItem(CHAT_PROFILE_KEY, JSON.stringify(profile))
}

export function getRoleProfile(role) {
  const profile = loadChatProfileSettings()
  return role === 'user' ? profile.user : profile.assistant
}

export function getPreferredUserAddress() {
  const profile = loadChatProfileSettings()
  const custom = (profile.assistant?.callUserAs || '').trim()
  if (custom) return custom
  return (profile.user?.name || '').trim() || '用户'
}

export function isValidAvatarUrl(url) {
  if (!url) return false
  const s = String(url).trim()
  return /^https?:\/\/.+/i.test(s) || s.startsWith('data:image/')
}

export function setProfileAvatarPreview(inputId, previewId, fallbackEmoji) {
  const input = $(inputId)
  const preview = $(previewId)
  if (!preview) return
  const avatarUrl = (input?.value || '').trim()
  if (isValidAvatarUrl(avatarUrl)) {
    preview.src = avatarUrl
    preview.style.display = 'block'
    return
  }
  preview.removeAttribute('src')
  preview.style.display = 'none'
  preview.setAttribute('data-fallback', fallbackEmoji || '')
}

export function refreshProfileAvatarPreviews() {
  setProfileAvatarPreview('playerAvatar', 'playerAvatarPreview', '🙂')
  setProfileAvatarPreview('aiAvatar', 'aiAvatarPreview', '🤖')
}

export function compressImageFileToDataUrl(
  file,
  maxBytes = PROFILE_AVATAR_MAX_BYTES
) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error('image_decode_failed'))
      img.onload = () => {
        let width = img.width
        let height = img.height
        const maxSide = 1024
        if (Math.max(width, height) > maxSide) {
          const ratio = maxSide / Math.max(width, height)
          width = Math.max(1, Math.round(width * ratio))
          height = Math.max(1, Math.round(height * ratio))
        }

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas_ctx_failed'))
        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)

        let quality = 0.9
        let result = canvas.toDataURL('image/jpeg', quality)
        while (result.length > maxBytes * 1.37 && quality > 0.2) {
          quality -= 0.1
          result = canvas.toDataURL('image/jpeg', quality)
        }
        resolve(result)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

export async function uploadProfileAvatar(role, inputEl) {
  const file = inputEl?.files?.[0]
  if (!file) return
  const t = pack()
  if (!file.type.startsWith('image/')) {
    alert(t.avatar_file_invalid)
    inputEl.value = ''
    return
  }
  try {
    const compressedDataUrl = await compressImageFileToDataUrl(
      file,
      PROFILE_AVATAR_MAX_BYTES
    )
    const targetId = role === 'assistant' ? 'aiAvatar' : 'playerAvatar'
    const targetInput = $(targetId)
    if (targetInput) targetInput.value = compressedDataUrl
    refreshProfileAvatarPreviews()
    alert(
      `${t.avatar_upload_success} (${Math.round(compressedDataUrl.length / 1.37 / 1024)} KB)`
    )
  } catch (err) {
    console.error('Avatar upload failed:', err)
    alert(t.avatar_upload_failed)
  } finally {
    inputEl.value = ''
  }
}
