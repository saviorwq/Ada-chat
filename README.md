<p align="center">
  <img src="https://img.shields.io/badge/Ada%20Chat-v1.2.0-10b981?style=for-the-badge&logo=openai&logoColor=white" alt="Ada Chat v1.2.0">
  <img src="https://img.shields.io/badge/PHP-8.0+-777BB4?style=for-the-badge&logo=php&logoColor=white" alt="PHP 8.0+">
  <img src="https://img.shields.io/badge/License-GPL%20v3-blue?style=for-the-badge" alt="GPL v3 License">
</p>

<h1 align="center">🤖 Ada Chat</h1>
<p align="center"><strong>自托管 AI 工作台 · Self-hosted AI Workspace</strong></p>
<p align="center">聊天、创作、知识库、本地模型一处完成；CYOA 是创作侧的差异化能力<br>Chat, create, knowledge, and local models in one place — CYOA as the creative differentiator</p>
<p align="center">
  <a href="https://github.com/saviorwq/Ada-chat/releases/tag/v1.2.0">下载 v1.2.0 / Download</a>
  ·
  <a href="RELEASE_NOTES_v1.2.0.md">发布说明 / Release Notes</a>
</p>

---

## ✨ 功能亮点 / Features

### 🆕 v1.2.0 更新 / What's New in v1.2.0
- 前端全面迁移为 **Vite 生产单包**（`dist/`），根目录 legacy `adachat-*.js` 已移除
- 新增本地 **Image Runtime（Diffusers）**：扫描本地模型、Intel Arc **XPU** 文生图；提示词改为用户描述优先
- Windows：**系统托盘**启停（`AdaChatTray`）、中文启动/停止脚本；可启停本地 Vulkan llama
- 后端模块化（`backend/`）与 CI/工程化补齐；安装包 `AdaChat_Setup_v1.2.0.exe`
- 详见 [RELEASE_NOTES_v1.2.0.md](RELEASE_NOTES_v1.2.0.md)

### 🆕 v1.0.6 更新 / What's New in v1.0.6
- 新增 **模型总设置**：集中配置聊天模型参数（超时、`temperature`、`top_p`、`max_tokens`、`presence_penalty`、`frequency_penalty`、`stop`）
- 修复 **上下文记忆链路**：聊天请求重新正确拼接历史轮次，避免“AI 回答一轮就失忆”
- 参数透传全链路打通：前端设置值写入请求体，代理层按范围校验后转发给上游
- 设置命名与信息架构优化：`超时设置` 升级为 `模型总设置`，后续模型参数统一在此扩展
- Wiki 同步新增小白说明：解释每个模型参数作用、推荐起步值与常见误区

### 🆕 v1.0.5 更新 / What's New in v1.0.5
- 前端核心完成 **模块化拆分**：逻辑在 **`src/`** 中（完整入口 **`src/full-app-entry.js`**、精简 **`src/slim/`**），经 **Vite** 打入 **`dist/`**，`AI.php` 仅注入单包（原根目录 **`adachat-*.js`** 与 legacy shim 已移除）
- 新增多个独立模块（现为源码模块，不再以根目录 IIFE 分发）：i18n、upload、rag、provider-models、settings-ui、auto-switch、help-ui 等
- **`npm run build`** 为部署完整版 **必需**；未构建时 `AI.php` 会提示先构建
- 供应商/模型管理、自动切换、帮助中心、皮肤与语言、预设与词转换等能力全部保持兼容
- 打包配置升级到 `v1.0.5`，安装器将包含新拆分模块文件

### 🆕 v1.0.4 更新 / What's New in v1.0.4
- 新增 **消息操作扩展**：助手消息支持复制与重回答，重点内容可更快二次利用
- 优化 **重回答链路**：文生图支持重回答并自动清理历史图像状态，避免上下文污染
- 加固 **插件运行时防护**：钩子白名单、钩子超时、异常插件自动熔断禁用
- 加固 **插件加载安全**：插件目录与资产文件名严格校验，阻断路径穿越类风险
- 升级 **网关绕过策略控制**：`bypassCostOptimizer` 改为显式开关 + 客户端白名单机制
- 完善文档与 Wiki：补充插件安全基线与 1.0.4 发布说明

