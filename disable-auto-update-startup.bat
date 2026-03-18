@echo off
setlocal

set "STARTUP_FILE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AdaChat-AutoUpdate.bat"

if exist "%STARTUP_FILE%" (
    del /f /q "%STARTUP_FILE%"
    echo [DONE] Startup auto-update disabled.
) else (
    echo [INFO] Startup file not found: %STARTUP_FILE%
)

exit /b 0
