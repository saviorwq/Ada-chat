## Actions（后台 action 路由）结构说明

`ai_proxy.php` 支持通过 `?action=...` 或 POST 传 `action` 调用后台管理类接口（providers/system/rag 等）。

### 入口链路

- `ai_proxy.php` 检测到 `$action` 后调用：
  - `backend/actions/entry.php` → `adachat_actions_entry($action)`

### 模块职责

- **入口**：`backend/actions/entry.php`
  - `adachat_actions_bootstrap_json_fatal()`：确保 fatal error 也返回 JSON（action 路径兜底）
  - `adachat_dispatch_actions($action)`：依次尝试各模块的 handler
  - 未命中则返回 `{"error":"Invalid action"}`

- **运行时兜底**：`backend/actions/runtime.php`
- **统一分发**：`backend/actions/dispatch.php`
- **具体模块**
  - `backend/actions/system.php`
  - `backend/actions/providers.php`
  - `backend/actions/rag.php`

