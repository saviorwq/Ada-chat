# Local Runtime 跨链路切换测试（Image ↔ LLM）

> 目标：封口 **Local Runtime Manager + Image Worker Resident** 前，把 GPU 协调测穿。  
> 不测 Flux/LoRA；只测「两个 Runtime 会不会同时无条件占 GPU / 会不会死锁」。

## 设计约定（当前实现）

| 动作 | 行为 |
|------|------|
| `prepare(image)` | 停 Vulkan `llama-server`，**不**停 Image Worker |
| `release(image)` | **不**杀 Image Worker；**不**自动拉回 llama（只清退出哨兵） |
| 本机 Vulkan 聊天 | 若 `base_url` 指向 `127.0.0.1:8080` 且 health 失败 → **聊天前 ensure llama**（最多等 ~20s） |
| 本地直连 GGUF 聊天 | 不依赖 llama-server；可能与 Image Worker **同卡争用**（已知风险，见 T7） |

## 手工验收矩阵

### T1 — 首次生图
1. 设置→本地运行时：Image Worker 初始可为 STOPPED  
2. 本地文生图一次  
3. 期望：`STARTING/LOADING → READY`，Job completed，`reloaded=true`（或首包加载）

### T2 — 连续第二次生图
1. 紧接着再发一张（同模型）  
2. 期望：Worker 进程仍在；health `READY→BUSY→READY`；Job 上 `reloaded=false`

### T3 — 生图中状态
1. 生图进行中刷 `GET :18766/health`  
2. 期望：`status=BUSY`

### T4 — 生图失败收口
1. 故意错误模型 id 或无效 prompt 路径  
2. 期望：Worker 可进 `ERROR`；Job `failed`；UI 不转圈

### T5 — Worker 被杀后恢复
1. 杀掉 `python … serve` 进程  
2. 再发文生图  
3. 期望：PHP ensure 拉起 Worker → 继续出图

### T6 — Image → Vulkan LLM 聊天（关键）
1. 生图成功，Image Worker `READY`  
2. 确认 `8080/health` 在生图后为 down（prepare 停过）  
3. 切本地 HTTP/Vulkan 模型发一句聊天  
4. 期望：聊天请求触发 ensure；llama 起来后正常回复（可能稍慢）  
5. Image Worker **仍存活**（health 仍 READY，模型仍 loaded）

### T7 — Image READY → 直连 GGUF 聊天 → 再发图
1. Image Worker READY（已占 XPU/显存）  
2. 本地 **直连** GGUF 聊天  
3. 观察：能答 / OOM / 极慢 → **记录结果**（争用属已知边界，不要求同卡完美双开）  
4. 再发文生图：期望 `prepare` 停 llama（若有）后 Image 复用成功

### T8 — 组合压力
```text
生图 → Image READY
 →（可选）手动 kill llama
 → Vulkan 聊天（应 ensure 恢复）
 → 再次生图（prepare 停 llama，Image 复用）
 → 再次生图（reloaded=false）
```

## 自动化冒烟（不加载 SD 权重）

仓库脚本：`scripts/runtime-switch-smoke.php`

```bat
php\php.exe scripts\runtime-switch-smoke.php
```

覆盖：Vulkan health、Image worker health、prepare/release 日志语义、ensure_vulkan_llm、本地 URL 判定。  
**不**替代 T1–T8 真机出图。

## 封口建议

- T1–T6、T8 通过 → 可记 **Local Runtime v0.1 Stable Candidate**  
- T7 仅记录现象，不阻塞封口（下一阶段再做显存调度 / 互斥）  
- 通过前 **不要** push 当发布；通过后可打文档里程碑再 push
