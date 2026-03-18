@echo off
setlocal

set "TASK_NAME=AdaChat-AutoUpdate"
schtasks /Delete /F /TN "%TASK_NAME%"

if errorlevel 1 (
    echo [WARN] Task "%TASK_NAME%" not found or delete failed.
    exit /b 1
)

echo [DONE] Task "%TASK_NAME%" removed.
exit /b 0
