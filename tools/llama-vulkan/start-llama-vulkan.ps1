# Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only
# 启动官方 Vulkan llama-server（Intel Arc A770 / AMD 等）
# Start official Vulkan llama-server for Intel Arc / AMD GPUs

param(
  [string]$Model = "D:\models\local\Qwen\Josiefied-Qwen3-8B-abliterated-v1.Q4_K_M.gguf",
  [int]$Port = 8080,
  [int]$GpuLayers = 999,
  [int]$Ctx = 24576,
  [string]$HostAddr = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Server = Join-Path $Root "llama-server.exe"
if (-not (Test-Path $Server)) {
  # 解压后可能在子目录
  $found = Get-ChildItem -Path $Root -Recurse -Filter "llama-server.exe" | Select-Object -First 1
  if (-not $found) { throw "llama-server.exe not found under $Root" }
  $Server = $found.FullName
  $Root = Split-Path -Parent $Server
}

if (-not (Test-Path $Model)) {
  throw "Model not found: $Model"
}

# 若本机有多块 Vulkan 设备，可用环境变量指定 Arc（按 vulkaninfo 序号）
# If multiple Vulkan devices, set GGML_VK_VISIBLE_DEVICES to Arc index
# $env:GGML_VK_VISIBLE_DEVICES = "0"

Write-Host "=== Ada Chat · llama-server (Vulkan) ===" -ForegroundColor Cyan
Write-Host "exe   : $Server"
Write-Host "model : $Model"
Write-Host "url   : http://${HostAddr}:${Port}/v1"
Write-Host "ngl   : $GpuLayers  ctx: $Ctx"
Write-Host "Ada Chat → 本地供应商 → HTTP 兼容 API → Base URL 填上面地址"
Write-Host ""

Set-Location $Root
$Alias = [IO.Path]::GetFileName($Model)
& $Server `
  -m $Model `
  -a $Alias `
  -ngl $GpuLayers `
  -c $Ctx `
  --parallel 1 `
  --host $HostAddr `
  --port $Port `
  --jinja
