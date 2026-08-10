@echo off
REM 双击启动 Vulkan llama-server / Double-click to start
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-llama-vulkan.ps1" %*
pause
