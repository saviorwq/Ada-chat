# Ada Chat Plugin API（v1.3）

> Hooks + **Tool Calling** 已接通。工具在浏览器侧执行，经 OpenAI-compatible `tools` / `tool_calls` 回灌模型。

## 注册方式

```javascript
AdaPlugin.register({
  id: 'weather',
  name: 'Weather',
  version: '0.1.0',
  description: '查询天气',
  hooks: ['beforeSend', 'afterResponse'],
  tools: [
    {
      name: 'getWeather',
      description: '按城市查询天气',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名' },
        },
        required: ['city'],
      },
      readOnly: true,
      execute({ city }) {
        return { temp: 22, city }
      },
    },
  ],
  beforeSend() {
    return true
  },
  afterResponse() {
    return true
  },
})
```

工具在请求里会变成：

```text
function.name = "<pluginId>__<toolName>"
例：weather__getWeather
```

## 运行时流程

```text
用户消息
  → 收集已启用插件的 tools
  → 非流式请求（tool_choice=auto）
  → 若返回 tool_calls：execute → role:tool 回灌
  → 最多 3 轮，得到最终文本
```

- 全局开关：设置 → 插件管理 → **启用 Plugin Tool Calling**（默认开）
- 单工具开关：每个插件卡片下的 Tools 勾选
- **本地直连 GGUF** 暂不注入 tools（云端 / OpenAI 兼容 API 可用）

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 必填 |
| `hooks` | string[] | `beforeBuildRequest` / `beforeSend` / `afterResponse` |
| `tools[].name` | string | `[a-zA-Z0-9_]{1,64}` |
| `tools[].parameters` | object | JSON Schema（OpenAI function parameters） |
| `tools[].execute` | function | `(args, ctx) => result`；超时约 8s |
| `tools[].readOnly` | bool | 默认 `true`（约定；写操作请显式 `false`） |

## 安全基线

- 新插件默认 **禁用**
- 工具默认需插件启用 + 工具勾选
- 钩子 / 工具均有超时与错误熔断
- 详见 Wiki：插件安全基线

## 示例

`plugins/example-hello/`：

1. 设置 → 插件管理 → 启用 **Hello Example**
2. 确认 Tool Calling 总开关开启
3. 对话：「现在几点？请用工具查询」

## 路线图

| 版本 | 能力 |
|------|------|
| v1.2 | register + hooks + tools 声明 |
| v1.3 | Tool Router + 执行回灌 + 权限开关 |
| 后续 | 流式 tool_calls、沙盒、CYOA 写操作 tools |
