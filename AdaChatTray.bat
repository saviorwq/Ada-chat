@echo off
setlocal
chcp 65001 >nul 2>&1
cd /d "%~dp0"
REM Tray launcher (no console). Right-click tray to stop GPU / quit all.
powershell -NoProfile -ExecutionPolicy Bypass -Sta -File "%~dp0AdaChatTray.ps1"
if errorlevel 1 pause
