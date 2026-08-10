# 本地模型直连推理

Ada Chat 支持**不经过 Ollama**，直接加载本机 `.gguf` 与 `safetensors` 模型进行聊天推理。

## 原因说明（旧版为何失败）

此前「本地供应商」配置为 `http://localhost:11434/v1`（Ollama OpenAI 兼容端点）：

1. **必须先启动 Ollama 服务**，否则 `fetch_models` 与聊天请求均失败
2. 模型列表来自 Ollama 注册名，**磁盘上的 GGUF 文件不会自动出现**
3. PHP 网关仅做 HTTP 转发，**没有内置推理能力**

## 新版流程

1. 设置 → 供应商 → **本地供应商**
2. 推理方式选 **直连文件（GGUF / Safetensors）**
3. 将模型放入 `D:\models`（或自定义目录；留空时若存在 `D:\models` 会自动使用）
4. 点击 **扫描本地模型** → 勾选启用 → 保存
5. 主界面选择 `本地供应商::你的模型文件名.gguf` 开始对话

## 安装 Python 依赖

**分层安装（推荐）：**

```bash
# 聊天 GGUF / Safetensors 直连
pip install -r requirements-local-inference.txt

# 可选：本地文生视频（safetensors Wan；云端 API 无需此项）
pip install -r requirements-local-video.txt
```

- **GGUF**：`llama-cpp-python`（推荐，支持 CPU/GPU 如 Intel A770）
- **Safetensors 聊天**：另需 `torch transformers`
- **Safetensors 视频**：见 `requirements-local-video.txt`

设置 → 供应商 → 本地直连 时会自动检测依赖；未安装时界面会提示上述命令，而不是直接 500。

## 技术路径

| 组件 | 文件 |
|------|------|
| Python 桥 | `local_inference_bridge.py` |
| PHP 网关 | `backend/local_inference/gateway.php` |
| 供应商扫描 | `ai_proxy.php?action=fetch_models`（直连模式自动走 scan） |

## 说明

- **向量 RAG** 嵌入仍可能使用 Ollama（`rag_vector_bridge.py`），与聊天推理分离
- 本地直连模式会**绕过省钱策略流水线**，避免把请求路由到云端模型
