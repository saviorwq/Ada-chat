import {
  getAllModels,
  getRouteDefaultModel,
  isRouteEnabled,
  modelsByCategory,
} from './settings.js'

const INTENT_PATTERNS = [
  {
    category: 'ocr',
    confidence: 'high',
    regex:
      /(ocr|识别文字|提取文字|图中文字|图片文字|文字识别|extract text from image)/i,
  },
  {
    category: 'image',
    confidence: 'high',
    regex:
      /(画图|出图|绘图|生成图片|生成图像|文生图|draw (an|a)? image|generate image|illustration|render image)/i,
  },
  {
    category: 'translation',
    confidence: 'high',
    regex: /(翻译|中译英|英译中|translate( to)?|translation)/i,
  },
  {
    category: 'code',
    confidence: 'high',
    regex:
      /(代码|写代码|编程|脚本|调试|debug|bug|报错|stack trace|function|class|python|javascript|typescript|java|c\+\+|golang|sql)/i,
  },
  {
    category: 'vision',
    confidence: 'medium',
    regex:
      /(看图|分析图片|图里有什么|image analysis|describe image|what is in the image)/i,
  },
]

function firstModelValueOfCategory(category) {
  const rows = modelsByCategory(category)
  return String(rows[0]?.value || '')
}

function resolveModelForCategory(category, fallbackModel) {
  const bound = getRouteDefaultModel(category)
  if (bound) {
    const hit = getAllModels().some((m) => String(m.value) === bound)
    if (hit) return bound
  }

  const auto = firstModelValueOfCategory(category)
  return auto || fallbackModel
}

export function detectIntentRoute(text) {
  const input = String(text || '')
  for (const rule of INTENT_PATTERNS) {
    if (rule.regex.test(input)) {
      return {
        hit: true,
        category: rule.category,
        confidence: rule.confidence,
      }
    }
  }
  return {
    hit: false,
    category: 'chat',
    confidence: 'none',
  }
}

export function resolveRequestRoute({ text, fallbackModel, hasImage = false }) {
  if (!isRouteEnabled()) {
    return {
      category: 'chat',
      task: 'chat',
      model: fallbackModel,
      mode: null,
      routed: false,
      note: '自动路由未启用',
    }
  }

  const intent = detectIntentRoute(text)

  if (hasImage) {
    if (intent.hit && intent.category === 'image') {
      const imageModel = resolveModelForCategory('image', fallbackModel)
      if (imageModel) {
        return {
          category: 'image',
          task: 'image',
          model: imageModel,
          mode: 'img2img',
          routed: true,
          note: '自动路由 -> image (img2img)',
        }
      }
    }

    const visionModel = resolveModelForCategory('vision', fallbackModel)
    if (visionModel) {
      return {
        category: 'vision',
        task: 'chat',
        model: visionModel,
        mode: null,
        routed: true,
        note: '自动路由 -> vision (image+chat)',
      }
    }
  }

  if (!intent.hit) {
    return {
      category: 'chat',
      task: 'chat',
      model: fallbackModel,
      mode: null,
      routed: false,
      note: '未命中路由规则',
    }
  }

  const resolvedModel = resolveModelForCategory(intent.category, fallbackModel)
  if (!resolvedModel) {
    return {
      category: 'chat',
      task: 'chat',
      model: fallbackModel,
      mode: null,
      routed: false,
      note: `命中 ${intent.category} 但无可用模型，回退 chat`,
    }
  }

  const task = intent.category === 'image' ? 'image' : 'chat'
  const mode = intent.category === 'image' ? 'text2img' : null

  return {
    category: intent.category,
    task,
    model: resolvedModel,
    mode,
    routed: true,
    note: `自动路由 -> ${intent.category} (${intent.confidence})`,
  }
}

export function extractAssistantTextFromJson(payload) {
  const parsed = extractAssistantPayloadFromJson(payload)
  return parsed.text
}

function pickFirstImageUrl(payload) {
  const urlCandidates = [
    payload?.data?.[0]?.url,
    payload?.images?.[0],
    payload?.image,
    payload?.output?.[0]?.url,
  ]
  const hit = urlCandidates.find((v) => typeof v === 'string' && v.trim())
  return hit ? String(hit).trim() : ''
}

function pickFirstImageBase64(payload) {
  const b64Candidates = [
    payload?.data?.[0]?.b64_json,
    payload?.images?.[0]?.b64_json,
  ]
  const hit = b64Candidates.find((v) => typeof v === 'string' && v.trim())
  return hit ? `data:image/png;base64,${String(hit).trim()}` : ''
}

export function extractAssistantPayloadFromJson(payload) {
  if (!payload || typeof payload !== 'object') {
    return { text: '', imageUrl: '', imageDataUrl: '' }
  }

  const direct =
    payload?.choices?.[0]?.message?.content ||
    payload?.choices?.[0]?.delta?.content ||
    payload?.output_text ||
    ''
  const directText = typeof direct === 'string' ? direct.trim() : ''

  const imageUrl = pickFirstImageUrl(payload)
  const imageDataUrl = imageUrl ? '' : pickFirstImageBase64(payload)

  if (directText) {
    return { text: directText, imageUrl, imageDataUrl }
  }

  if (imageUrl) {
    return { text: '已生成图片', imageUrl, imageDataUrl: '' }
  }

  if (imageDataUrl) {
    return { text: '已生成图片', imageUrl: '', imageDataUrl }
  }

  return { text: '[未识别的响应格式]', imageUrl: '', imageDataUrl: '' }
}
