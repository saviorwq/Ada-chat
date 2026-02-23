# Ada Chat 更新日志 / Changelog

## v1.0.1 (2026-02-23)

### 安全修复 / Security Fixes
- **新增 `router.php` 安全路由** — 拦截对 `/ai_data/`、`/ssl/`、`/php/` 目录的直接 Web 访问，返回 403 Forbidden，防止 API Key 等敏感数据泄露
- **Nginx 部署安全建议** — README 中新增 Nginx 配置说明，提醒用户添加 `deny all` 规则保护数据目录（`.htaccess` 仅对 Apache 生效，Nginx 需手动配置）

### Windows 安装包 / Windows Installer
- **内置 PHP 8.3.29 运行时** — 无需用户额外安装 PHP，开箱即用
- **自动安装 Visual C++ 运行库** — 安装时自动检测，未安装则静默安装 VC++ Redistributable 2015-2022
- **系统兼容性检查** — 仅支持 64 位 Windows 8.1 / 10 / 11，安装时自动校验
- **一键启动** — 通过 `start.bat` 启动 PHP 内置服务器，自动打开浏览器访问 `http://127.0.0.1:8920`
- **安装完成提示** — 显示默认密码 (`admin123`)、修改方法、首次配置指南

### 新增文件 / New Files
- `router.php` — PHP 内置服务器安全路由脚本
- `start.bat` — Windows 一键启动脚本
- `stop.bat` — Windows 停止服务脚本
- `使用说明.txt` — 中文使用指南（含默认密码、配置步骤）
- `ssl/cacert.pem` — CA 证书包，确保 HTTPS API 调用正常

### 发行包 / Distribution
- `AdaChat_Setup_v1.0.exe` — Windows 一键安装包 (44 MB)
- `AdaChat_v1.0.tar.gz` — Linux / macOS 部署包 (0.3 MB，需自备 PHP 8.0+ 环境)
