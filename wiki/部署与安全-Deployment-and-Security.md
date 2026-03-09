# 部署与安全 / Deployment and Security

## 部署方式总览 / Deployment Options

| 方式 | 适用场景 | 启动速度 |
|---|---|---|
| Docker（推荐） | Linux/Windows/macOS，想快速复制部署 | 快 |
| Docker 生产模式 | 需要健康检查、资源限制 | 中 |
| 原生 PHP + Nginx/Apache | 已有现成 Web 环境 | 中 |
| Windows 安装包 | 单机快速使用 | 最快 |

---

## Docker 快速部署（推荐）/ Docker Quick Deploy (Recommended)

### 1) 准备环境
- 安装 Docker Desktop 或 Docker Engine + Compose

### 2) 设置登录密码
```bash
cp docker.env.example .env
```
编辑 `.env`，修改：
```env
ADA_LOGIN_PASSWORD=change-this-to-a-strong-password
```

### 3) 启动
```bash
docker compose up -d --build
```

### 4) 访问
```text
http://localhost:8920/login.php
```

### 5) 停止
```bash
docker compose down
```

---

## Docker 生产模式 / Docker Production Mode

在基础 compose 上叠加生产配置（健康检查 + 资源限制 + no-new-privileges）：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

停止：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

---

## 预构建镜像部署（GHCR）/ Prebuilt Image (GHCR)

```bash
docker pull ghcr.io/saviorwq/ada-chat:latest
docker run -d --name adachat -p 8920:80 -e ADA_LOGIN_PASSWORD=your-password -v ./ai_data:/var/www/html/ai_data ghcr.io/saviorwq/ada-chat:latest
```

---

## 运行环境
- PHP 8.0+
- 扩展：`curl` `json` `mbstring` `openssl` `fileinfo`
- Nginx/Apache

## 原生 PHP 部署 / Native PHP Deployment

1. 上传项目到 Web 根目录（或子目录）
2. 设置环境变量 `ADA_LOGIN_PASSWORD`
3. 确保 `ai_data/` 可写
4. 使用 Nginx/Apache 反向代理或直接站点托管 `login.php`

## Nginx 必配规则
```nginx
location ~ ^/(ai_data|ssl|php)/ {
    deny all;
    return 403;
}

location ~ /\. {
    deny all;
    return 403;
}
```

## 安全建议
- 改默认密码
- 启用 HTTPS
- 备份 `ai_data/`
- 发布前检查 `.gitignore`

## 插件安全基线
- 新插件默认禁用，需手动启用。
- 插件仅允许受控钩子：`beforeBuildRequest`、`beforeSend`、`afterResponse`。
- 钩子执行有超时保护，连续异常会自动禁用插件。
- 插件元信息在 UI 中会做转义渲染，降低注入风险。
- 插件资源加载有目录边界校验与文件名校验，避免路径穿越。
