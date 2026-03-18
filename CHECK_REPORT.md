# Ada Chat 项目检查报告

生成时间：2026-03-10

## 一、端口配置

| 项目 | PHP 端口 | Vite 端口 | 说明 |
|------|----------|-----------|------|
| g:\Ada Chat | 8920 | - | start-hidden.vbs 启动（无窗口） |
| AdaChat-Release | 8920 | 5173 | start.bat + npm run dev |

- **Vite** 将 `/ai_proxy.php`、`/api.php`、`/_api_test` 代理到 `127.0.0.1:8920`
- **PHP** 必须先在 8920 运行，Vite 代理才能正常工作

---

## 二、已修复项

### 1. _api_test 调试接口

**问题**：访问 `http://127.0.0.1:8920/_api_test` 时显示 Vite 页面而非 JSON。

**原因**：两边的 `router.php` 都没有对 `/_api_test` 做处理。

**修复**：已在 **g:\Ada Chat** 和 **AdaChat-Release** 的 `router.php` 中添加：

```php
if ($path === '/_api_test' || $path === '/api_test.php') {
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['ok' => true, 'msg' => 'test']);
    return true;
}
```

**验证**：先运行 `start.bat` 启动 PHP，再访问 `http://127.0.0.1:8920/_api_test`，应看到 `{"ok":true,"msg":"test"}`。

---

## 三、可能原因：8920 显示 Vite 页面

若访问 8920 仍看到「Ada Chat (Vite Dev)」和「新建对话」：

1. **8920 上实际跑的是 Vite**  
   检查是否用 `vite --port 8920` 或类似命令启动，或环境变量覆盖了端口。

2. **启动顺序**  
   正确顺序：先 `start.bat`（PHP 8920），再 `npm run dev`（Vite 5173）。

3. **访问入口**  
   - PHP 完整版：`http://127.0.0.1:8920/login.php` → `AI.php`
   - Vite 开发：`http://127.0.0.1:5173/`（不要用 8920 访问 Vite）

---

## 四、AdaChat-Release 与 g:\Ada Chat 差异

### ai_proxy.php

| 项目 | 类型 | 说明 |
|------|------|------|
| g:\Ada Chat | 完整版 | 支持 action=get_providers、save_provider、stream chat 等 |
| AdaChat-Release | 精简版 | 仅支持 chat 流式转发，**无** get_providers 等 |

**影响**：在 AdaChat-Release 中用 `AI.php`（供应商、设置等）时，`ai_proxy.php` 不支持 `action=get_providers`，会一直显示「暂无供应商」。

**建议**：若要在 AdaChat-Release 使用完整 AI.php，需将 `g:\Ada Chat\ai_proxy.php` 复制并覆盖到 AdaChat-Release。若 AdaChat-Release 只打算用 Vite 精简聊天，可保持现有精简版。

---

## 五、文件同步建议

若希望两边功能一致，可将以下文件从 `g:\Ada Chat` 同步到 `AdaChat-Release`：

| 文件 | 说明 |
|------|------|
| ai_proxy.php | 完整后端 API |
| router.php | 已添加 _api_test，已同步 |
| script.js | 供应商加载、安全退出等 |
| adachat-provider-models.js | 供应商编辑、CSRF 等 |

**注意**：Trea 可能在 AdaChat-Release 开发，覆盖前建议备份或先沟通。

---

## 六、推荐使用流程

### 仅使用 PHP 完整版（g:\Ada Chat）

1. 进入 `g:\Ada Chat`
2. 运行 `start-hidden.vbs`（推荐，无窗口）或 `start.bat`（调试用）
3. 访问 `http://127.0.0.1:8920/login.php`

### 同时用 PHP + Vite 开发（AdaChat-Release）

1. 进入 `AdaChat-Release`
2. 先运行 `start.bat`（PHP 8920）
3. 再运行 `npm run dev`（Vite 5173）
4. PHP 版：`http://127.0.0.1:8920/login.php`
5. Vite 版：`http://127.0.0.1:5173/`

---

## 七、临时文件清理

- `g:\Ada Chat\api_test.php`：若存在可删除（`_api_test` 已内置到 router）
- `g:\Ada Chat\CHECK_REPORT.md`：本报告，可保留或删除
