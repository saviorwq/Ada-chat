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

A: 启用本地图像功能后，扫描本机 Diffusers/单文件模型；需安装 `requirements-local-image.txt` 依赖。Intel Arc 走 **XPU**。出图偏题时先关掉「角色预设」（设置里的提示词预设，如「写实人像」），或改用英文/标签提示词。

## Q: 人物脸部预设 / 锁脸怎么用？还要每次上传脸图吗？

A: **不用每次上传脸图。**

1. **设置 → 对话与能力 → 人物脸部预设**：上传清晰正脸并命名保存（或图像工具栏「存为人物」）。
2. 图像模式下拉选择该人物；**文生图**即可锁脸（无需构图图）。
3. **图生图**：上传图只作构图/换装；脸来自人物预设。
4. 依赖：`insightface`、`opencv-python-headless` 等（见 `requirements-local-image.txt`）；改代码或依赖后请 **重启 Image Worker / Ada Chat**。
5. 提示词宜含「半身、正面清晰人脸」；远景/侧脸可能导致「生成图未检测到人脸」。说明见 `docs/face-identity-character-library.md`。

## Q: 本地除了 Z-Image，还能用 SD / SDXL 吗？

A: **可以。** Runtime 已支持 **SD1.5 / SDXL（Diffusers 目录或单文件 ≥约 1.5GB）+ Z-Image（Diffusers 整包）**。在图像分类下拉切换模型即可；换模前建议等上一张出完，Worker 会卸权重再加载。  
本机 `D:\models` 常见可用项示例：`Z-Image-Turbo`、`sdxl/wai-nsfw-illustrious-v140`、Pony 单文件 checkpoint。若列表异常，到本地供应商里重新「扫描本地模型」。**Flux / SD3 仍非 MVP。** 没有 SD1.5 权重时需自行放入 models 目录后再扫描。

**中文提示词**：SD/SDXL 的 CLIP 对中文很弱。出图前若检测到中文，会**优先用本机 Hy-MT2 GGUF 专业翻译**（`tencent/Hy-MT2-1.8B-GGUF` 放到 `D:\models`），失败再回退 Vulkan 聊天模型。Z-Image 不译。  
关闭：`ADACHAT_IMAGE_TRANSLATE_PROMPT=0` 或 `ai_data/features/image_prompt_translate_off`。指定文件：`ADACHAT_IMAGE_TRANSLATE_GGUF=完整路径.gguf`。

## Q: Hy-MT 能当翻译模型 / 给其他模型当工具吗？

A: **可以，且不是插件。**

1. **🌐 翻译模式**：把 `Hy-MT2` GGUF 放进本地 `models` 目录并「扫描本地模型」；类型会识别为 `translation`。选中后发**纯文本**会直连 Hy-MT（不走普通聊天补全）。带图翻译仍走 OCR/视觉管线。  
2. **内置工具 `adachat__translate`**：在「插件管理」里开启 **Tool Calling**，并保持内置 `adachat__translate` 勾选。其它支持工具调用的对话模型可自动调用本机 Hy-MT（角色卡工具白名单里也可勾选）。本地「直连」引擎暂不挂工具。  
3. 依赖：`pip install llama-cpp-python`；可选环境变量 `ADACHAT_IMAGE_TRANSLATE_GGUF`。

## Q: Windows 怎么无黑窗启动？

A: 使用安装目录里的 **`AdaChatTray.bat`**（系统托盘），或 **`启动 Ada Chat.bat`**（带控制台日志）。
