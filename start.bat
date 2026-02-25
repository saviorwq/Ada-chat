@echo off
chcp 65001 >nul 2>&1
title Ada Chat Server

set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"
set "PHP_EXE=%APP_DIR%\php\php.exe"
set "PHP_INI=%APP_DIR%\php\php.ini"
set "WEB_ROOT=%APP_DIR%"
set "HOST=127.0.0.1"
set "PORT=8920"
set "CACERT=%APP_DIR%\ssl\cacert.pem"
set "ROUTER=%APP_DIR%\router.php"

if not exist "%PHP_EXE%" (
    echo [ERROR] PHP not found: %PHP_EXE%
    echo Please reinstall Ada Chat.
    pause
    exit /b 1
)

set "PHP_INI_SCAN_DIR="

echo ============================================
echo        Ada Chat - Multimodal AI Assistant
echo ============================================
echo.
echo  Starting server at http://%HOST%:%PORT%
echo  Press Ctrl+C to stop the server.
echo ============================================
echo.

start "" "http://%HOST%:%PORT%/login.php"

if exist "%ROUTER%" (
    "%PHP_EXE%" -c "%PHP_INI%" -d curl.cainfo="%CACERT%" -d openssl.cafile="%CACERT%" -S %HOST%:%PORT% -t "%WEB_ROOT%" "%ROUTER%"
) else (
    echo [WARN] router.php not found, starting without router: %ROUTER%
    "%PHP_EXE%" -c "%PHP_INI%" -d curl.cainfo="%CACERT%" -d openssl.cafile="%CACERT%" -S %HOST%:%PORT% -t "%WEB_ROOT%"
)