### 🆕 v1.0.2 更新 / What's New in v1.0.2
- 新增 **帮助中心**（支持富文本渲染、可拖动、可缩放，不阻塞主界面操作）
- 新增 **聊天身份设置**：玩家昵称、AI 昵称、双方头像、AI 对玩家称呼
- 新增 **皮肤模式**：浅色 / 深色 / 自定义配色
- 扩展语言支持：在中英基础上新增 **Spanish / Japanese**（缺失词条自动回退 English）
- 修复图片输入显示逻辑：输入栏显示 `[图片]`，聊天历史显示图片预览
- Added draggable/resizable Help Center, chat profiles, skin themes, more languages, and image-preview fixes

### 🔌 多供应商聚合 / Multi-Provider Aggregation
- 支持同时接入 **OpenRouter、硅基流动 (SiliconFlow)、OpenAI、DeepSeek、Together AI** 等任意 OpenAI 兼容 API
- 每个供应商独立配置 API 地址、密钥、路径
- 一键获取远程模型列表，勾选启用
- Support multiple providers simultaneously: **OpenRouter, SiliconFlow, OpenAI, DeepSeek, Together AI**, and any OpenAI-compatible API
- Independent configuration for each provider (base URL, API key, paths)
- One-click fetch & enable remote model lists

### 🎨 七大任务类别 / Seven Task Categories

| 类别 Category | 图标 | 说明 Description |
|:---|:---:|:---|
| **对话 Chat** | 💬 | 通用 AI 对话，支持上下文历史 / General conversation with context history |
| **编程 Code** | 💻 | 编程助手，代码生成与分析 / Code generation, analysis & debugging |
| **图像生成 Image** | 🎨 | 文生图 (Text-to-Image) / 图生图 (Image-to-Image) |
| **视频生成 Video** | 🎬 | AI 视频生成 / AI video generation |
| **文字识别 OCR** | 📄 | 上传图片提取文字，保留原始排版 / Extract text from images |
| **图像理解 Vision** | 👁️ | 图片分析：穿搭、场景、图表等 / Image analysis: outfits, scenes, charts |
| **翻译 Translation** | 🌐 | 多语言翻译，支持图片文字翻译 / Multilingual translation, image text supported |

### 🧭 模式能力矩阵 / Mode Capability Matrix

| 模式 Mode | 上传格式 Upload Formats | 处理方式 Processing |
|:---|:---|:---|
| **Chat / Code** | `.jpg .jpeg .png .webp .gif` | 可附图对话 / Optional image-augmented chat |
| **Image (Text-to-Image)** | 无需上传 / No upload required | 文本生成图片 |
| **Image (Image-to-Image)** | `.jpg .jpeg .png .webp .gif` | 上传图片后图生图 |
| **OCR** | `.jpg .jpeg .png .webp .gif .pdf` | 图片直连 OCR；PDF 先提取文字，若无文字层则按扫描件渲染前 **5** 页做识别 |
| **Vision** | `.jpg .jpeg .png .webp .gif` | 图像理解分析 |
| **Translation** | `.jpg .jpeg .png .webp .gif`（文本可直接输入） | 支持文本翻译与图片文字翻译；PDF 路径同 OCR |

### 🔄 智能模型管理 / Smart Model Management
- **模型类型分类**：为每个模型指定类型（对话/编程/图像/视频/OCR/图像理解/翻译），选择类别时自动筛选对应模型
- **自动切换**：模型达到频率限制时自动切换到下一个可用模型，支持拖拽排序优先级
- **Model Type Classification**: Assign types to models (chat/code/image/video/OCR/vision/translation); auto-filter when switching categories
- **Auto-switch**: Automatically switch to next available model on rate limit; drag-and-drop priority ordering

### 💰 成本优化引擎 / Cost Optimization Engine
- **滑动窗口 (Sliding Window)**：自动裁剪长对话历史，保留开头锚点 + 结尾记忆
- **智能模型路由**：简单问题自动路由到廉价模型
- **回复压缩**：注入简洁指令减少 AI 废话
- **KV 缓存**：相同问题零成本零延迟返回
- **智能 max_tokens**：根据输入长度自动设置输出上限
- **System Prompt 压缩**：去除冗余空白和注释
- Sliding Window, Model Routing, Output Compression, Response Cache, Smart max_tokens, Prompt Compression

### 📚 预设系统 / Preset System
- **系统预设**：为对话设置全局 System Prompt
- **角色预设**：为图像生成设置风格前缀
- 多预设管理，一键切换激活
- System presets for chat, role presets for image generation, easy management & switching

