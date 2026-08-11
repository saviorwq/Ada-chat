# Ada Chat 更新日志 / Changelog

## Unreleased

- **Runtime 跨链路冒烟**：`scripts/runtime-switch-smoke.php` 首跑因长等待被人工中止（非业务失败）；缩短超时后 **9/9 通过**（`fa8ae03`）。结论：等待外部 Worker 必须短超时 + 失败收口。
- **Image Worker 常驻 v0.1**：`image_inference_bridge.py serve` + `backend/image/worker.php`；模型加载一次复用（`reloaded`）；状态机 READY/BUSY/…；`release(image)` 不杀 Worker、不自动拉回 llama。
- **Local Runtime Manager（门面）**：统一 `runtime_status` / `runtime_scan` / `runtime_jobs`；本地图/视频任务前后 GPU 协调（停/恢复 Vulkan llama）；设置页「本地运行时」只读面板。详见 `docs/local-runtime-manager.md`。

## v1.2.0 (2026-08-10)

- 本地 **Image Runtime（Diffusers）**：`image_inference_bridge.py` + `backend/image/*`，支持扫描 Diffusers/单文件模型、Intel Arc **XPU** 出图；文生图提示词改为**用户描述优先**、角色预设作风格后缀，并剥离误叠的 `[文生图]` 标签。
- 本地推理桥接：`local_inference_bridge.py` / `video_inference_bridge.py` 与 Vulkan llama 托盘启停脚本；Windows 托盘可启停 GPU 服务。
- 前端 **仅 Vite**：移除根目录 **`adachat-*.js`**、**`scripts/build-legacy-shims.mjs`**、**`src/shims/`**；**`AI.php`** 仅注入 **`dist/`** full 单包，无 **`dist`** 时 **503** 提示 **`npm run build`**；**`test:lock`** 校验不再引用 legacy。
- 仓库清理：删除无效的 **`.wiki-temp/`**、**`plugins/_cyoa_release_staging/`**、IDE 残留 **`.trae`** / **`Ada Chat/`**。
- 生产构建：**`full.html`** 改为 **Rollup `inlineDynamicImports`** 单 JS 文件；**`npm run build`** 使用 **`scripts/build-dist.mjs`** 合并 **`vchat`** 与 **`AI.php`** 所需的 **manifest**。
- Windows：新增 **`启动 Ada Chat.bat`** / **`停止 Ada Chat.bat`** 作为小白可见的中文入口；**`start.bat`** 保留为兼容转调；安装器默认启动项改为 **`启动 Ada Chat.bat`**。
- Windows：**`AdaChatTray.ps1` + `AdaChatTray.bat`** — 绿色免安装可用，**系统托盘**启动/退出（无控制台窗口），使用 `assets/adachat-logo.ico`；安装器开始菜单增加「Ada Chat（托盘）」。
- 工程化：新增 PHP 语法检查脚本 **`scripts/php-lint.ps1`**（并提供 **`scripts/php-lint.bat`** 与 `npm run php:lint` 入口）。
- 工程化：新增 GitHub Actions CI（`.github/workflows/ci.yml`），在 **Ubuntu + Windows** 矩阵上运行 **`lint-and-lock`**，并使用 **`dorny/paths-filter`** 根据 **Node/PHP/lock** 输入选择性执行 **`npm run check:node`** + **`npm run php:lint`**（job 仍成功以满足分支保护），同时启用 **npm 缓存**与 **同分支并发取消**；另在 **Ubuntu** 单 job 跑 **`npm run build`** 校验 Vite 生产构建（**`dorny/paths-filter`**：仅当 **`src/`**、入口 **`*.html`/`*.js`**、**`style.css`**、**Vite 配置**、**`scripts/build-dist.mjs`** 或 **`package*.json`** 等变更时才执行 **`npm ci` + build**，否则跳过以节省配额；执行时上传 `dist/` artifact 便于排查；job 仍成功以便分支保护）；workflow 设置 **`permissions: contents: read`**。
- 工程化：`eslint.config.mjs` 忽略 **`dist/`**、**`plugins/`**，并为 **`scripts/*.mjs`** 与 Vite 配置启用 **Node** 全局；新增 `npm run lint`。
- 工程化：新增 `npm run format:check` / `format:write`（覆盖 **`src/**/*.js`**、根目录 **`*.js`**、**`scripts/*.mjs`** 与工程配置文件），CI 已接入 `format:check`；并对上述范围执行 Prettier 格式化。
- 工程化：新增 **Dependabot**（`.github/dependabot.yml`）：每周检查 **npm**、每月检查 **GitHub Actions** 更新。
- 工程化：新增 **`.gitattributes`**（默认文本 **LF**；**`.bat`/`.cmd`/`.ps1`** 保留 **CRLF**；常见图片/字体标记为 **binary**）。
- 工程化：新增 **`.editorconfig`**（与 Prettier 的 2 空格缩进、UTF-8、Markdown 不裁尾空白等策略对齐）。
- 工程化：`package.json` 增加 **`engines.node >= 20`**、**`.nvmrc`**（`20`），并新增 **`npm run check:node`** / **`npm run check`**（后者在 Node 检查基础上再跑 **`php:lint`**，便于无 PHP 环境时先做前端侧自检）。

