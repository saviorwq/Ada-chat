/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
// Help/support modal rendering extracted from script.js

function renderInlineMd(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    return html;
}

function markdownToHtml(md) {
    const lines = String(md || '').split(/\r?\n/);
    let html = '';
    let inList = false;
    let inCode = false;
    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (line.startsWith('```')) {
            if (!inCode) {
                if (inList) { html += '</ul>'; inList = false; }
                html += '<pre><code>';
                inCode = true;
            } else {
                html += '</code></pre>';
                inCode = false;
            }
            continue;
        }
        if (inCode) {
            html += `${escapeHtml(rawLine)}\n`;
            continue;
        }
        const t = line.trim();
        if (!t) {
            if (inList) { html += '</ul>'; inList = false; }
            continue;
        }
        if (t.startsWith('## ')) {
            if (inList) { html += '</ul>'; inList = false; }
            html += `<h3>${renderInlineMd(t.slice(3))}</h3>`;
            continue;
        }
        if (t.startsWith('### ')) {
            if (inList) { html += '</ul>'; inList = false; }
            html += `<h4>${renderInlineMd(t.slice(4))}</h4>`;
            continue;
        }
        if (t.startsWith('- ')) {
            if (!inList) { html += '<ul>'; inList = true; }
            html += `<li>${renderInlineMd(t.slice(2))}</li>`;
            continue;
        }
        if (inList) { html += '</ul>'; inList = false; }
        html += `<p>${renderInlineMd(t)}</p>`;
    }
    if (inList) html += '</ul>';
    if (inCode) html += '</code></pre>';
    return html;
}

function getHelpMarkdown() {
    if (currentLanguage === 'zh') {
        return `
## 模块使用说明

### 1) 对话与输入
- 输入消息后按 \`Enter\` 发送，\`Ctrl+Enter\` 换行。
- 上传图片后输入框显示 \`[图片]\`，聊天历史显示图片预览。
- 支持任务分类：对话、编程、图像、视频、OCR、图像理解、翻译。

### 2) 供应商与模型
- 设置 -> 新增供应商：填写 \`Base URL\`、\`API Key\`、各接口路径。
- 在供应商编辑页点击“获取最新模型”，勾选后保存。
- 模型类型管理中给模型分配类别，否则前台无法按分类筛选。

### 3) 自动切换与预设
- 自动切换可在模型限流时切到下一个候选模型。
- 预设管理：系统预设用于聊天，角色预设用于图像任务。
- 文生图单词转换可把短词扩展成完整 Prompt。

### 4) 聊天身份与皮肤
- 聊天身份可修改玩家/AI 昵称、头像 URL、AI 对玩家称呼。
- 皮肤模式支持浅色、深色和自定义主题。

### 5) 调试模式
- 可导出脱敏日志，支持命令：\`help\`、\`stats\`、\`diag\`、\`route\`。
- 问题排查建议先执行 \`diag 120\` 后再导出日志。
`;
    }
    return `
## Module Guide

### 1) Chat Input
- Press \`Enter\` to send, \`Ctrl+Enter\` for newline.
- After upload, input shows \`[image]\` while chat history renders image preview.
- Task categories: chat, coding, image, video, OCR, vision, translation.

### 2) Providers & Models
- Settings -> Add Provider: configure \`Base URL\`, \`API Key\`, and paths.
- Fetch models, then check and save.
- Assign model types in Model Type Manager for category filtering.

### 3) Auto Switch & Presets
- Auto-switch changes model when rate-limited.
- System presets for chat; role presets for image tasks.
- Word conversion expands short prompts for image generation.

### 4) Profiles & Skin
- Configure player/AI names, avatar URLs, and AI user addressing.
- Skin mode supports light, dark, and custom themes.

### 5) Debug Mode
- Export redacted logs; commands include \`help\`, \`stats\`, \`diag\`, \`route\`.
- Run \`diag 120\` first when reporting issues.
`;
}

function openHelpModal() {
    const modal = $('helpModal');
    const content = $('helpContent');
    if (!modal || !content) return;
    content.innerHTML = markdownToHtml(getHelpMarkdown());
    modal.classList.add('show-floating');
}

function closeHelpModal() {
    const modal = $('helpModal');
    if (!modal) return;
    modal.classList.remove('show-floating');
}

function openSupportModal() {
    const modal = $('supportModal');
    if (!modal) return;
    modal.style.display = 'flex';
}

function closeSupportModal() {
    const modal = $('supportModal');
    if (!modal) return;
    modal.style.display = 'none';
}

function initHelpWindowDrag() {
    const header = $('helpDragHeader');
    const win = $('helpWindow');
    if (!header || !win) return;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener('mousedown', (e) => {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = win.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const left = Math.max(0, startLeft + (e.clientX - startX));
        const top = Math.max(0, startTop + (e.clientY - startY));
        win.style.left = `${left}px`;
        win.style.top = `${top}px`;
    });

    window.addEventListener('mouseup', () => {
        dragging = false;
    });
}
