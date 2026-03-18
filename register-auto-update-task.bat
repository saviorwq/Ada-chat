@echo off
setlocal

set "TASK_NAME=AdaChat-AutoUpdate"
set "APP_DIR=G:\Ada Chat"
set "SCRIPT_PATH=%APP_DIR%\auto-update.ps1"

if not exist "%SCRIPT_PATH%" (
    echo [ERROR] Script not found: %SCRIPT_PATH%
    exit /b 1
)

echo [INFO] Enabling Startup auto-update loop...
call "%APP_DIR%\enable-auto-update-startup.bat"
if errorlevel 1 (
    echo [ERROR] Failed to enable Startup auto-update.
    exit /b 1
)

echo [DONE] Startup mode enabled (runs after login, every 60 minutes).

:run_first
echo [INFO] Running first update now...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PATH%"

echo [DONE] Auto-update bootstrap finished.
echo [INFO] View logs: %APP_DIR%\logs\auto-update.log
exit /b 0
