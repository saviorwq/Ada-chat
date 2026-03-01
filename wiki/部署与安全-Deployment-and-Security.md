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

## 插件安全基线
- 新插件默认禁用，需手动启用。
- 插件仅允许受控钩子：`beforeBuildRequest`、`beforeSend`、`afterResponse`。
- 钩子执行有超时保护，连续异常会自动禁用插件。
- 插件元信息在 UI 中会做转义渲染，降低注入风险。
- 插件资源加载有目录边界校验与文件名校验，避免路径穿越。
