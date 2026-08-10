function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

export function createComposerController({ query, onImageReadError }) {
  let currentImageDataUrl = ''

  function updateImagePreview() {
    const box = query('imagePreviewContainer')
    const img = query('imagePreviewImg')
    if (!box || !img) return

    if (!currentImageDataUrl) {
      box.style.display = 'none'
      img.src = ''
      return
    }

    box.style.display = 'flex'
    img.src = currentImageDataUrl
  }

  function clearImageInput() {
    currentImageDataUrl = ''
    const input = query('imageFileInput')
    if (input) input.value = ''
    updateImagePreview()
  }

  function buildMessagesForApi(currentConv) {
    const list = currentConv.messages
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }))
    if (!currentImageDataUrl || list.length === 0) return list

    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].role !== 'user') continue
      const text = String(list[i].content || '').trim()
      const parts = []
      if (text) parts.push({ type: 'text', text })
      parts.push({ type: 'image_url', image_url: { url: currentImageDataUrl } })
      list[i] = { role: 'user', content: parts }
      break
    }
    return list
  }

  async function onFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      currentImageDataUrl = await readFileAsDataUrl(file)
      updateImagePreview()
    } catch (err) {
      currentImageDataUrl = ''
      updateImagePreview()
      if (typeof onImageReadError === 'function') {
        onImageReadError(err)
      }
    }
  }

  function bindComposerEvents() {
    const uploadBtn = query('uploadImageBtn')
    const imageInput = query('imageFileInput')
    const clearImageBtn = query('clearImageBtn')

    uploadBtn?.addEventListener('click', () => imageInput?.click())
    clearImageBtn?.addEventListener('click', clearImageInput)
    imageInput?.addEventListener('change', onFileChange)
  }

  return {
    bindComposerEvents,
    updateImagePreview,
    clearImageInput,
    buildMessagesForApi,
    getCurrentImageDataUrl: () => currentImageDataUrl,
  }
}
