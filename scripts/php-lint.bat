@echo off
setlocal

REM Ada Chat PHP lint runner (Windows)
REM If you don't have php.exe in PATH, set ADACHAT_PHP or edit the command to pass -Php.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0php-lint.ps1"
set code=%ERRORLEVEL%
if not "%code%"=="0" (
  echo.
  echo PHP lint failed. ExitCode=%code%
)
exit /b %code%

