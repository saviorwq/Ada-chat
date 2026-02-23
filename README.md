<p align="center">
  <img src="https://img.shields.io/badge/Ada%20Chat-V1.0-10b981?style=for-the-badge&logo=openai&logoColor=white" alt="Ada Chat V1.0">
  <img src="https://img.shields.io/badge/PHP-8.0+-777BB4?style=for-the-badge&logo=php&logoColor=white" alt="PHP 8.0+">
  <img src="https://img.shields.io/badge/License-GPL%20v3-blue?style=for-the-badge" alt="GPL v3 License">
</p>

<h1 align="center">🤖 Ada Chat</h1>
<p align="center"><strong>多模态 AI 助手 · Multimodal AI Assistant</strong></p>
<p align="center">一个自托管的多供应商、多模态 AI 聊天平台<br>A self-hosted, multi-provider, multimodal AI chat platform</p>

---

## ✨ 功能亮点 / Features

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
- 生命周期钩子：`onload`、`beforeSend`、`afterReceive`
- 设置面板内可启用/禁用插件
- Hot-reload plugins from `plugins/` directory
- Server-side storage per plugin via `PluginStorage` API
- Lifecycle hooks: `onload`, `beforeSend`, `afterReceive`

### 🔒 安全特性 / Security
- Session 鉴权保护所有 API 端点 / Session authentication on all endpoints
- CSRF Token 防护所有 POST 请求 / CSRF token protection for all POST requests
- XSS 防护：用户消息使用 `textContent` 安全渲染 / XSS-safe rendering via `textContent`
- 安全 HTTP 头：`X-Content-Type-Options`、`X-Frame-Options`、`X-XSS-Protection` / Secure HTTP headers
- API Key 服务端存储，前端不暴露 / Server-side API key storage
- HTTPS 自动启用 Secure Cookie / Auto-enable Secure Cookie over HTTPS
- `ai_data/` 目录 `.htaccess` 保护 / `.htaccess` protection for data directory

### 🌐 多语言 / Internationalization
- 中文 / English 双语界面，一键切换
- Bilingual UI (Chinese / English), one-click switch

---

## 📁 目录结构 / Directory Structure

```
AdaChat-Release/
├── AI.php                 # 主入口页面 / Main entry page
├── ai_proxy.php           # AI API 网关 / AI API gateway
├── ai_config.php          # 配置文件 / Configuration
├── cost_optimizer.php     # 成本优化引擎 / Cost optimization engine
├── api.php                # 插件数据 API / Plugin data API
├── login.php              # 登录页面 / Login page
├── script.js              # 前端核心逻辑 / Frontend core logic
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

---

## 🚀 部署指南 / Deployment

### 系统要求 / Requirements

- PHP 8.0+ (with `curl`, `json`, `mbstring` extensions)
- Apache / Nginx / 任意支持 PHP 的 Web 服务器
- 推荐 HTTPS（保护 API Key 传输）

### 安装步骤 / Installation

**1. 上传文件 / Upload files**

```bash
# 将整个 AdaChat-Release 目录上传到你的 Web 服务器
# Upload the entire AdaChat-Release directory to your web server
```

**2. 修改登录密码 / Change login password**

方式一：设置环境变量（推荐）/ Option A: Environment variable (recommended)

```bash
export ADA_LOGIN_PASSWORD='your-secure-password-here'
```

方式二：编辑 `login.php`，修改第 18 行 / Option B: Edit `login.php`, line 18:

```php
define('LOGIN_PASSWORD', getenv('ADA_LOGIN_PASSWORD') ?: 'your-secure-password-here');
```

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

### 首次使用 / First Use

1. 登录后进入主界面
2. 点击 **⚙️ 设置** → **➕ 新增供应商**
3. 填入供应商名称、API 地址和 Key
4. 点击 **获取最新模型** → 勾选需要的模型 → **保存模型选择**
5. 进入 **模型类型管理**，为模型分配正确的类型
6. 开始对话！

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

GPL-3.0 License - 详见 [LICENSE](LICENSE) 文件 / See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Ada Chat</strong> — 你的私有多模态 AI 助手 / Your Private Multimodal AI Assistant
</p>
