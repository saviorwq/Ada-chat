/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * 成本优化设置面板（从 script.js 迁出）
 * Cost optimizer settings panel — migrated from script.js
 */
function $(id) {
  return document.getElementById(id)
}

export async function showCostOptimizer() {
  if (typeof globalThis.setSettingsMenuActive === 'function') {
    globalThis.setSettingsMenuActive('costOptimizerMenuItem')
  }
  if (typeof globalThis.hideAllPanels === 'function') globalThis.hideAllPanels()
  const panel = $('costOptimizerPanel')
  if (panel) panel.style.display = 'block'
  const title = $('settingsContentTitle')
  if (title) title.textContent = '💰 成本优化'

  const lightSelect = $('costRoutingLightModel')
  if (lightSelect) {
    const currentVal = lightSelect.value
    lightSelect.innerHTML = '<option value="">-- 未配置 --</option>'
    try {
      const res = await fetch('ai_proxy.php?action=list_models')
      const data = await res.json()
      if (data.models) {
        data.models
          .filter((m) => m.type === 'chat')
          .forEach((m) => {
            const opt = document.createElement('option')
            opt.value = m.value
            opt.textContent = m.label
            lightSelect.appendChild(opt)
          })
      }
    } catch (e) {
      console.error('加载模型列表失败', e)
    }
    lightSelect.value = currentVal
  }

  try {
    const res = await fetch('ai_proxy.php?action=get_cost_settings')
    const data = await res.json()
    if (data.success && data.settings) {
      const s = data.settings
      if ($('costSlidingEnabled'))
        $('costSlidingEnabled').checked = s.sliding_window?.enabled ?? true
      if ($('costSlidingMaxTokens'))
        $('costSlidingMaxTokens').value = s.sliding_window?.max_tokens ?? 10000
      if ($('costSlidingKeepFirst'))
        $('costSlidingKeepFirst').value =
          s.sliding_window?.keep_first_rounds ?? 2
      if ($('costSlidingKeepLast'))
        $('costSlidingKeepLast').value = s.sliding_window?.keep_last_rounds ?? 5

      if ($('costRoutingEnabled'))
        $('costRoutingEnabled').checked = s.model_routing?.enabled ?? false
      if (lightSelect && s.model_routing?.light_model) {
        lightSelect.value = s.model_routing.light_model
      }
      if ($('costRoutingMaxChars'))
        $('costRoutingMaxChars').value = s.model_routing?.simple_max_chars ?? 30
      if ($('costRoutingKeywords'))
        $('costRoutingKeywords').value = s.model_routing?.complex_keywords ?? ''

      if ($('costCompressEnabled'))
        $('costCompressEnabled').checked = s.compress_output?.enabled ?? false
      if ($('costCompressInstruction'))
        $('costCompressInstruction').value =
          s.compress_output?.instruction ?? ''

      if ($('costKvEnabled'))
        $('costKvEnabled').checked = s.kv_cache?.enabled ?? false
      if ($('costKvTtl')) $('costKvTtl').value = s.kv_cache?.ttl ?? 3600
      if ($('costKvLoose'))
        $('costKvLoose').checked = s.kv_cache?.loose_match ?? false

      if ($('costMaxTokensEnabled'))
        $('costMaxTokensEnabled').checked = s.smart_max_tokens?.enabled ?? false
      if ($('costMaxTokensTiers')) {
        $('costMaxTokensTiers').value =
          s.smart_max_tokens?.tiers ?? '20:512,100:1024,500:2048,0:4096'
      }

      if ($('costPromptCompressEnabled')) {
        $('costPromptCompressEnabled').checked =
          s.prompt_compress?.enabled ?? false
      }
    }
  } catch (e) {
    console.error('加载成本设置失败', e)
  }
}

export async function saveCostSettings() {
  const settings = {
    sliding_window: {
      enabled: !!$('costSlidingEnabled')?.checked,
      max_tokens: parseInt($('costSlidingMaxTokens')?.value, 10) || 10000,
      keep_first_rounds: parseInt($('costSlidingKeepFirst')?.value, 10) || 2,
      keep_last_rounds: parseInt($('costSlidingKeepLast')?.value, 10) || 5,
    },
    model_routing: {
      enabled: !!$('costRoutingEnabled')?.checked,
      light_model: $('costRoutingLightModel')?.value ?? '',
      simple_max_chars: parseInt($('costRoutingMaxChars')?.value, 10) || 30,
      complex_keywords: $('costRoutingKeywords')?.value ?? '',
    },
    compress_output: {
      enabled: !!$('costCompressEnabled')?.checked,
      instruction: $('costCompressInstruction')?.value ?? '',
    },
    kv_cache: {
      enabled: !!$('costKvEnabled')?.checked,
      ttl: parseInt($('costKvTtl')?.value, 10) || 3600,
      loose_match: !!$('costKvLoose')?.checked,
    },
    smart_max_tokens: {
      enabled: !!$('costMaxTokensEnabled')?.checked,
      tiers: $('costMaxTokensTiers')?.value ?? '',
    },
    prompt_compress: {
      enabled: !!$('costPromptCompressEnabled')?.checked,
    },
  }

  try {
    const res = await fetch('ai_proxy.php?action=save_cost_settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    })
    const data = await res.json()
    if (data.success) {
      alert('成本优化设置已保存')
    } else {
      alert('保存失败: ' + (data.error || '未知错误'))
    }
  } catch (e) {
    alert('保存失败: 网络错误')
  }
}
