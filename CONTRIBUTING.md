# 贡献指南 / Contributing

感谢你为 Ada Chat 贡献代码。

## 法律声明 / Legal

通过提交 Pull Request，你确认：

1. 你的贡献是原创，或你有合法授权提交该内容；
2. 你有权将该贡献授权给本项目；
3. 你同意该贡献在 **GPL-3.0** 下发布并分发。

## 开发流程 / Workflow

1. Fork 仓库并创建功能分支；
2. 保持改动最小化，补充必要注释与文档；
3. 提交前自测核心功能；
4. 提交 PR，说明改动动机、风险与测试结果。

## 代码风格 / Code Style

- 保持与现有代码风格一致；
- 避免引入未说明的新依赖；
- 新增配置项需有默认值与回退逻辑；
- 涉及安全逻辑时请附带说明。

## 许可证与文件头 / License Headers

新增源代码文件建议在文件头包含简版声明（示例）：

```text
Copyright (c) Ada Chat contributors
SPDX-License-Identifier: GPL-3.0-only
```

## 可选：DCO

如果后续启用 DCO，请在 commit message 添加：

`Signed-off-by: Your Name <you@example.com>`