## v1.0.5 (2026-03-03)

### 每日更新 / Daily Log
- 完成前端大规模模块化拆分，`script.js` 从 200KB+ 缩减至约 67KB，核心逻辑可读性与可维护性大幅提升。
- 新增并接入模块文件：`adachat-i18n.js`、`adachat-upload.js`、`adachat-rag.js`、`adachat-provider-models.js`、`adachat-settings-ui.js`、`adachat-auto-switch.js`、`adachat-help-ui.js`。
- `AI.php` 脚本加载顺序更新，保证“配置/运行时/功能模块/核心脚本”依赖链稳定。

### 架构与工程化 / Architecture & Engineering
- **RAG 拆分**：知识库设置、索引、检索、导入流程独立为 `adachat-rag.js`。
- **上传链路拆分**：拖拽上传、PDF 文本提取与扫描渲染独立为 `adachat-upload.js`。
- **设置域拆分**：皮肤、语言、预设、词转换迁移至 `adachat-settings-ui.js`。
- **供应商与模型拆分**：供应商编辑、模型勾选、模型类型管理、模式能力矩阵迁移至 `adachat-provider-models.js`。
- **自动切换拆分**：限流识别、候选模型排序、拖拽优先级与提示迁移至 `adachat-auto-switch.js`。
- **帮助中心拆分**：Markdown 渲染、帮助内容与窗口交互迁移至 `adachat-help-ui.js`。

### 打包与发布 / Packaging & Release
- Inno Setup 版本号提升至 `1.0.5`。
- 安装包文件清单补齐新拆分的前端模块，避免安装后缺失脚本导致功能异常。

## v1.0.4 (2026-03-01)

### 新功能 / New Features
- **助手消息操作栏**：为 AI 回复增加复制与重回答入口，提升二次编辑与追问效率。
- **重点内容提取复制**：自动提取回答中的关键信息块，支持逐条一键复制。

### 安全与稳定性 / Security & Stability
- **插件运行时加固**：新增钩子白名单（`beforeBuildRequest` / `beforeSend` / `afterResponse`）、钩子超时与异常插件自动熔断禁用机制。
- **插件默认策略收紧**：新插件首次注册默认禁用，需用户手动启用后才生效。
- **插件面板防注入**：插件名称、作者、描述等元信息改为安全转义渲染。
- **插件加载路径加固**：插件目录与资产文件名增加严格校验，阻断路径穿越与越界加载风险。
- **绕过策略白名单化**：`bypassCostOptimizer` 需显式传入，并可通过客户端白名单控制是否允许绕过成本优化链路。

### 体验优化 / UX Improvements
- **文生图重回答优化**：重回答前自动清理临时图像状态，减少上下文污染导致的偏移输出。
- **插件扩展点完善**：主程序新增 `beforeBuildRequest` 与 `afterResponse` 钩子，便于插件做前后置处理。

### 文档 / Documentation
- README 新增插件安全基线说明，更新至 `v1.0.4`。
- Wiki 同步补充安全基线与版本索引。

