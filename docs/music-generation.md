# Ada Chat — 本地音乐生成（ACE-Step 1.5）

## 概要

分类选 **🎵 音乐生成** → 发送风格描述（可选「歌词：」分段）→ 异步任务 → 气泡内 `<audio>` 播放。

后端调用本机常驻 ACE-Step REST API（默认 `http://127.0.0.1:8001`），**不**每次冷启动模型。

## 前置

1. 已安装 ACE-Step：`D:\ACE-Step\ACE-Step-1.5`（含 `venv_xpu` 与 checkpoints）
2. **推荐先启动 API**：双击 `D:\ACE-Step\启动ACE-Step-API.bat`（无界面，日志在 `ACE-Step-1.5\logs\`）
3. Ada 在任务开始时会探测 `/health`；失败则自动拉起 **headless** 脚本（需 PHP `exec` + `PYTHONPATH`）
4. 与出图互斥：同一时刻不要并行跑 Image Worker + ACE-Step（Arc A770 等 16GB 卡尤甚）
5. **GPU**：音乐主路径在 **Intel Arc / XPU** 已验证；NVIDIA（CUDA）为实验；AMD 不保证。见 [gpu-support.md](gpu-support.md)

健康检查：浏览器打开 http://127.0.0.1:8001/health 应返回 `status":"ok"`

## 使用

- 提示词示例：`欢快的中文流行，女声，夏日海边`
- 带歌词：在正文后空一行写 `歌词：` 再贴歌词
- 分类选 🎵 后模型下拉可选 **Base（推荐）** / **Turbo（快）**；默认 Base
- 参数手填（工具栏旁标注有效范围）：
  - **时长**：10–300 秒
  - **步数**：4–100（Base 人声建议 55–60）
  - **CFG**：1–12（Base 人声建议 ≤3.5，常用 3.0）
  - **BPM**：30–300；留空 = 自动
  - **LM温度**：0.5–1.5（人声默认 0.7；越低越稳）
  - **推理**：`ODE`（默认，稳）/ `SDE`（勿用于人声，易畸变）
- **后端固定**（不可被 CoT 改掉）：`use_cot_caption=false`、`use_cot_language=false`、`thinking=false`、`constrained_decoding=true`
- **4/4 拍**：由 `prompt_prep` 自动补全（除非提示词写明其它拍号）

### 与「某 AI 建议参数」对照

| 建议项 | Ada / ACE 现状 |
|--------|----------------|
| BPM 68 + 4/4 | ✅ BPM 手填；4/4 自动补 |
| Steps 55–60、CFG 3.0 | ✅ 手填 |
| `use_cot_caption=false` | ✅ 后端强制关闭 |
| LM temperature 0.7 | ✅ 新增 LM温度 控件，默认 0.7（人声） |
| 不用 SDE，用 ODE | ✅ 新增推理下拉，默认 ODE |
| `sgm_uniform` 采样器 | ❌ **ACE 无此参数**；ACE 只有 `sampler_mode`: euler/heun（API 未暴露），与 SD 的 scheduler 不是一回事 |
| Anti-Autotune 0.28–0.32 | ❌ **ACE 无此参数**（像 SD/其它工具的术语）；相近可调的是 `velocity_ema_factor` 等，尚未接入 UI |
- **仅音乐**：勾选后强制纯器乐（忽略「歌词：」块），并自动追加 `instrumental, no vocals, pure instrumental, music only, 纯器乐, 无人声, 仅音乐`
- 需要人声/歌词时：取消「仅音乐」，再在正文后空一行写 `歌词：`
- 纯器乐会写 `lyrics=[Instrumental]`，并带上 `bpm` + `4/4` + `steady tempo` 标签（避免空歌词+无 BPM 导致「无节奏糊成一团」）
- 关掉 ACE `use_cot_caption`，避免 5Hz LM 把标签改写成散文
- 工具栏 **释放显存**：停 ACE-Step / 出图 Worker
- 若仍偏散：提示词加 `128 bpm, 4/4, punchy drums, strong groove`，或 BPM 下拉选 128
- 进度阶段：`加载模型` → `排队` → `生成旋律` → `解码音频`（不再假进度虚增）
- 气泡闭环：**下载** / **导出多轨(DAW)** / **仅人声** / **仅伴奏** / **再生成**
- 多轨 ZIP 含：`00_mix` + 鼓/贝斯/其它/人声 + `05_vocals_only` + `06_instrumental`
- 后端固定 `batch_size=1`、`thinking=false`
- 首次用 Base 需下载权重到 `checkpoints/acestep-v15-base`（约 4.8GB）
- **杂音排查**：用系统播放器听下载的 WAV；文件本身吵再调 CFG/步数

