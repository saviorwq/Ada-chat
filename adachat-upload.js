/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
// Upload, drag-drop and PDF preprocessing extracted from script.js

const UPLOAD_MODE_CONFIG = window.AdaChatModeConfig || {};
const UPLOAD_IMAGE_ACCEPT = UPLOAD_MODE_CONFIG.IMAGE_ACCEPT || '.jpg,.jpeg,.png,.webp,.gif';
const UPLOAD_OCR_ACCEPT = UPLOAD_MODE_CONFIG.OCR_ACCEPT || '.jpg,.jpeg,.png,.webp,.gif,.pdf';

function getUploadAcceptByMode(category, imageMode) {
    if (UPLOAD_MODE_CONFIG.getUploadAccept) {
        return UPLOAD_MODE_CONFIG.getUploadAccept(category, imageMode);
    }
    if (category === 'ocr') return UPLOAD_OCR_ACCEPT;
    if (category === 'vision') return UPLOAD_IMAGE_ACCEPT;
    if (category === 'translation') return UPLOAD_IMAGE_ACCEPT;
    if (category === 'image') return imageMode === 'img2img' ? UPLOAD_IMAGE_ACCEPT : '';
    return UPLOAD_IMAGE_ACCEPT;
}

function updateUploadAcceptByMode(category, imageMode) {
    const fileInput = $('file-input');
    const uploadBtn = document.querySelector('.upload-btn');
    if (!fileInput) return;
    const accept = getUploadAcceptByMode(category || $('category')?.value, imageMode || $('imageMode')?.value);
    fileInput.accept = accept;
    if (uploadBtn) {
        uploadBtn.title = accept ? `支持格式: ${accept}` : '当前模式无需上传文件';
    }
}

function isFileAcceptedByMode(file, accept) {
    if (!accept || !file) return false;
    const fileName = String(file.name || '').toLowerCase();
    const mime = String(file.type || '').toLowerCase();
    return accept.split(',').map(s => s.trim().toLowerCase()).some(rule => {
        if (!rule) return false;
        if (rule.startsWith('.')) return fileName.endsWith(rule);
        if (rule.endsWith('/*')) return mime.startsWith(rule.slice(0, -1));
        return mime === rule;
    });
}

function isPdfFile(fileOrMeta) {
    const name = String(fileOrMeta?.name || '').toLowerCase();
    const mime = String(fileOrMeta?.type || '').toLowerCase();
    return name.endsWith('.pdf') || mime === 'application/pdf';
}

async function ensurePdfJsLib() {
    if (window.__pdfjsLibCached) return window.__pdfjsLibCached;
    const mod = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs');
    const lib = mod?.default || mod;
    if (!lib?.getDocument) {
        throw new Error('pdf.js 初始化失败');
    }
    window.__pdfjsLibCached = lib;
    return lib;
}

async function extractTextFromPdf(file) {
    const pdfjsLib = await ensurePdfJsLib();
    if (!pdfjsLib) throw new Error('pdf.js 加载失败');
    if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';
    }
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages || 0;
    let textParts = [];
    for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = (textContent.items || []).map(it => it.str || '').join(' ').trim();
        if (pageText) {
            textParts.push(`--- 第 ${i} 页 ---\n${pageText}`);
        }
    }
    const merged = textParts.join('\n\n').trim();
    return {
        text: merged,
        pageCount
    };
}

async function extractPdfPageImages(file, options = {}) {
    const pdfjsLib = await ensurePdfJsLib();
    if (!pdfjsLib) throw new Error('pdf.js 加载失败');
    if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';
    }
    const maxPages = Number(options.maxPages || 5);
    const targetScale = Number(options.scale || 1.3);
    const maxDim = Number(options.maxDimension || 1400);

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages || 0;
    const endPage = Math.min(pageCount, maxPages);
    const images = [];

    for (let i = 1; i <= endPage; i++) {
        const page = await pdf.getPage(i);
        let viewport = page.getViewport({ scale: targetScale });
        const maxSide = Math.max(viewport.width, viewport.height);
        if (maxSide > maxDim) {
            const ratio = maxDim / maxSide;
            viewport = page.getViewport({ scale: Math.max(0.5, targetScale * ratio) });
        }
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await page.render({ canvasContext: ctx, viewport }).promise;
        images.push(canvas.toDataURL('image/jpeg', 0.82));
    }

    return {
        images,
        pageCount,
        renderedPages: endPage
    };
}

