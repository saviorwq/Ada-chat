# 新手完整教程 / Beginner Guide

目标：从 0 到 1 完成一次“能正常问答”的配置。  
Goal: finish one successful chat from scratch.

> 本页讲“完整理解和最佳实践”；  
> 需要按图点击请看：[首日上手流程 / First Day Guide](首日上手流程-First-Day-Guide)

## 第 0 步：准备 / Prerequisites
- 可用 API Key
- 可访问 API 的网络
- Windows 用户建议安装包方式

## 第 1 步：下载启动 / Download and Launch
- Windows：`AdaChat_Setup_v1.1.0.exe`
- Linux/macOS：`AdaChat_v1.1.0.tar.gz`
- Docker：执行 `cp docker.env.example .env && docker compose up -d --build`
- 需要生产模式：`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`

## 第 2 步：登录 / Login
- 默认密码：`admin123`

## 第 3 步：新增供应商 / Add Provider
- 填写 Name / Base URL / API Key
- 点击 `获取最新模型`
- 勾选并 `保存模型选择`

## 第 4 步：首次测试 / First Test
- 主界面选择分类、供应商、模型
- 发送：`你好，请用一句话介绍你自己。`

## 第 5 步：上线前建议 / Before Production
1. 修改默认密码
2. 启用 HTTPS
3. 拦截敏感目录：`ai_data/` `ssl/` `php/`

## 关键概念（新手必看）/ Key Concepts
- **供应商 Provider**：你的 API 平台配置（地址和密钥）
- **模型 Model**：具体调用的 AI 能力
- **分类 Category**：决定当前请求走聊天、编程、图像、OCR 等哪条路径
- **保存模型选择**：不保存就不会出现在主界面下拉框里
- **模型总设置**：统一管理聊天参数（temperature、top_p、max_tokens 等），用于控制“稳定度/创意度/长度/重复率”

## 排错入口 / Troubleshooting Entry
- [故障排查 / Troubleshooting](故障排查-Troubleshooting)
- [常见问题 / FAQ](常见问题-FAQ)
