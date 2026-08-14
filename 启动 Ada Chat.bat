@echo off
setlocal
REM UTF-8 code page first - avoid CMD mangling later lines on Chinese Windows
chcp 65001 >nul 2>&1
cd /d "%~dp0"

REM One-click start (system tray). Right-click tray: open / stop GPU / quit all.
REM Also: "stop Ada Chat.bat" or sidebar Safe Quit.

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"

REM -Sta required for NotifyIcon
"%PS%" -NoProfile -ExecutionPolicy Bypass -Sta -File "%~dp0AdaChatTray.ps1"
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" (
  echo.
  echo [ERROR] start failed, code=%EC%
  pause
)
exit /b %EC%
