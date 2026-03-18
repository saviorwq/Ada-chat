@echo off
setlocal

set "APP_DIR=G:\Ada Chat"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "STARTUP_FILE=%STARTUP_DIR%\AdaChat-AutoUpdate.bat"

if not exist "%APP_DIR%\auto-update-loop.ps1" (
    echo [ERROR] Missing: %APP_DIR%\auto-update-loop.ps1
    exit /b 1
)

if not exist "%STARTUP_DIR%" (
    echo [ERROR] Startup folder not found: %STARTUP_DIR%
    exit /b 1
)

(
echo @echo off
echo powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%\auto-update-loop.ps1"
) > "%STARTUP_FILE%"

echo [DONE] Startup auto-update enabled.
echo [INFO] Startup entry: %STARTUP_FILE%
echo [INFO] It checks updates every 60 minutes after login.
exit /b 0
