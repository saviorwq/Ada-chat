/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * Cover 模式预设 — 一键填入 Prompt 与推荐参数
 * Cover presets — one-click prompt + params
 */

function $(id) {
  return document.getElementById(id)
}

function pack() {
  const i18n = globalThis.AdaChatI18n || globalThis.ADA_CHAT_I18N || {}
  const lang = globalThis.currentLanguage || globalThis.currentLang || 'zh'
  return i18n[lang] || i18n.zh || {}
}

/** @type {Record<string, {label: string, prompt: string, params: Record<string, string|number>}>} */
export const MUSIC_COVER_PRESETS = {
  'cold-indie-folk': {
    label: 'Cold Indie Folk 纯伴奏',
    prompt:
      'cold indie folk instrumental, minimalist acoustic guitar arpeggio, very sparse piano notes, 68 bpm strict steady tempo, numb detached melancholic mood, room atmospheric reverb, NO DRUMS NO PERCUSSION in first half of song, subtle soft strings enter ONLY at bridge section, no strings before bridge, slow fading outro, clean balanced mix, intimate bedroom recording, no vocals, no humming, no singing',
    params: {
      musicCoverStrength: '0.78',
      musicSteps: '60',
      musicCfg: '3',
      musicBpm: '68',
      musicLmTemp: '0.7',
      musicInferMethod: 'ode',
      musicFormat: 'wav',
    },
  },
}

function setFieldValue(id, value) {
  const el = $(id)
  if (!el || value == null) return
  el.value = String(value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

export function applyMusicCoverPreset(presetId) {
  const preset = MUSIC_COVER_PRESETS[presetId]
  if (!preset) return false

  const msg = $('msg')
  if (msg) msg.value = preset.prompt

  const p = preset.params || {}
  setFieldValue('musicCoverStrength', p.musicCoverStrength)
  setFieldValue('musicSteps', p.musicSteps)
  setFieldValue('musicCfg', p.musicCfg)
  setFieldValue('musicBpm', p.musicBpm)
  setFieldValue('musicLmTemp', p.musicLmTemp)
  setFieldValue('musicInferMethod', p.musicInferMethod)
  setFieldValue('musicFormat', p.musicFormat)

  const inst = $('musicInstrumentalOnly')
  if (inst) {
    inst.checked = true
    inst.disabled = true
  }

  try {
    localStorage.setItem('adachat_music_cover_strength', String(p.musicCoverStrength))
    localStorage.setItem('adachat_music_steps', String(p.musicSteps))
    localStorage.setItem('adachat_music_cfg', String(p.musicCfg))
    localStorage.setItem('adachat_music_bpm', String(p.musicBpm))
    localStorage.setItem('adachat_music_lm_temp', String(p.musicLmTemp))
    localStorage.setItem('adachat_music_infer_method', String(p.musicInferMethod))
    localStorage.setItem('adachat_music_task_type', 'cover')
  } catch (e) {
    /* ignore */
  }

  if (typeof globalThis.showAppToast === 'function') {
    globalThis.showAppToast(
      (pack().music_cover_preset_applied || '已应用 Cover 预设：{name}').replace(
        '{name}',
        preset.label
      ),
      2400
    )
  }
  return true
}

export function wireMusicCoverPresets() {
  const sel = $('musicCoverPreset')
  if (!sel || sel.dataset.boundCoverPreset === '1') return
  sel.dataset.boundCoverPreset = '1'

  Object.entries(MUSIC_COVER_PRESETS).forEach(([id, preset]) => {
    if ([...sel.options].some((o) => o.value === id)) return
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = preset.label
    sel.appendChild(opt)
  })

  sel.addEventListener('change', () => {
    const id = String(sel.value || '')
    if (!id) return
    applyMusicCoverPreset(id)
    sel.value = ''
  })
}

globalThis.applyMusicCoverPreset = applyMusicCoverPreset
globalThis.wireMusicCoverPresets = wireMusicCoverPresets
