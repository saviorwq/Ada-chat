# 文生视频（发行版 A+B 双模式）

Ada Chat 发行版支持 **云端 API Key（默认）** 与 **本地模型（可选）** 两种文生视频方式，体验与通义千问 / 豆包类似：输入文字 → 等待生成 → 在对话中直接播放视频。

## 云端模式（推荐，默认）

1. 打开 **设置 → 供应商**，选择 **硅基流动**（或其它已配置视频 API 的供应商）。
2. 填写 **API Key**。
3. 在模型列表中启用 **Wan-AI/Wan2.2-T2V-A14B**（文生视频）或 **Wan-AI/Wan2.2-I2V-A14B**（图生视频）。
4. 主界面分类选 **🎬 视频生成**，输入 prompt，发送。
5. 系统提交异步任务并轮询状态，完成后在气泡内嵌 `<video>` 播放。

### 硅基流动 API

- 提交：`POST {base_url}/video/submit`
- 状态：`POST {base_url}/video/status`
- 供应商配置项：`video_submit_path`、`video_status_path`（默认 `/video/submit`、`/video/status`）

## 本地模式（可选）

适用于 **本地供应商 + 直连推理**（`inference_engine: direct`），不依赖 Ollama / ComfyUI 界面。

### 依赖

```bash
pip install torch diffusers transformers accelerate imageio[ffmpeg]
```

### 模型格式

| 格式 | 是否支持 | 说明 |
|------|----------|------|
| HuggingFace safetensors（含 `config.json`） | ✅ | 如 Wan2.2-TI2V-5B 目录 |
| ComfyUI Wan GGUF | ❌ | 请用云端 API 或 ComfyUI 工作流 |

默认扫描目录：`D:\models`（若存在），否则 `ai_data/local_models`。

### 诊断

```bash
python video_inference_bridge.py doctor
python video_inference_bridge.py scan --models-dir D:\models
```

## 架构

```
用户发送 (task=video)
    → backend/gateway/entry.php
    → backend/video/gateway.php（创建 job，立即返回 job_id）
    → backend/video/spawn.php（后台 worker）
        ├─ cloud: backend/video/cloud.php（硅基流动轮询）
        └─ local: video_inference_bridge.py generate
    → 前端 pollVideoJobUntilDone → ai_proxy.php?action=video_job_status
    → 完成：生成视频：<url> → chat-render 内嵌播放器
```

本地成片路径：`ai_data/generated_videos/`，通过 `ai_proxy.php?action=video_file&id=...` 访问。

任务超过 20 分钟无更新会被标记为 stale 并返回失败提示（常见于 PHP `exec` 被禁或 worker 未启动）。

## 相关文件

- `video_inference_bridge.py` — 本地 Python 桥
- `backend/video/` — 任务、云端、本地、worker
- `src/ui/video-generate.js` — 前端轮询
- `src/ui/chat-send-pipeline.js` — 识别 `job_id` 并轮询
- `src/ui/chat-render.js` — 视频播放器
