/* Ada Chat mode capability registry */
(function() {
    const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif';
    const OCR_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.pdf';

    const modeMap = {
        chat: {
            isChatLike: true,
            uploadAccept: IMAGE_ACCEPT
        },
        code: {
            isChatLike: true,
            uploadAccept: IMAGE_ACCEPT
        },
        image: {
            isChatLike: false,
            uploadAccept: ''
        },
        video: {
            isChatLike: false,
            uploadAccept: IMAGE_ACCEPT
        },
        ocr: {
            isChatLike: true,
            uploadAccept: OCR_ACCEPT,
            requiresImageOrPdf: true,
            defaultText: '请识别这张图片中的所有文字，按原始排版输出。',
            systemPrompt: '你是一个专业的文字识别(OCR)助手。请准确识别用户上传图片中的所有文字内容，严格按照原始排版格式输出，不要遗漏任何文字，不要添加额外解释。'
        },
        vision: {
            isChatLike: true,
            uploadAccept: IMAGE_ACCEPT,
            requiresImage: true,
            defaultText: '请详细分析这张图片的内容。',
            systemPrompt: '你是一个专业的图像分析助手，擅长视觉理解。根据用户的指令分析上传的图片。你可以：分析服装穿搭与造型风格、描述场景与物体、解读图表数据、鉴别物品、评估设计等。请给出准确、详细且有条理的分析结果。'
        },
        translation: {
            isChatLike: true,
            uploadAccept: IMAGE_ACCEPT,
            allowTextOnly: true,
            defaultText: '请翻译这张图片中的所有文字。',
            systemPrompt: '你是一个专业翻译助手。请将用户提供的文本翻译为目标语言。如果用户没有指定目标语言：中文内容翻译为英文，其他语言翻译为中文。保持原文的格式和语气，翻译要自然流畅。如果用户上传了图片，请先识别图中文字再进行翻译。'
        }
    };

    function getUploadAccept(mode, imageMode) {
        if (mode === 'image') {
            return imageMode === 'img2img' ? IMAGE_ACCEPT : '';
        }
        return modeMap[mode]?.uploadAccept || IMAGE_ACCEPT;
    }

    window.AdaChatModeConfig = {
        IMAGE_ACCEPT,
        OCR_ACCEPT,
        modeMap,
        getUploadAccept
    };
})();
