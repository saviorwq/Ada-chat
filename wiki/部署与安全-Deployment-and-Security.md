# 部署与安全 / Deployment and Security

## 运行环境
- PHP 8.0+
- 扩展：`curl` `json` `mbstring` `openssl` `fileinfo`
- Nginx/Apache

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
