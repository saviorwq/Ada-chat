/**
 * 精简版 DOM 外壳（布局与 AI.php 一致：记录区在上，输入与参数在下）
 * Slim app shell markup (layout mirrors AI.php)
 */

export function getAppShellHtml() {
  return `
    <div class="app">
        <aside class="sidebar">
            <div class="sidebar-header">
                <button class="new-chat-btn" id="newChatBtn">➕ 新建对话</button>
            </div>
            <div class="chat-list" id="chat-list"></div>
        </aside>
        <main class="main">
            <div id="log" class="log-container"></div>
            <div class="input-area">
                <div id="imagePreviewContainer" class="preview-container">
                  <img id="imagePreviewImg" alt="preview" />
                  <button id="clearImageBtn" class="btn-mini" type="button">移除图片</button>
                </div>
                <div class="input-row">
                  <textarea id="msg" class="message-input" rows="3" placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"></textarea>
                </div>
                <div class="controls-bar controls-bar--bottom">
                <select id="modelSelect" class="select-mini" title="聊天模型"></select>
                <button id="refreshModelsBtn" class="btn-mini" type="button">刷新模型</button>
                <label class="route-toggle-mini" title="自动检测输入意图并选择分类模型">
                  <input id="intentRouteEnabled" type="checkbox">
                  自动路由
                </label>
                <label class="route-toggle-mini" title="命中自动路由时显示顶部提示">
                  <input id="routeToastEnabled" type="checkbox">
                  路由提示
                </label>
                <input id="samplingTemperature" class="input-mini" type="number" step="0.1" min="0" max="2" placeholder="temp" title="temperature">
                <input id="samplingTopP" class="input-mini" type="number" step="0.05" min="0" max="1" placeholder="top_p" title="top_p">
                <input id="samplingMaxTokens" class="input-mini" type="number" min="1" placeholder="max_tokens" title="max_tokens (optional)">
                <input id="samplingPresencePenalty" class="input-mini" type="number" step="0.1" min="-2" max="2" placeholder="presence" title="presence_penalty">
                <input id="samplingFrequencyPenalty" class="input-mini" type="number" step="0.1" min="-2" max="2" placeholder="frequency" title="frequency_penalty">
                <select id="routeModelCode" class="select-mini" title="代码默认模型"></select>
                <select id="routeModelImage" class="select-mini" title="文生图默认模型"></select>
                <select id="routeModelVision" class="select-mini" title="识图默认模型"></select>
                <select id="routeModelOcr" class="select-mini" title="OCR 默认模型"></select>
                <select id="routeModelTranslation" class="select-mini" title="翻译默认模型"></select>
                <span id="routeStatusBadge" class="route-status-badge is-idle">Route: chat</span>
                <span id="routeHistory" class="hint-mini">最近命中: -</span>
                </div>
                <div class="composer-row composer-row--actions">
                  <input id="imageFileInput" type="file" accept="image/*" hidden />
                  <button id="uploadImageBtn" class="btn-mini" type="button">上传图片</button>
                  <button id="sendBtn" class="btn-mini btn-mini--send">发送</button>
                </div>
            </div>
        </main>
    </div>
  `
}

/** @param {HTMLElement | null} root */
export function mountAppShell(root) {
  if (!root) return
  root.innerHTML = getAppShellHtml()
}
