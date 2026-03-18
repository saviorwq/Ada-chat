@echo off
chcp 65001 >nul 2>&1
echo Stopping Ada Chat server...
taskkill /f /im php.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo Ada Chat server stopped.
) else (
    echo No running Ada Chat server found.
)
timeout /t 2 >nul