### 🧩 插件架构 / Plugin System
- 热加载插件：放入 `plugins/` 目录自动识别
- 每个插件有独立的服务端存储 (`PluginStorage` API)
- 运行时钩子：`beforeBuildRequest`、`beforeSend`、`afterResponse`
- 设置面板内可启用/禁用插件
- 新插件首次默认禁用，需用户手动启用
- Hot-reload plugins from `plugins/` directory
- Server-side storage per plugin via `PluginStorage` API
- Runtime hooks: `beforeBuildRequest`, `beforeSend`, `afterResponse`
- New plugins are disabled by default until explicitly enabled

### 🔒 安全特性 / Security
- Session 鉴权保护所有 API 端点 / Session authentication on all endpoints
- CSRF Token 防护所有 POST 请求 / CSRF token protection for all POST requests
- XSS 防护：用户消息使用 `textContent` 安全渲染 / XSS-safe rendering via `textContent`
- 安全 HTTP 头：`X-Content-Type-Options`、`X-Frame-Options`、`X-XSS-Protection` / Secure HTTP headers
- API Key 服务端存储，前端不暴露 / Server-side API key storage
- HTTPS 自动启用 Secure Cookie / Auto-enable Secure Cookie over HTTPS
- `ai_data/` 目录 `.htaccess` 保护 / `.htaccess` protection for data directory

### 🛡️ 插件安全基线 / Plugin Security Baseline
- 插件 ID 需通过格式校验，重复注册会被拒绝
- 非白名单钩子将被忽略，避免隐式扩权
- 每次钩子执行带超时保护，防止阻塞主流程
- 连续异常插件会自动禁用，降低运行期风险
- 插件元信息在管理面板做 HTML 转义，避免注入型展示攻击
- 插件资产加载走目录边界检查（含 `realpath` 与文件名规则）

### 🌐 多语言 / Internationalization
- 中文 / English 双语界面，一键切换
- 新增 Spanish / Japanese，缺失词条自动回退 English
- UI now supports Chinese / English / Spanish / Japanese with English fallback

---

## 📁 目录结构 / Directory Structure

```
AdaChat-Release/
├── AI.php                 # 主入口页面 / Main entry page
├── vchat.php              # Vite 精简版入口（需 dist/）/ Slim Vite UI entry
├── ai_proxy.php           # AI API 网关 / AI API gateway
├── ai_config.php          # 配置入口（实现见 backend/config/ai_config.php）/ Config shim
├── cost_optimizer.php     # 成本优化引擎 / Cost optimization engine
├── api.php                # 插件数据 API / Plugin data API
├── login.php              # 登录页面 / Login page
├── router.php             # 内置 PHP 服务器路由 shim / Built-in PHP server router shim
├── vite-manifest.php      # Vite manifest 读取 shim（实现见 backend/vite/manifest.php）
├── backend/               # PHP 模块化实现；根薄入口控制器见 backend/entrypoints/（含 README）/ Modular PHP backend; thin entrypoints + README
├── src/full-app-entry.js  # 完整版 Vite ESM 入口 → dist/ Full-app entry
├── src/slim/main.js       # 精简版 Vite 入口（index.html）/ Slim entry
├── src/                   # 前端源码（模块化）/ Frontend source
├── dist/                  # npm run build 产出（AI.php 依赖）/ Build output (required)
├── style.css              # 全局样式 / Global styles
├── .gitignore             # Git 忽略规则 / Git ignore rules
├── ai_data/               # 数据存储目录 / Data storage (auto-created)
│   ├── .htaccess          # 禁止 Web 直接访问 / Deny direct web access
│   ├── providers.json     # 供应商配置 / Provider configs
│   ├── cost_settings.json # 优化设置 / Optimization settings
│   └── kv_cache/          # 回复缓存 / Response cache
├── plugins/               # 插件目录 / Plugins directory
│   └── index.json         # 插件注册表 / Plugin registry
└── ssl/                   # SSL 证书 / SSL certificates (Windows)
    └── cacert.pem         # 需手动下载 / Download manually
```

> **根目录 PHP 薄入口**：`ai_proxy.php`、`api.php`、`cost_optimizer.php` 等对应实现集中在 **`backend/entrypoints/`**，约定与例外见 **`backend/entrypoints/README.md`**。  
> **Thin PHP entrypoints**: `ai_proxy.php` / `api.php` / `cost_optimizer.php` map to **`backend/entrypoints/`** — see **`backend/entrypoints/README.md`**.

