# Demucs 四轨导出（DAW）

Ada 用 **Demucs（htdemucs）** 把已生成整曲拆成 4 轨 WAV，打成 ZIP，便于导入 FL Studio / Ableton / Reaper 等。

## 前置

1. **Python 3.11**（推荐 `D:\Python311\python.exe`）
2. **ffmpeg** 在 PATH 中（混音转 WAV / 合成「仅伴奏」需要）
3. 安装环境（本机已装可跳过）：

```powershell
cd "G:\AdaChat Backup\AdaChat-Release"
powershell -ExecutionPolicy Bypass -File .\tools\demucs\setup.ps1
```

会创建 `tools/demucs/.venv`（CPU 版 torch + demucs）。可选环境变量：

| 变量 | 含义 |
|------|------|
| `ADACHAT_DEMUCS_PYTHON` | 覆盖 Demucs Python 路径 |
| `ADACHAT_DEMUCS_DEVICE` | 默认 `cpu`；有 NVIDIA CUDA 时可设 `cuda` |

## 使用

1. 先用 🎵 生成整曲并出现播放器
2. 气泡按钮：
   - **导出多轨(DAW)** → 完整 ZIP
   - **仅人声** / **仅伴奏** → 先分轨（可复用），再下载单轨 WAV
3. Demucs 在 CPU 上约数分钟（首次会下载模型权重）

ZIP 内：

- `00_mix.wav` — 原曲 WAV
- `01_drums.wav` / `02_bass.wav` / `03_other.wav` / `04_vocals.wav`
- `05_vocals_only.wav` — 仅人声（同 vocals，方便单文件使用）
- `06_instrumental.wav` — 仅伴奏（鼓+贝斯+其它，需 ffmpeg）
- `README.txt`

导入 DAW 时把各轨对齐到同一起点即可。

## 说明

- 多轨是 **后处理分轨**，不依赖 ACE Base `extract`
- 与出图/ACE-Step 尽量错开，避免抢 CPU/磁盘
- 任务目录：`ai_data/stem_jobs/`，产物：`ai_data/generated_stems/`
