# Ada Chat v1.3.0 发布说明 / Release Notes

发布日期：2026-09-02  
Release date: 2026-09-02

GitHub：https://github.com/saviorwq/Ada-chat

## 重点更新 / Highlights

### 🎵 本地音乐（ACE-Step 1.5）
- 分类 **🎵 音乐生成**：本机常驻 ACE-Step API（默认 `127.0.0.1:8001`）文生音乐。
- **Cover 伴奏**：上传 Suno WAV/MP3 → 纯配器 Cover → 气泡内播放/下载。
- **导出多轨(DAW)**：Demucs 四轨 + 仅人声 / 仅伴奏 ZIP（`tools/demucs/setup.ps1`）。
- Windows 下 music worker 经 **计划任务脱离 PHP Job Object**，避免 `release_task` 连不上本机 `:8001`。
- Cover **再生成**会恢复任务类型、强度与源音频 id；源音频 24h 过期会明确提示重新上传。
- 详解：[docs/music-generation.md](docs/music-generation.md)

### 🎨 本地图像增量
- **人物脸部预设** + InsightFace 锁脸；图生图换装/换场。
- Diffusers **Z-Image / SD / SDXL** 本地扫描与 Arc XPU 路径加固（OOM 提示更清晰）。
- Local Runtime / Image Worker 常驻与释放显存协同。

## 升级建议 / Upgrade Tips

1. 拉取后执行 **`npm run build`**，浏览器 **Ctrl+F5**。
2. 音乐：安装 ACE-Step 1.5，建议先双击 `启动ACE-Step-API.bat`；确认 http://127.0.0.1:8001/health 为 ok。
3. 多轨：运行 `tools/demucs/setup.ps1`（Python 3.11 + ffmpeg）。
4. **Cover 生成中途不要点「释放显存」**（会停掉 ACE）；与出图 Worker 勿并行抢 A770。
5. 图像人物预设见 `docs/face-identity-character-library.md`。

## 已知注意 / Notes

- 安装包 `AdaChat_Setup_*.exe` 若尚未重打，可直接用本仓库绿色目录 + `npm run build` 使用 v1.3.0 能力。
- Cover 偶发微弱哼鸣：降低 Cover 强度至约 0.7，或在 DAW 剪掉。
- 源音频落在系统 temp，**24 小时**过期需重新上传。

## 发行包 / Packages

- 源码 / 绿色目录：本仓库 `main`（本说明对应提交含音乐闭环）
- Windows 安装包：待打 `AdaChat_Setup_v1.3.0.exe` 后见 GitHub Releases
