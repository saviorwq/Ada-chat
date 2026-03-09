# 首日上手流程 / First Day Guide

照着这 8 步做，通常 30 分钟内能跑通。  
Follow these 8 steps to get running quickly.

> 本页是“图文操作手册”。  
> This page is the click-by-click visual guide.

## 1) 安装并打开 / Install and Open
- 安装 `AdaChat_Setup_v1.1.0.exe`
- 打开 `http://127.0.0.1:8920`
- Docker 方式可改为：`cp docker.env.example .env && docker compose up -d --build`

![Step 1 安装与启动 / Install and launch](images/step1-install-launch.png)

## 2) 登录 / Login
- 输入默认密码 `admin123`

![Step 2 登录页 / Login page](images/step2-login.png)

## 3) 新增供应商 / Add Provider
- 填 Name / Base URL / API Key

![Step 3 供应商配置 / Provider setup](images/step3-provider.png)

## 4) 获取并保存模型 / Fetch and Save Models
- 点击 `获取最新模型`
- 勾选模型并保存

![Step 4 模型勾选 / Model selection](images/step4-model-select.png)

## 5) 发第一条消息 / Send First Message
- 选择 `💬 对话`
- 发送测试语句

![Step 5 首条对话 / First chat](images/step5-first-chat.png)

## 6) 学两个按钮 / Learn Two Action Buttons
- `📋` 复制回答
- `🔄` 重回答

![Step 6 回答操作按钮 / Message action buttons](images/step6-message-actions.png)

## 7) 调整模型总设置 / Tune Model General Settings
- 打开设置中的“模型总设置”
- 新手先用：`temperature=0.7`、`top_p=1`
- 如果答复太短，再调高 `max_tokens`

## 8) 不通就排错 / Troubleshoot If Needed
- 看 [故障排查 / Troubleshooting](故障排查-Troubleshooting)

![Step 7 排错路径 / Troubleshooting path](images/step7-troubleshooting.png)

## 截图文件规范 / Screenshot Naming Rules

- 建议放在 `wiki/images/`
- 文件名使用本页已引用名称，避免链接失效
- 推荐宽度 1400~1800px，PNG 格式