---

## 🚀 部署指南 / Deployment

### 系统要求 / Requirements

- PHP 8.0+ (with `curl`, `json`, `mbstring` extensions)
- Apache / Nginx / 任意支持 PHP 的 Web 服务器
- 推荐 HTTPS（保护 API Key 传输）

### Windows 绿色免安装与托盘 / Portable folder & tray (Windows)

- 将整个安装目录**复制到任意路径**（含 `php/`、`dist/`、`AdaChatTray.bat` 等）即可运行，**不必**重复安装。
- 双击 **`AdaChatTray.bat`**：在**系统托盘**显示图标（使用 `assets/adachat-logo.ico`），无黑色命令行窗口；右键可打开浏览器或退出并停止 PHP。需 **PowerShell 5.1+**（Windows 10 自带）。
- 传统方式仍可双击 **`启动 Ada Chat.bat`**（带控制台窗口，便于查看日志）。

### 前端构建（必须）/ Frontend build (required)

- 部署 **`AI.php` 完整版**前，在项目根目录执行 **`npm install`**（首次）与 **`npm run build`**。脚本 **`scripts/build-dist.mjs`** 会生成 **`dist/`**：其中 **`full.html`** 对应 **单个** **`dist/assets/full-*.js`**（无额外 chunk），**`index.html`**（精简版）为 **`main-*.js`** + CSS；**`dist/.vite/manifest.json`** 合并两入口。未构建时访问 **`AI.php`** 会返回 **503**。
- **Inno Setup** 安装包 **`AdaChat.iss`** 会打包 **`dist/`**（打安装包前须先执行 **`npm run build`**，否则编译失败）。当前发行版为 **`AdaChat_Setup_v1.2.0.exe`**：https://github.com/saviorwq/Ada-chat/releases/tag/v1.2.0

### 持续集成 / CI

- 推送与 PR 会运行 GitHub Actions（见 `.github/workflows/ci.yml`）：**`lint-and-lock`** 中按变更路径有选择地执行 **`npm run check:node`**（ESLint + Prettier：`src/**/*.js`、根目录 **`*.js`**、`scripts/**/*.mjs` 与工程配置 + `test:lock`）/ **`npm run php:lint`**（Ubuntu + Windows）（job 仍为成功以满足分支保护），以及 Ubuntu 上的 **`npm run build`**（仅在与 Vite 产出相关的文件变更时执行 **`npm ci` + build**，纯文档类变更会跳过构建步骤但 job 仍为成功）。
- `build` 若触发执行，会上传 `dist/` 为 Actions artifact（含合并后的 `dist/.vite/manifest.json`），便于排查构建/部署问题。
- 本地可对齐 CI：安装依赖后执行 **`npm run check:node`**（不含 PHP 与 `build`）；本机有 PHP 时再 **`npm run check`**；需要时再 **`npm run build`**。
- 依赖更新：仓库启用 **Dependabot**（见 `.github/dependabot.yml`），会定期对 **npm** 与 **Actions** 发起版本更新 PR。
- 换行策略：见 **`.gitattributes`**（源码以 **LF** 为主；Windows 批处理/PowerShell 脚本为 **CRLF**）。
- 编辑器默认格式：见 **`.editorconfig`**（与 Prettier 配置一致）。

### 前端静态检查（可选）/ ESLint (optional)

- `npm run lint`（忽略 `node_modules/`、`dist/`、`plugins/`）
- `npm run format:check`：对 **`src/**/*.js`**、根目录 **`*.js`**、**`scripts/*.mjs`** 与 **Vite / ESLint / package 配置** 做 Prettier 校验（CI 同范围）；修正可执行 `npm run format:write`

### PHP 语法检查（可选）/ PHP lint (optional)

- 在项目根目录执行：
  - `powershell -NoProfile -File scripts/php-lint.ps1`
  - 或双击 `scripts/php-lint.bat`
  - 或 `npm run php:lint`（跨平台，依赖系统可用的 `php`；也可设置 `ADACHAT_PHP` 指向可执行文件）
  - Windows 下也可用：`npm run php:lint:win`
- 如未配置 PHP 到 PATH，可：
  - `powershell -NoProfile -File scripts/php-lint.ps1 -Php C:\path\to\php.exe`
  - 或设置环境变量 `ADACHAT_PHP` 指向 `php.exe`

