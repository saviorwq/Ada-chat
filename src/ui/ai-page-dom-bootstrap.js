/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
/**
 * AI.php 页面 DOM 引导：图片预览区显隐、removePreview、输入框自动高度
 * AI.php page DOM bootstrap — preview visibility, removePreview, textarea auto-resize
 * （原 AI.php 内联脚本，迁入 Vite full bundle）
 * (migrated from AI.php inline script into Vite full bundle)
 */
export function installAiPageDomBootstrap() {
  const previewImg = document.getElementById('preview')
  const previewContainer = document.getElementById('previewContainer')
  const removeBtn = document.getElementById('removePreviewBtn')
  const fileInput = document.getElementById('file-input')

  if (previewImg && previewContainer) {
    previewImg.style.display = 'none'
    previewContainer.style.display = 'none'

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.attributeName === 'src' ||
          mutation.attributeName === 'style'
        ) {
          const hasSrc =
            previewImg.src &&
            previewImg.src !== '' &&
            !previewImg.src.endsWith('undefined')
          if (hasSrc && previewImg.src !== globalThis.location.href) {
            previewImg.style.display = 'block'
            previewContainer.style.display = 'flex'
          } else {
            previewImg.style.display = 'none'
            previewContainer.style.display = 'none'
          }
        }
      }
    })

    observer.observe(previewImg, {
      attributes: true,
      attributeFilter: ['src', 'style'],
    })

    previewImg.style.display = 'none'
    previewContainer.style.display = 'none'
  }

  function removePreview() {
    if (previewImg) {
      previewImg.src = ''
      previewImg.style.display = 'none'
    }
    if (previewContainer) {
      previewContainer.style.display = 'none'
    }
    if (typeof globalThis.currentBase64 !== 'undefined') {
      globalThis.currentBase64 = ''
    }
    if (fileInput) fileInput.value = ''
  }

  globalThis.removePreview = removePreview

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      removePreview()
    })
  }

  if (previewContainer) {
    previewContainer.addEventListener('dragover', (e) => e.preventDefault())
    previewContainer.addEventListener('drop', (e) => e.preventDefault())
  }

  const textarea = document.getElementById('msg')
  if (textarea) {
    function autoResize() {
      textarea.style.height = 'auto'
      const newHeight = Math.min(textarea.scrollHeight, 132)
      textarea.style.height = `${newHeight}px`
      textarea.style.overflowY = newHeight >= 132 ? 'auto' : 'hidden'
    }

    textarea.addEventListener('input', autoResize)
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault()
        const start = this.selectionStart
        const end = this.selectionEnd
        this.value =
          this.value.substring(0, start) + '\n' + this.value.substring(end)
        this.selectionStart = this.selectionEnd = start + 1
        autoResize()
      }
    })
  }
}

installAiPageDomBootstrap()