function initDragAndDrop() {
    const dropZone = $('dropZone');
    if (!dropZone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    dropZone.addEventListener('drop', handleDrop, false);
}

function handleDrop(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        const category = $('category')?.value;
        const imageMode = $('imageMode')?.value;
        const accept = getUploadAcceptByMode(category, imageMode);
        if (!isFileAcceptedByMode(file, accept)) {
            alert(`当前模式不支持该文件格式。支持：${accept || '无'}`);
            return;
        }
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        $('file-input').files = dataTransfer.files;
        previewAndCompress();
    }
}

function ensureImageMarkerInInput() {
    const msgInput = $('msg');
    if (!msgInput) return;
    const marker = '[图片]';
    if (!msgInput.value.includes(marker)) {
        msgInput.value = `${msgInput.value}${msgInput.value ? ' ' : ''}${marker}`.trim();
    }
}

function removeImageMarkerFromInput() {
    const msgInput = $('msg');
    if (!msgInput) return;
    msgInput.value = msgInput.value.replace(/\s*\[图片\]\s*/g, ' ').trim();
}

function ensureFileMarkerInInput(fileName) {
    const msgInput = $('msg');
    if (!msgInput) return;
    const marker = `[文件:${fileName}]`;
    msgInput.value = msgInput.value.replace(/\s*\[文件:[^\]]+\]\s*/g, ' ').trim();
    if (!msgInput.value.includes(marker)) {
        msgInput.value = `${msgInput.value}${msgInput.value ? ' ' : ''}${marker}`.trim();
    }
}

function removeFileMarkerFromInput() {
    const msgInput = $('msg');
    if (!msgInput) return;
    msgInput.value = msgInput.value.replace(/\s*\[文件:[^\]]+\]\s*/g, ' ').trim();
}

function previewAndCompress() {
    const file = $('file-input').files[0];
    if (!file) return;
    const category = $('category')?.value;
    const imageMode = $('imageMode')?.value;
    const accept = getUploadAcceptByMode(category, imageMode);
    if (!isFileAcceptedByMode(file, accept)) {
        alert(`当前模式不支持该文件格式。支持：${accept || '无'}`);
        return;
    }

    window.currentUploadMeta = {
        name: file.name,
        type: file.type,
        isImage: file.type.startsWith('image/'),
        isPdf: isPdfFile(file)
    };

    if (!file.type.startsWith('image/')) {
        if (typeof window.currentBase64 !== 'undefined') {
            window.currentBase64 = "";
        }
        window.currentPdfPageImages = [];
        removeImageMarkerFromInput();
        ensureFileMarkerInInput(file.name);
        if (window.currentUploadMeta.isPdf) {
            window.currentPdfText = '';
            extractTextFromPdf(file).then(({ text, pageCount }) => {
                if (!text) {
                    alert(`PDF 已选择：${file.name}，但未提取到可识别文本（可能是扫描版）。`);
                    window.currentPdfText = '';
                    return;
                }
                window.currentPdfText = text.slice(0, 20000);
                window.currentPdfPageImages = [];
                alert(`PDF 已解析：${file.name}（${pageCount} 页，可用于 OCR/翻译）`);
            }).catch((e) => {
                window.currentPdfText = '';
                window.currentPdfPageImages = [];
                alert(`PDF 解析失败：${e.message || e}`);
            });
        } else {
            window.currentPdfText = '';
            window.currentPdfPageImages = [];
            alert(`已选择文件：${file.name}`);
        }
        return;
    }
    window.currentPdfText = '';
    window.currentPdfPageImages = [];
    removeFileMarkerFromInput();

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.src = e.target.result;
        img.onload = function() {
            const maxSizeMB = 1;
            const maxSizeBytes = maxSizeMB * 1024 * 1024;
            let quality = 0.9;
            let canvas = document.createElement('canvas');
            let ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            while (compressedDataUrl.length > maxSizeBytes * 1.37 && quality > 0.1) {
                quality -= 0.1;
                compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            }
            window.currentBase64 = compressedDataUrl;
            ensureImageMarkerInInput();
            console.log('压缩后大小约', Math.round(compressedDataUrl.length / 1.37), 'bytes');
        };
    };
    reader.readAsDataURL(file);
}