## Cover 伴奏（Suno 蓝本 + ACE 纯配器）

**思路**：Suno 负责旋律/和弦/段落结构；ACE Cover 只产出**纯伴奏**（本地、无 Suno 指纹）；人声用 Suno 分离的干声在 DAW 里对齐贴回。

### Ada 操作

1. 分类 🎵 → 任务类型选 **Cover 伴奏**
2. 📁 上传 Suno 导出的**完整 WAV/MP3**（会先传到系统 temp，供 ACE `src_audio_path`）
3. 输入框只写**风格 Prompt**，**不要**写 `歌词：` 或 `[Verse]` 等标签
4. 勾选 **仅音乐**（Cover 下自动锁定）
5. **Cover强度** 建议 **0.75–0.80**（越高越贴源曲结构；1.0 易继承 Suno 原配器）
6. 其它：步数 60、CFG 3、LM 0.7、推理 ODE；**时长随源音频**，工具栏「时长」在 Cover 下无效

### 示例 Prompt（纯伴奏）

```
cold indie folk instrumental, minimalist acoustic guitar arpeggio, very sparse piano notes, 68 bpm strict steady tempo, numb detached melancholic mood, room atmospheric reverb, NO DRUMS NO PERCUSSION in first half of song, subtle soft strings enter ONLY at bridge section, no strings before bridge, slow fading outro, clean balanced mix, intimate bedroom recording, no vocals, no humming, no singing
```

### 生成后（DAW）

1. 气泡 **导出多轨(DAW)** → 吉他/钢琴/弦乐分轨
2. 拖入 Suno **人声干声**，对齐 BPM（如 68）
3. 主歌/副歌仅吉他+稀疏钢琴；弦乐只在 Bridge；全程无鼓
4. 人声：轻压缩 + 小房间混响；结尾手动淡出

### 风险

- Cover 偶发微弱哼鸣 → DAW 剪掉该段，或 Cover强度降到 **0.7** 重跑
- 源音频 temp 文件 **24 小时**过期；过期后工具栏会显示 ⚠ 并出现 **重新上传**；发送前也会拦截

## 实战案例：Suno + ACE Cover + DAW（生产级样曲）

以 cold indie folk（BPM 68、主歌无鼓、Bridge 才进弦乐）为例，完整走一遍：

### 1. Suno 出蓝本

1. 在 Suno 生成带人声的完整曲（或《一模一样的花》demo）
2. 导出 **完整 WAV**（尽量无损，便于 Cover 读结构）

### 2. Ada Cover 纯伴奏

1. 分类 🎵 → **Cover 伴奏**
2. 工具栏选 **Cover 预设 → Cold Indie Folk 纯伴奏**（自动填 Prompt + 步数 60 / CFG 3 / BPM 68 / 强度 0.78）
3. 📁 上传 Suno WAV → 状态栏应显示 **文件名 · 时长 · 大小 · 剩余有效期**
4. 发 Cover **前**：若刚跑完出图/本地 LLM，可点一次「释放显存」腾出 A770；然后等 ACE `/health` 为 ok（Ada 也会自动拉起）。**生成进行中不要点「释放显存」**（会杀掉 ACE）。勿与出图 Worker 并行。
5. 发送 → 进度会写 **「按源曲约 X 秒生成中，预计约 Y 分钟」**
6. 完成后气泡：**下载** / **导出多轨(DAW)** / **再生成**（会恢复 Cover 参数与源音频 id；源过期需重新上传）