## v1.0.3 (2026-02-26)

### 新功能 / New Features
- **RAG 知识库（MVP）**：新增本地知识库面板，支持导入 `.txt/.md/.json/.csv/.log`，聊天时自动检索并注入参考片段。
- **RAG 参数设置**：支持开关、Top-K 检索片段数、最大注入字符数与文档管理（删除/清空）。
- **模式能力矩阵面板**：新增设置页只读说明面板，从 `adachat-mode-config.js` 动态渲染模式上传规则。
- **矩阵复制能力**：支持一键复制“模式能力矩阵”为 Markdown，便于同步文档与发布说明。

### 修复 / Fixes
- **供应商列表容错**：修复 `providerList.forEach is not a function`，兼容数组与对象返回结构。
- **会话失效提示**：当接口返回 `Unauthorized` 时，设置页显示登录态失效提示，避免静默报错。
- **上传规则一致性**：模式切换时上传格式按配置实时更新，减少图生图/OCR/翻译等场景的误上传。

### 合规与文档 / Compliance & Docs
- 新增 `CONTRIBUTING.md`（贡献法律声明 + 流程）。
- 新增 `CODE_OF_CONDUCT.md`（协作行为准则）。
- 多个源码文件补充 SPDX 版权头，README 协议说明补充“可做/必须做”摘要。

## v1.0.2 (2026-02-23)

### 新功能 / New Features
- **帮助中心**：新增可渲染富文本的帮助窗口，支持拖动与缩放，且不阻塞主界面操作
- **聊天身份设置**：支持玩家昵称、AI 昵称、头像 URL、AI 对玩家称呼
- **皮肤模式**：新增浅色/深色/自定义主题配色并持久化
- **语言扩展**：新增 Spanish / Japanese，缺失词条自动回退 English

### 体验优化 / UX Improvements
- 图片上传后输入框显示 `[图片]` 标记，聊天历史渲染图片预览（而非纯文本标记）
- 设置面板默认不展开供应商列表，避免误进入供应商编辑流程
- 清理 i18n 重复键，降低维护歧义

### 诊断与排查 / Debug & Diagnostics
- Debug 模式新增命令台、`help`、`diag`、`explain`、`route` 等命令
- 诊断输出新增“问题翻译”和“项目定位路径”（文件 + 排查步骤）

## v1.0.1 (2026-02-23)

### 安全修复 / Security Fixes
- **新增 `router.php` 安全路由** — 拦截对 `/ai_data/`、`/ssl/`、`/php/` 目录的直接 Web 访问，返回 403 Forbidden，防止 API Key 等敏感数据泄露
- **Nginx 部署安全建议** — README 中新增 Nginx 配置说明，提醒用户添加 `deny all` 规则保护数据目录（`.htaccess` 仅对 Apache 生效，Nginx 需手动配置）

### Windows 安装包 / Windows Installer
- **内置 PHP 8.3.29 运行时** — 无需用户额外安装 PHP，开箱即用
- **自动安装 Visual C++ 运行库** — 安装时自动检测，未安装则静默安装 VC++ Redistributable 2015-2022
- **系统兼容性检查** — 仅支持 64 位 Windows 8.1 / 10 / 11，安装时自动校验
- **一键启动** — 通过 `start.bat` 启动 PHP 内置服务器，自动打开浏览器访问 `http://127.0.0.1:8920`
- **安装完成提示** — 显示默认密码 (`admin123`)、修改方法、首次配置指南

### 新增文件 / New Files
- `router.php` — PHP 内置服务器安全路由脚本
- `start.bat` — Windows 一键启动脚本
- `stop.bat` — Windows 停止服务脚本
- `使用说明.txt` — 中文使用指南（含默认密码、配置步骤）
- `ssl/cacert.pem` — CA 证书包，确保 HTTPS API 调用正常

### 发行包 / Distribution
- `AdaChat_Setup_v1.0.exe` — Windows 一键安装包 (44 MB)
- `AdaChat_v1.0.tar.gz` — Linux / macOS 部署包 (0.3 MB，需自备 PHP 8.0+ 环境)
