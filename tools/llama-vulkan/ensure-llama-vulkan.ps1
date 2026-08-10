# Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only
# 若未运行则后台拉起 llama-server（供登录自启 / 手动保活）
# Start llama-server in background if not already healthy

param(
  [string]$Model = "D:\models\local\Qwen\Josiefied-Qwen3-8B-abliterated-v1.Q4_K_M.gguf",
  [int]$Port = 8080,
  [int]$GpuLayers = 999,
  [int]$Ctx = 24576,
  [string]$HostAddr = "127.0.0.1",
  [int]$ReadyTimeoutSec = 180,
  [switch]$IgnoreQuit
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Server = Join-Path $Root "llama-server.exe"
$LogOut = Join-Path $Root "llama-server.log"
$LogErr = Join-Path $Root "llama-server.err.log"
$HealthUrl = "http://${HostAddr}:${Port}/health"
$QuitFlag = Join-Path $Root ".adachat-user-quit"

# 彻底退出后短时间不自动拉起；哨兵超过 90s 自动失效，避免永久连不上 8080
# After full-quit, briefly block auto-start; expire sentinel after 90s so :8080 is not stuck forever
$QuitMaxAgeSec = 90
if (-not $IgnoreQuit -and (Test-Path -LiteralPath $QuitFlag)) {
  $age = [int]((Get-Date) - (Get-Item -LiteralPath $QuitFlag).LastWriteTime).TotalSeconds
  if ($age -lt $QuitMaxAgeSec) {
    Write-Host "skip start: user quit flag present ($QuitFlag, age=${age}s)"
    exit 0
  }
  Remove-Item -LiteralPath $QuitFlag -Force -ErrorAction SilentlyContinue
  Write-Host "quit flag expired (age=${age}s), continuing"
}

function Test-LlamaHealthy {
  try {
    $r = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -eq 200 -and $r.Content -match 'ok')
  } catch {
    return $false
  }
}

if (-not (Test-Path $Server)) {
  throw "llama-server.exe not found: $Server"
}
if (-not (Test-Path $Model)) {
  throw "Model not found: $Model"
}

if (Test-LlamaHealthy) {
  Write-Host "already running: $HealthUrl"
  exit 0
}

# 端口被占但未健康：结束残留进程后重启
$existing = Get-Process -Name "llama-server" -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "stopping stale llama-server (pid=$($existing.Id -join ','))"
  $existing | Stop-Process -Force
  Start-Sleep -Seconds 2
}

$Alias = [IO.Path]::GetFileName($Model)
$argList = @(
  "-m", $Model,
  "-a", $Alias,
  "-ngl", "$GpuLayers",
  "-c", "$Ctx",
  "--parallel", "1",
  "--host", $HostAddr,
  "--port", "$Port",
  "--jinja"
)

Write-Host "starting llama-server (Vulkan) on ${HostAddr}:${Port} ..."
Start-Process -FilePath $Server `
  -ArgumentList $argList `
  -WorkingDirectory $Root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $LogOut `
  -RedirectStandardError $LogErr | Out-Null

$deadline = (Get-Date).AddSeconds($ReadyTimeoutSec)
while ((Get-Date) -lt $deadline) {
  if (Test-LlamaHealthy) {
    Write-Host "ready: http://${HostAddr}:${Port}/v1"
    exit 0
  }
  Start-Sleep -Seconds 2
}

throw "llama-server failed to become healthy within ${ReadyTimeoutSec}s; see $LogErr"
