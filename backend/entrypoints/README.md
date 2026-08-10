# `backend/entrypoints/` — 根目录薄入口对应的控制器

## 目的 / Purpose

把 **Web 可访问的根目录 `*.php` 入口** 收敛为固定模式：**只做 `require_once` + 调用一个函数**，并把启动顺序、鉴权、分发等逻辑放在 `backend/` 内，避免根目录再次膨胀。

## 约定 / Convention

- **根目录入口**：`require_once __DIR__ . '/backend/entrypoints/<name>_entry.php';` 然后调用 `adachat_entry_<name>(__DIR__);`
- **实现文件**：放在本目录，函数名建议 `adachat_entry_*`（与根文件名对应，便于检索）。
- **不要**在根目录入口里堆业务逻辑（例外见下文 “必须留在根目录的 shim”）。

## 当前映射 / Current mapping

| 根入口 | 控制器 |
|--------|--------|
| `ai_proxy.php` | `backend/entrypoints/ai_proxy_entry.php` → `adachat_entry_ai_proxy()` |
| `api.php` | `backend/entrypoints/api_entry.php` → `adachat_entry_api()` |
| `cost_optimizer.php` | `backend/entrypoints/cost_optimizer_entry.php` → `adachat_entry_cost_optimizer()` |

与页面相关的薄入口在 `backend/pages/`（历史原因：视图也在该目录）：

| 根入口 | 控制器 |
|--------|--------|
| `AI.php` | `backend/pages/ai_page.php` → `adachat_pages_ai_entry()` |
| `vchat.php` | `backend/pages/vchat_page.php` → `adachat_pages_vchat_entry()` |
| `login.php` | `backend/pages/login_page.php` → `adachat_pages_login_entry()` |

## 必须留在根目录的 shim / Root shims that must stay

这些文件 **不建议** 再下沉一层 `entrypoints`（会改变路径语义或破坏工具约定）：

- **`router.php`**：`php -S` 路由脚本需要 `return ...` 语义；逻辑在 `backend/dev/builtin_server_router.php`。
- **`ai_config.php` / `vite-manifest.php`**：安装包与历史 `require` 仍指向根路径；实现分别在 `backend/config/ai_config.php`、`backend/vite/manifest.php`。
- **`gate_check.php`**：对外兼容入口；实现见 `backend/gate/check.php`。

## 插件 API 约束 / Plugin API constraint

`api.php` 的插件后端路由 **仍内联在** `backend/api/entry.php`（不拆独立路由文件）。`api_entry.php` 只负责调用顺序与 bootstrap。
