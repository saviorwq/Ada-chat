# Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only
# 取消登录自启计划任务 / Unregister logon autostart task

param(
  [string]$TaskName = "AdaChat Llama Vulkan",
  [switch]$AlsoStopServer
)

$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "removed scheduled task: $TaskName"
} else {
  Write-Host "task not found: $TaskName"
}

if ($AlsoStopServer) {
  Get-Process -Name "llama-server" -ErrorAction SilentlyContinue | Stop-Process -Force
  Write-Host "stopped llama-server"
}
