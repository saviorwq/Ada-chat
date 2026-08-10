# Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only
# 注册「用户登录后自动启动」计划任务（常驻）
# Register logon Scheduled Task so llama-server stays available

param(
  [string]$TaskName = "AdaChat Llama Vulkan"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Ensure = Join-Path $Root "ensure-llama-vulkan.ps1"
if (-not (Test-Path $Ensure)) { throw "missing $Ensure" }

$ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Ensure`" -IgnoreQuit"

$action = New-ScheduledTaskAction -Execute $ps -Argument $arg -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0)
# ExecutionTimeLimit 0 = 不限制（ensure 脚本很快退出；子进程 llama-server 独立常驻）

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Write-Host "installed scheduled task: $TaskName"
Write-Host "  trigger : At logon ($env:USERNAME)"
Write-Host "  script  : $Ensure"
Write-Host ""
Write-Host "running ensure once now ..."
& $Ensure
Write-Host ""
Write-Host "卸载: .\uninstall-autostart.ps1"
