@echo off
REM 绿色免安装：托盘图标启动（无控制台；右键托盘可停 GPU / 全部退出）
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Sta -File "%~dp0AdaChatTray.ps1"
if errorlevel 1 pause
