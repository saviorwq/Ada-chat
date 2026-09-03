# Ada Chat — 本地 GPU 支持矩阵 / Local GPU Support

> **口径（诚实优先）**：主推并实机验证 **Intel Arc**；NVIDIA / AMD 按能力分层标注，**无对应显卡实机验收前不写「官方支持」**。

## 总览

| 能力 | Intel Arc（如 A770） | NVIDIA（CUDA） | AMD |
|------|----------------------|----------------|-----|
| 本地聊天（Vulkan `llama-server`） | ✅ 已验证 | ✅ 可用（Vulkan） | ✅ 可用（Vulkan，视驱动） |
| 本地出图（Diffusers） | ✅ **已验证**（XPU） | 🟨 **实验**：代码已选 `cuda`，**未实机验收** | ❌ **不保证**（Win 上 ROCm 不可用） |
| 本地音乐（ACE-Step） | ✅ **已验证**（XPU） | 🟨 **实验**：上游多走 CUDA，**未实机验收** | ❌ **不保证** |
| Demucs 多轨 | ✅ CPU 即可（默认） | ✅ CPU / 可选 CUDA | ✅ CPU |

设备优先序（出图 bridge）：`xpu > cuda > cpu`（见 `image_inference_bridge.py` / Runtime doctor）。

## 含义说明

- **已验证**：在维护者本机（Intel Arc A770）跑通文生图 / Cover / Runtime 互斥等主路径。
- **实验 / 社区**：代码路径存在或上游通常支持；欢迎有卡用户按下方清单回填 Issue，**在此之前请当「可能可用」**。
- **不保证**：Windows 上无稳定一等公民栈（尤其 AMD + Diffusers / ACE）；请用云端供应商或 CPU（极慢）。

## NVIDIA 社区冒烟清单（有卡时）

1. 安装 **CUDA 版** PyTorch（与本机驱动匹配），再装 `requirements-local-image.txt`。
2. Runtime / doctor 应显示 `cuda: true`；出一张 SDXL 或 Z-Image。
3. ACE-Step：用 CUDA 环境起 API，跑一条短 Cover / 文生音乐。
4. 确认「释放显存」与出图/音乐互斥仍符合预期（勿并行占满同一张卡）。
5. 在 Issue 注明：型号、驱动、VRAM、torch 版本、成功/失败步骤。

## AMD（当前建议）

- **可以做**：Vulkan 本地聊天。
- **先别指望**：本机 Diffusers 出图、ACE-Step 音乐在 Windows 上稳定加速。
- Linux + ROCm 若社区验证通过，再单独升格文档状态。

## 相关文档

- 出图：`docs/v1.5-local-image-runtime.md`
- 音乐：`docs/music-generation.md`
- Runtime：`docs/local-runtime-manager.md`
