## Gateway（网关模块）结构说明

这一层的目标是把 `ai_proxy.php` 入口“胶水化”：入口只做鉴权/Action 分发/调用网关入口，业务与执行细节都收敛到 `backend/gateway/*` 与 `backend/gateway/handlers/*`。

根目录 `ai_proxy.php` 现为**薄入口**（`require` + 调用），编排顺序在 **`backend/entrypoints/ai_proxy_entry.php`**；约定与例外见 [`../entrypoints/README.md`](../entrypoints/README.md)。

### 入口链路（chat/image/video）

- **入口文件**：`ai_proxy.php`（薄）→ `adachat_entry_ai_proxy()` in `backend/entrypoints/ai_proxy_entry.php`
  - session/登录/CSRF 校验
  - 如果带 `action` 参数 → 走 `backend/actions/entry.php`
  - 否则 → 调用 `backend/gateway/entry.php` 的 `adachat_gateway_entry()`

- **网关主入口**：`backend/gateway/entry.php`
  - `adachat_gateway_parse_input()`：解析并规范化输入（含 CYOA bypass 规则）
  - `adachat_gateway_resolve_model_and_provider()`：解析 `providerId::modelName` 并拿到 provider/apiKey
  - **`adachat_gateway_route_inference()`**（`router.php`）：表驱动 Hybrid 路由
    - `local_chat` → 本地直连 + 依赖预检
    - `local_video` → 异步视频任务（云端/本地由 video gateway 决定）
    - `blocked_local` → 本地直连不支持的任务（如 image）返回可读错误
    - `cloud_http` → 原有 curl 转发链路
  - `adachat_gateway_execute_routed()`：按路由执行（本地 SSE / 视频 job / HTTP）

### 关键模块职责

- **输入解析**：`backend/gateway/input.php`
- **模型/Provider 解析**：`backend/gateway/resolve_model.php`
- **任务调度**：`backend/gateway/dispatch_task.php`
  - 内部使用 `backend/gateway/routing.php` 选择 `apiPath` 与 `stream` 强制规则
- **请求 client 构造**：`backend/gateway/client.php`
- **响应执行/输出**：`backend/gateway/response_exec.php`

### Handler（按 task 拆分）

目录：`backend/gateway/handlers/`

- `chat.php`：RAG 注入（vector）+ 成本流水线（KV 命中早退/路由/滑窗/压缩/缓存对齐/智能 max_tokens）+ 429 probe/fallback + payload 构造
- `image.php`：payload 构造 + 429 probe/fallback（保持 `stream=false`）
- `video.php`：payload 构造 + 429 probe/fallback（保持 `stream=false`）

### 如何新增一个新 task

1. 新增 handler：`backend/gateway/handlers/<task>.php`
2. 在 `backend/gateway/routing.php` 加入默认 `apiPath`/stream 规则
3. 在 `backend/gateway/dispatch_task.php` 注册并返回统一结构（`provider/apiKey/apiPath/modelName/postData/stream/headers`）
4. 在前端/调用端传 `task=<task>`

