# Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only
# Ada Chat launcher: skip ghost ports, start PHP first, then open browser

param(
  [string]$HostAddr = "127.0.0.1",
  [int]$Port = 8920,
  [int]$PortScanMax = 20,
  [switch]$Hidden
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$phpExe = Join-Path $Root "php\php.exe"
$phpIni = Join-Path $Root "php\php.ini"
$cacert = Join-Path $Root "ssl\cacert.pem"
$router = Join-Path $Root "router.php"

if (-not (Test-Path -LiteralPath $phpExe)) {
  Write-Host "[ERROR] PHP not found: $phpExe"
  Read-Host "Press Enter to exit"
  exit 1
}

function Test-PidAlive([int]$ProcessId) {
  if ($ProcessId -le 0) { return $false }
  try {
    $null = Get-Process -Id $ProcessId -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Get-PortListenerPid([int]$TcpPort) {
  try {
    $rows = Get-NetTCPConnection -LocalPort $TcpPort -State Listen -ErrorAction SilentlyContinue
    if ($rows) {
      return [int](@($rows)[0].OwningProcess)
    }
  } catch { }
  $pattern = ':' + $TcpPort + '\s+.*LISTENING\s+(\d+)'
  $line = netstat -ano | Select-String -Pattern $pattern | Select-Object -First 1
  if ($line -and $line.Matches.Count -gt 0) {
    return [int]$line.Matches[0].Groups[1].Value
  }
  return 0
}

function Test-HttpOk([string]$Url, [int]$TimeoutSec = 2) {
  try {
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.Method = "GET"
    $req.Timeout = $TimeoutSec * 1000
    $req.ReadWriteTimeout = $TimeoutSec * 1000
    $resp = $req.GetResponse()
    $code = [int]$resp.StatusCode
    $resp.Close()
    return ($code -ge 200 -and $code -lt 500)
  } catch {
    return $false
  }
}

function Find-UsablePort([int]$StartPort, [int]$MaxTry) {
  for ($i = 0; $i -lt $MaxTry; $i++) {
    $p = $StartPort + $i
    $pidListen = Get-PortListenerPid $p
    if ($pidListen -le 0) {
      return @{ Port = $p; ReusePid = 0 }
    }
    if (-not (Test-PidAlive $pidListen)) {
      Write-Host "[WARN] Port $p ghost listener (dead pid=$pidListen), skip."
      continue
    }
    $proc = Get-Process -Id $pidListen -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -match '^php') {
      $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$pidListen" -ErrorAction SilentlyContinue).CommandLine
      if ($cmd -and ($cmd.IndexOf($Root, [StringComparison]::OrdinalIgnoreCase) -ge 0)) {
        Write-Host "[INFO] Reuse existing Ada Chat PHP on port $p (pid=$pidListen)"
        return @{ Port = $p; ReusePid = $pidListen }
      }
    }
    Write-Host "[WARN] Port $p busy (pid=$pidListen), try next..."
  }
  throw "No free TCP port in range $StartPort-$($StartPort+$MaxTry-1)"
}

Write-Host "============================================"
Write-Host "       Ada Chat - Multimodal AI Assistant"
Write-Host "============================================"
Write-Host ""

$found = Find-UsablePort $Port $PortScanMax
$Port = [int]$found.Port
$reusePid = [int]$found.ReusePid

$url = "http://${HostAddr}:${Port}/"
$loginUrl = "http://${HostAddr}:${Port}/login.php"
$healthUrl = "http://${HostAddr}:${Port}/_api_test"

$phpProc = $null
if ($reusePid -gt 0) {
  $phpProc = Get-Process -Id $reusePid
} else {
  # 单字符串参数，避免路径空格被拆坏 / single arg string for paths with spaces
  $argLine = "-c `"$phpIni`" -d curl.cainfo=`"$cacert`" -d openssl.cafile=`"$cacert`" -S ${HostAddr}:${Port} -t `"$Root`""
  if (Test-Path -LiteralPath $router) {
    $argLine += " `"$router`""
  }
  $style = if ($Hidden) { "Hidden" } else { "Minimized" }
  $phpProc = Start-Process -FilePath $phpExe -ArgumentList $argLine -WorkingDirectory $Root -WindowStyle $style -PassThru
}

Write-Host " Starting server at $url"
Write-Host " PHP pid: $($phpProc.Id)"
Write-Host " Waiting for server ready..."
Write-Host ""

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 250
  if (Test-HttpOk $healthUrl 2) {
    $ready = $true
    break
  }
  if ($phpProc.HasExited) {
    Write-Host "[ERROR] PHP exited early (code=$($phpProc.ExitCode))."
    Read-Host "Press Enter to exit"
    exit 1
  }
}

if (-not $ready) {
  Write-Host "[ERROR] Server not ready on port $Port."
  Write-Host " Tip: ghost port after force-kill may require reboot, or launcher will pick another port."
  if ($reusePid -le 0) {
    try { Stop-Process -Id $phpProc.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host " Server is READY."
Write-Host " Opening $loginUrl"
Write-Host ""
Write-Host " Keep this window. Use Stop Ada Chat.bat or in-app Full Quit to stop."
Write-Host " Idle console is normal; request logs appear when pages load."
Write-Host "============================================"
Write-Host ""

Start-Process $loginUrl

$ensure = Join-Path $Root "tools\llama-vulkan\ensure-llama-vulkan.ps1"
if (Test-Path -LiteralPath $ensure) {
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
    "-File", $ensure
  ) -WindowStyle Hidden | Out-Null
}

if (-not $Hidden) {
  Write-Host "Press Ctrl+C to stop watching (PHP keeps running until stop.bat / safe exit)."
  try {
    while (-not $phpProc.HasExited) {
      Start-Sleep -Seconds 2
    }
    Write-Host "PHP process exited."
  } catch {
  }
}