# llama.cpp Vulkan（Intel Arc A770）

官方预编译 `llama-server`（Vulkan），供 Ada Chat 走 **本地 HTTP** 推理，避免编译 `llama-cpp-python`。

## 常驻（推荐）

登录后自动拉起（计划任务，不弹窗）：

```powershell
# 双击 install-autostart.cmd，或：
.\install-autostart.ps1
```

- 任务名：`AdaChat Llama Vulkan`（当前用户登录时执行）
- 实际逻辑：`ensure-llama-vulkan.ps1`（已健康则跳过，否则后台启动）
- 卸载：`.\uninstall-autostart.ps1`（加 `-AlsoStopServer` 可一并停服务）

手动保活（不注册任务）：

```powershell
.\ensure-llama-vulkan.ps1
```

## 前台启动（调试）

双击 `start-llama-vulkan.cmd`，或：

```powershell
.\start-llama-vulkan.ps1
# 换模型 / 端口：
.\start-llama-vulkan.ps1 -Model "D:\models\xxx.gguf" -Port 8080 -GpuLayers 999 -Ctx 4096
```

就绪后：`http://127.0.0.1:8080/v1`（健康检查 `/health`）。

默认上下文 **16384**（`-c`）。若出现 `exceeds the available context size`，用更大 `-Ctx` 重启，或把上传文件拆小。

## Ada Chat

1. **必须先启动**本目录的 `llama-server`（双击 `start-llama-vulkan.cmd`）。未启动时本地对话会失败或极慢。
2. 设置 → 供应商 → 选 **本地供应商 (GPU)**（指向 `http://127.0.0.1:8080/v1`，Vulkan / Arc A770）。
3. 对话模型用当前已加载的 GGUF（默认 `Josiefied-Qwen3-8B-abliterated-v1.Q4_K_M.gguf`）。
4. 任务管理器 → GPU → **Intel Arc A770**：推理时应有 3D/Compute 占用；若只有 CPU 满载，说明仍在走旧的 direct/CPU。

当前服务一次只加载一个模型；换模型需改启动参数后重启 `llama-server`。

## 换模型

每次只能加载一个 GGUF。改脚本参数或命令行 `-m` / `-a` 后重启服务；Ada 里模型 id 需与 `-a` 别名一致。

## 多 GPU

若 Vulkan 设备多于一块，可在启动前设置：

```powershell
$env:GGML_VK_VISIBLE_DEVICES = "0"   # 按 vulkaninfo 序号选 Arc
```
