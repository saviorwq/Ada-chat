# Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only
# 停止本机 llama-server（Vulkan 后台），尽量释放 GPU 显存
# Stop local llama-server (Vulkan) and free GPU VRAM

$ErrorActionPreference = "SilentlyContinue"

function Stop-LlamaServer {
  & taskkill.exe /F /T /IM llama-server.exe 2>$null | Out-Null
  Get-Process -Name "llama-server" -ErrorAction SilentlyContinue | ForEach-Object {
    try { $_.Kill() } catch { }
  }
  Get-Process -Name "llama-server" -ErrorAction SilentlyContinue | Stop-Process -Force
}

if (-not (Get-Process -Name "llama-server" -ErrorAction SilentlyContinue)) {
  Write-Host "llama-server not running"
  exit 0
}

Write-Host "stopping llama-server..."
Stop-LlamaServer

# Vulkan 进程退出可能慢几秒，轮询等待 / Vulkan teardown can lag; poll until gone
$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
  $left = Get-Process -Name "llama-server" -ErrorAction SilentlyContinue
  if (-not $left) {
    Write-Host "llama-server stopped (VRAM should release shortly)"
    exit 0
  }
  Stop-LlamaServer
  Start-Sleep -Milliseconds 800
}

$left = Get-Process -Name "llama-server" -ErrorAction SilentlyContinue
if ($left) {
  Write-Host "WARN: llama-server still running (pid=$($left.Id -join ','))"
  exit 2
}

Write-Host "llama-server stopped (VRAM should release shortly)"
exit 0
