# Local Runtime Manager（v1.5 门面）

> 定位：把三条本地 bridge 收成 **可管理的本机 AI Runtime**，而不是「支持几种文件格式」。

```text
Ada Chat Local Runtime Manager
│
├── LLM Worker     → local_inference_bridge + Vulkan llama-server
├── Image Worker   → image_inference_bridge（当前 oneshot）
└── Video Worker   → video_inference_bridge（当前 oneshot）
```

包装现有脚本，**不重写** Python bridge。

## API（需登录）

| action | 说明 |
|--------|------|
| `runtime_status` | 聚合 doctor / health / 设备偏好 / flags |
| `runtime_scan` | 合并扫描 chat / image / video 模型（`modality` 字段） |
| `runtime_jobs` | 近期 `image_jobs` + `video_jobs` |
| `runtime_prepare` | 手动 GPU 协调（停 Vulkan llama） |
| `runtime_release` | 任务后恢复 ensure llama（best-effort） |

示例：

```text
GET  ai_proxy.php?action=runtime_status
POST ai_proxy.php?action=runtime_scan
GET  ai_proxy.php?action=runtime_jobs&limit=20
```

### `runtime_status` 形状

见实现：`backend/runtime/status.php` → `adachat_runtime_build_status()`。

设备优先序：`xpu > cuda > vulkan(health) > cpu`。

**厂商口径**（聊天 Vulkan 跨卡；出图/音乐见下表）：详见 [gpu-support.md](gpu-support.md)。

| | Intel Arc | NVIDIA | AMD |
|--|-----------|--------|-----|
| 出图 / 音乐 | 已验证 | 实验 | 不保证 |
| Vulkan 聊天 | 已验证 | 可用 | 可用（视驱动） |

## GPU 协调

默认 **开启**。`prepare(image|video|music)` 会：

1. 停 Vulkan `llama-server`
2. **music**：卸出图 Worker 权重（`image_worker_unload`）
3. **image / video**：若 ACE 在跑则 `acestep_stop`
4. 短暂等待释显存

`release(image)` 默认 unload 权重、**保留**进程；`release(music)` 默认 **常驻 ACE**（仅 Free VRAM / 托盘停）。  
本机 Vulkan 聊天（`base_url` → `127.0.0.1:8080`）会在请求前 **ensure llama**。

`runtime_status.workers` 含 `music`（ACE health/endpoint）。  
「释放显存」会停 llama / 出图 / ACE，UI 有确认以免误杀 Cover。

跨链路验收：[`docs/local-runtime-switch-test.md`](local-runtime-switch-test.md)  
冒烟：`php\php.exe scripts/runtime-switch-smoke.php`

关闭方式（任选）：

- 环境变量：`ADACHAT_RUNTIME_GPU_COORD=0`
- 标记文件：`ai_data/features/runtime_gpu_coord_off`

日志：`ai_data/runtime/coord.log`

## UI

设置 → **模型与供应商** → **本地运行时**：只读状态、刷新、扫描、近期任务。

## Image Worker 常驻（v0.1）

`image_inference_bridge.py serve` + `backend/image/worker.php`：

| 项 | 说明 |
|----|------|
| 端口 | `18766`（`ADACHAT_IMAGE_WORKER_PORT`） |
| 健康 | `GET /health` → `status`: READY/BUSY/LOADING/ERROR… |
| 出图 | `POST /generate` |
| 复用 | 同 `models_dir+model_id` 不重载；响应含 `reloaded` |
| 崩溃恢复 | PHP ensure 拉起后重试一次；再失败回退 oneshot |
| release | **不**停止 Image Worker；image 路径不自动 ensure llama；Vulkan 聊天前按需 ensure |


验收：

1. 第一次生成：Worker STOPPED→READY，出图成功，`reloaded=true`
2. 第二次：保持进程，`reloaded=false`
3. 生成中：`status=BUSY`
4. 失败：Worker `ERROR`，Job `failed`，UI 收口
5. 杀 Worker 后再生成：自动拉起
6. prepare 停 llama，release 不杀 Image Worker（不死锁）

## 刻意不做（本切片 / Worker v0.1）

- 并发多模型、自动显存预测、复杂队列
- Image Worker 常驻以外的视频常驻
- 精确 VRAM 计量 / 双模型同卡并存
- 合并三个 Python 进程
- CYOA / Role Card 绑本地出图

## 相关文件

- `backend/runtime/*`
- `backend/actions/local_runtime.php`
- `src/ui/local-runtime-ui.js`
- `docs/v1.5-local-image-runtime.md`
