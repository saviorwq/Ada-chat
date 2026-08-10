# Ada Chat v1.2.0 发布说明 / Release Notes

发布日期：2026-08-10

## 重点更新
- 前端全面迁移为 **Vite 生产单包**，安装包内置 `dist/`，无需再分发根目录 legacy JS。
- 新增本地 **Image Runtime（Diffusers）**：扫描本地模型、Intel Arc **XPU** 文生图；提示词改为用户描述优先，减少角色预设英文盖过主题。
- Windows：**系统托盘**启停（`AdaChatTray`）、中文启动/停止脚本；可一键启停本地 Vulkan llama。
- 后端模块化（`backend/`）与 CI/工程化补齐（lint、format、Dependabot）。

## 升级建议
- 升级后强制刷新页面（`Ctrl+F5`）。
- 本地文生图需自行安装 Python 依赖（见 `requirements-local-image.txt`），并准备 Diffusers/checkpoint 模型目录。
- 若使用托盘启动，请确认 `assets/adachat-logo.ico` 已随安装包一并部署。

## 发行包
- Windows：`AdaChat_Setup_v1.2.0.exe`
- Linux/macOS：`AdaChat_v1.2.0.tar.gz`
