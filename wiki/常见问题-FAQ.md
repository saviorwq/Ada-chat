# 常见问题 / FAQ

## Q: 登录失败？

A: 优先级为 **`ai_data/.auth_password`（设置→安全）** > **`ADA_LOGIN_PASSWORD` 环境变量** > **默认 `admin123`**。若你在设置里改过密码，环境变量与默认密码都不会再生效，直到删除该文件或再次在设置中修改。

## Q: 供应商或模型是空的？

A: 先新增供应商，再“获取最新模型”，最后保存模型选择。

## Q: 发消息没回复？

A: 检查 Base URL、API Key、模型类型与返回码。

## Q: 会泄露 API Key 吗？

A: 关键在部署，必须拦截 `ai_data/` `ssl/` `php/`，并启用 HTTPS。

## Q: 回答下方按钮有什么用？

A: `📋` 复制回答，`🔄` 重回答（文生图支持重回答）。

## Q: 当前版本是多少？去哪下载？

A: 当前为 **v1.2.0**。Windows 安装包 `AdaChat_Setup_v1.2.0.exe`，便携包 `AdaChat_v1.2.0.tar.gz`：https://github.com/saviorwq/Ada-chat/releases/tag/v1.2.0

## Q: 本地文生图怎么用？

A: 启用本地图像功能后，扫描本机 Diffusers/单文件模型；需安装 `requirements-local-image.txt` 依赖。Intel Arc 走 **XPU**。出图偏题时先关掉角色预设，或改用英文/标签提示词。

## Q: Windows 怎么无黑窗启动？

A: 使用安装目录里的 **`AdaChatTray.bat`**（系统托盘），或 **`启动 Ada Chat.bat`**（带控制台日志）。
