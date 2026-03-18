# Ada Chat Wiki

欢迎来到 Ada Chat 文档中心。  
Welcome to the Ada Chat documentation hub.

## 🚀 一键部署（优先看这里）/ One-command Deploy (Start Here)

> 推荐新用户优先使用 Docker 部署，最快、最稳、跨平台。  
> Docker deployment is recommended for most users: fast, stable, cross-platform.

### Docker 快速启动 / Docker Quick Start

```bash
cp docker.env.example .env
docker compose up -d --build
```

访问：`http://localhost:8920/login.php`

- 需要生产模式（健康检查 + 资源限制）：  
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
- 需要预构建镜像：见 [部署与安全 / Deployment & Security](部署与安全-Deployment-and-Security)

## 推荐阅读顺序 / Suggested Order
1. [新手完整教程 / Beginner Guide](新手完整教程-Beginner-Guide)
2. [首日上手流程 / First Day Guide](首日上手流程-First-Day-Guide)
3. [功能说明 / Feature Guide](功能说明-Feature-Guide)
4. [快速开始 / Quick Start](快速开始-Quick-Start)
5. [故障排查 / Troubleshooting](故障排查-Troubleshooting)
6. [常见问题 / FAQ](常见问题-FAQ)

## 其他页面 / More
- [部署与安全 / Deployment & Security](部署与安全-Deployment-and-Security)
- [插件安全基线 / Plugin Security Baseline](插件安全基线-Plugin-Security-Baseline)
- [模型总设置 / Model General Settings](模型总设置-Model-General-Settings)
- [发布说明 v1.1.1 / Release Notes v1.1.1](发布说明-v1.1.1-Release-Notes-v1.1.1)
- [更新日志索引 / Release Notes Index](更新日志索引-Release-Notes-Index)

## 当前版本 / Current Version
- `v1.1.1`