### 3. 人声干声

- Suno 自带分离，或本机 **Demucs**（多轨 ZIP 里也有 `05_vocals_only`）
- 导出 **干声 WAV** 备用

### 4. DAW 贴回

1. 导入 ACE 多轨 + 人声干声
2. 工程 BPM **68**，对齐段落
3. 主歌/副歌：吉他 + 稀疏钢琴；**Bridge 才进弦乐**；全程 **无鼓**
4. 人声：轻压缩 + 小房间混响；结尾手动淡出
5. 导出最终版，自己听一遍：哼鸣、段落错位、Cover 强度是否合适

### 5. 问题记录模板

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 微弱哼鸣 | Cover 贴 Suno 人声谐波 | DAW 剪掉 / 强度降到 0.7 |
| Bridge 提前进弦乐 | Prompt 不够硬 | 预设 Prompt 已含 `ONLY at bridge` |
| 任务失败「源音频过期」 | temp >24h | 点 **重新上传** |
| 解码超时 | 显存被出图占用 | 先 **释放显存** 再跑 |

## 已知问题（已修复 2026-08-18）

### Intel Arc A770 + Base：`Kernel is incompatible with all devices in devs`

- **根因**：不是 attention，而是 CFG 默认的 **APG**（`apg_guidance.project` → `torch.nn.functional.normalize` / `linalg.vector_norm`）在 XPU 上无内核。
- **修复**：`acestep/models/common/apg_guidance.py` 对 `xpu`/`mps` 把 norm 放到 CPU（与原有 MPS 回退对齐）；另保留 XPU eager attention。
- **验证**：Base + CFG=3 + 40 步 + 15s 已跑通（任务 `b8182922-…`，日志 `Done! Generated 1 audio tensors`）。
- 若仍见旧报错：清 `__pycache__` 并重启 ACE-Step API。

### 60 秒曲卡在「Decoding audio / queued」直至超时

- **根因**：`ACESTEP_OFFLOAD_DIT_TO_CPU` 默认 false，DiT 常驻 A770；60s latent 解码前显存仅剩 ~0.17GB，ACE 自动切 **CPU VAE**，长音频 tiled decode 易卡死；API 仍应答 `/query_result`，Ada 假进度爬到 90% 后判超时。
- **修复**：`.env` / `spawn_api_for_ada.ps1` 开启 `ACESTEP_OFFLOAD_DIT_TO_CPU=true`；XPU 上低显存时优先卸 DiT 再走 XPU VAE，而非 CPU VAE；Ada 取消假进度，纯 `queued` 约 6 分钟无进展即失败提示重启。
- **处理**：重启 ACE-Step API 后再试；首次建议 30–60 秒、单曲。

- **任务结束后默认保留 ACE-Step 常驻**。腾显存：设置 → 本地运行时 → **释放显存**
- 环境变量：`ADACHAT_ACESTEP_MODEL=acestep-v15-base` 可强制默认模型

## 环境变量（可选）

| 变量 | 含义 |
|------|------|
| `ADACHAT_ACESTEP_ROOT` | ACE-Step 安装目录 |
| `ADACHAT_ACESTEP_URL` | API 基址，默认 `http://127.0.0.1:8001` |

## 多轨导出（DAW）

整曲生成后，气泡旁 **导出多轨(DAW)** 会用本机 **Demucs** 拆成四轨 WAV 并打包 ZIP（鼓 / 贝斯 / 其它 / 人声 + mix）。

- 安装：`tools/demucs/setup.ps1`（详见 `tools/demucs/README.md`）
- 需 ffmpeg；默认 CPU（首次下载 htdemucs 权重）

## 相关文件

- `backend/music/*`、`backend/actions/music.php`
- `src/ui/music-generate.js`、`src/ui/music-stems.js`
- `music_stems_demucs.py`、`tools/demucs/`
- 网关路由 `task=music` → `local_music`
