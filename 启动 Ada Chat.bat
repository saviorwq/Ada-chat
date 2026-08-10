@echo off
REM ============================================================
REM  Ada Chat — 一键启动（托盘图标）
REM  任务栏右下角会出现图标（可能需点 ^ 展开）
REM  右键菜单：打开网页 / 仅停止 GPU(llama) / 停止全部并退出
REM  也可运行「停止 Ada Chat.bat」或侧边栏「安全退出」
REM ============================================================
chcp 65001 >nul 2>&1
cd /d "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"

REM -Sta 托盘 NotifyIcon 必需 / STA required for NotifyIcon
"%PS%" -NoProfile -ExecutionPolicy Bypass -Sta -File "%~dp0AdaChatTray.ps1"
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" (
  echo.
  echo [ERROR] start failed, code=%EC%
  pause
)
exit /b %EC%