### 安装步骤 / Installation

**1. 上传文件 / Upload files**

```bash
# 将整个 AdaChat-Release 目录上传到你的 Web 服务器
# Upload the entire AdaChat-Release directory to your web server
```

**2. 修改登录密码 / Change login password**

> **默认密码**：在未写入 **`ai_data/.auth_password`** 且未设置 **`ADA_LOGIN_PASSWORD`** 时，安装包/首次使用默认 **`admin123`**。一旦在「设置 → 安全」保存过密码，**仅以 `.auth_password` 为准**（环境变量与默认密码不再生效），直至删除该文件或再次在设置中修改。  
> **Default password**: **`admin123`** only when neither **`ai_data/.auth_password`** nor **`ADA_LOGIN_PASSWORD`** is set. After saving a password in **Settings → Security**, **only the hash file applies**.

方式一：设置环境变量（推荐）/ Option A: Environment variable (recommended)

```bash
export ADA_LOGIN_PASSWORD='your-secure-password-here'
```

方式二：在网页设置里修改（推荐给安装包用户）/ Option B: Change in Settings UI (recommended for installer users)

- 登录后打开「设置」→「安全」，设置访问密码（会写入 `ai_data/.auth_password` 并优先于环境变量）。
- After login, open Settings → Security, set access password (stored in `ai_data/.auth_password`, overrides env).

**3. 配置文件权限 / Set permissions**

```bash
chmod 755 ai_data/
chmod 755 plugins/
chmod 755 ssl/
```

**4. SSL 证书（Windows 服务器）/ SSL Certificate (Windows)**

如果部署在 Windows 上且 PHP 未配置 `curl.cainfo`：
If deploying on Windows without `curl.cainfo` in php.ini:

1. 从 https://curl.se/docs/caextract.html 下载 `cacert.pem`
2. 放入 `ssl/` 目录
3. Download `cacert.pem` from the URL above and place it in `ssl/`

**5. 访问 / Access**

```
https://your-domain.com/AdaChat-Release/login.php
```

### Nginx 安全配置（必须）/ Nginx Security Rule (Required)

> Nginx 不识别 `.htaccess`，必须手动禁止 `ai_data` / `ssl` 目录的 Web 访问。

```nginx
location ~ /(ai_data|ssl)/ {
    deny all;
    return 403;
}
```

### 首次使用 / First Use

1. 使用 **`login.php`** 登录（若仍使用默认口令 **`admin123`**，请尽快按上文「修改登录密码」替换）
2. 登录后进入主界面
3. 点击 **⚙️ 设置** → **➕ 新增供应商**
4. 填入供应商名称、API 地址和 Key
5. 点击 **获取最新模型** → 勾选需要的模型 → **保存模型选择**
6. 进入 **模型类型管理**，为模型分配正确的类型
7. 开始对话！

---

## 🎯 使用技巧 / Tips

### 文字识别 (OCR)
> 上传含文字的图片 → 选择 📄 文字识别 → 点击发送
> 适合：截图文字提取、文档数字化、手写识别

### 图像理解 (Vision)
> 上传图片 → 选择 👁️ 图像理解 → 输入分析指令（如"分析穿搭风格"）→ 发送
> 适合：穿搭分析、场景描述、商品鉴别、图表解读

### 编程助手 (Code)
> 选择 💻 编程 → 描述需求或粘贴代码 → 发送
> 自动注入编程专用 System Prompt，输出带语法高亮的代码块

### 图像生成 (Image)
> 选择 🎨 图像生成 → 输入描述文本 → 发送
> 支持文生图和图生图两种模式

### 成本控制
> 设置 → 💰 成本优化 → 开启滑动窗口 + 智能路由
> 可减少 50%-80% 的 API 调用成本

---

## 📄 License

This project is licensed under **GPL-3.0**.

简单说明：
- ✅ 允许使用、修改、再分发（含商业用途）
- ⚠️ 若你分发修改版，必须同时提供对应源代码
- ⚠️ 必须保留原有版权与许可声明，并继续使用 GPL-3.0

See full text: [LICENSE](LICENSE)

---
我已入住爱发电，请大家关注我，谢谢！https://afdian.com/a/Ada-chat

<p align="center">
  <strong>Ada Chat</strong> — 你的私有多模态 AI 助手 / Your Private Multimodal AI Assistant
</p>
