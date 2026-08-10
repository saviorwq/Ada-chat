# 插件前端对接 / Plugin Frontend Bridge

本文说明**完整版（Vite full bundle）**下，插件或页面内联脚本如何访问主程序前端能力。  
This page describes how plugins or inline scripts can reach the main frontend APIs when running the **full Vite bundle** (`AI.php` + `dist/`).

## 适用场景 / Scope

- 仅当用户已打开 **完整版** 且 `src/full-app-entry.js`（Vite full bundle）已执行时，下列对象才可用。  
  Only available after the full bundle has loaded (not guaranteed on unrelated static pages).
- **精简版**（`vchat.php` / `index` 入口）不挂载同一套全局，请勿假定存在。  
  The slim entry does **not** expose the same surface.

## 推荐：`globalThis.__ADA_CHAT_FULL_APP__`

主程序在 `src/shim/install-full-app-globals.js` 中注册该对象，用于**按命名空间**引用各模块导出（比散落在 `window` 上的函数更易查阅）。  
The host registers this object in `src/shim/install-full-app-globals.js` so authors can discover APIs by namespace.

当前结构（以源码为准，版本演进时可能增删字段）：  
Current shape (see source for truth; keys may evolve between releases):

| 字段 / Key | 含义 / Meaning |
|------------|----------------|
| `escapeHtml` | 与 `appHelpers` 中一致的 HTML 转义工具 |
| `AdaChatModeConfig` | 模式与上传限制等配置 |
| `AdaChatI18n` | 中英文文案包 |
| `appHelpers` | `app-helpers.js` 命名空间导出 |
| `settingsShell` | 设置侧栏壳层 API |
| `helpUi` | 帮助/支持弹窗相关函数 |
| `autoSwitch` | 自动切换模型相关 API |
| `settingsUi` | 设置面板 UI 导出 |
| `pluginRuntime` | `PluginSystem`、`PluginStorage`、`MainApp` |
| `pluginManagerUi` | 插件管理 UI 导出 |
| `chatRender`、`conversations`、`debugTools`、`rag`、`upload`、`chatSendPipeline`、`providerModels`、`appUpdate`、`chatProfile`、`costOptimizerUi`、`securitySettingsUi`、`inputProviderBridge`、`mainAppBootstrap` | 各对应 `src/ui/*.js` 的 `export *` 命名空间 |

使用前请做存在性判断，避免主程序未加载完成时报错：  
Always guard access (bundle load order):

```js
const app = globalThis.__ADA_CHAT_FULL_APP__
if (app?.pluginRuntime?.PluginSystem) {
  // ...
}
```

## 兼容：`globalThis` 上的扁平函数

历史页面与部分插件依赖 **`globalThis` / `window` 上直接挂函数**（例如设置侧栏、发送管线中的工具函数）。完整版入口仍会批量暴露这些函数，与 `__ADA_CHAT_FULL_APP__` 并行存在。  
Legacy code may rely on **flat functions on `globalThis`**; the full entry still mirrors many exports there.

在浏览器里 **`globalThis` 与 `window` 为同一对象**；主程序 `src/ui` 内已统一通过 `globalThis` 读写约定字段，插件继续写 `window.xxx` 仍兼容。  
In browsers, **`globalThis` === `window`**; host `src/ui` code reads/writes shared state via `globalThis`, while plugins may still use `window.*` interchangeably.

上传与预览等**可变状态**的约定字段见 `src/shim/legacy-window-defaults.js`（如 `currentBase64`、`allModels`、`providers` 等）。  
Mutable upload/chat defaults are initialized per `src/shim/legacy-window-defaults.js`.

## 稳定度与安全 / Stability & security

- `__ADA_CHAT_FULL_APP__` 属于**便于集成的注册表**，**非 semver 承诺的公共 API**；大版本或重构时字段可能调整。  
  Treat it as an integration aid, not a semver-frozen public API.
- 插件仍须遵守 [插件安全基线 / Plugin Security Baseline](插件安全基线-Plugin-Security-Baseline.md)（钩子白名单、默认禁用、路径校验等）。  
  Plugins must still follow the security baseline (hook allowlist, default-off, path checks, etc.).
