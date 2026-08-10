#Requires -Version 5.1
# Ada Chat tray launcher (STA). Start via AdaChatTray.bat / start bat.
# Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $appDir

$mutex = New-Object System.Threading.Mutex($false, "Global\AdaChatPortableTrayMutex_v1")
if (-not $mutex.WaitOne(0)) {
  [System.Windows.Forms.MessageBox]::Show(
    ("Ada Chat is already running.`n" +
     "Find the tray icon near the clock (click ^ if hidden). Right-click to stop GPU or quit."),
    "Ada Chat",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  ) | Out-Null
  $mutex.Dispose()
  exit 0
}

$phpExe = Join-Path $appDir "php\php.exe"
$phpIni = Join-Path $appDir "php\php.ini"
$cacert = Join-Path $appDir "ssl\cacert.pem"
$router = Join-Path $appDir "router.php"
$hostAddr = "127.0.0.1"
$startPort = 8920
$portScanMax = 20

if (-not (Test-Path -LiteralPath $phpExe)) {
  [System.Windows.Forms.MessageBox]::Show(
    ("PHP not found:`n" + $phpExe + "`nUnpack the full package (php folder required)."),
    "Ada Chat",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
  [void]$mutex.ReleaseMutex()
  $mutex.Dispose()
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

function Find-UsablePort([int]$BeginPort, [int]$MaxTry) {
  for ($i = 0; $i -lt $MaxTry; $i++) {
    $p = $BeginPort + $i
    $pidListen = Get-PortListenerPid $p
    if ($pidListen -le 0) {
      return @{ Port = $p; ReusePid = 0 }
    }
    if (-not (Test-PidAlive $pidListen)) {
      continue
    }
    $proc = Get-Process -Id $pidListen -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -match '^php') {
      $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$pidListen" -ErrorAction SilentlyContinue).CommandLine
      if ($cmd -and ($cmd.IndexOf($appDir, [StringComparison]::OrdinalIgnoreCase) -ge 0)) {
        return @{ Port = $p; ReusePid = $pidListen }
      }
    }
  }
  throw ("No free TCP port in range " + $BeginPort + "-" + ($BeginPort + $MaxTry - 1))
}

function Stop-AdaLlamaServer {
  $stopPs1 = Join-Path $appDir "tools\llama-vulkan\stop-llama-vulkan.ps1"
  try {
    if (Test-Path -LiteralPath $stopPs1) {
      Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
        "-File", $stopPs1
      ) -WindowStyle Hidden -Wait | Out-Null
    }
  } catch { }
  try {
    & taskkill.exe /F /T /IM llama-server.exe 2>$null | Out-Null
  } catch { }
  Get-Process -Name "llama-server" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Get-LlamaRunning {
  return [bool](Get-Process -Name "llama-server" -ErrorAction SilentlyContinue)
}

$found = Find-UsablePort $startPort $portScanMax
$port = [int]$found.Port
$reusePid = [int]$found.ReusePid
$loginUrl = "http://${hostAddr}:${port}/login.php"
$healthUrl = "http://${hostAddr}:${port}/_api_test"

$phpProcess = $null
try {
  if ($reusePid -gt 0) {
    $phpProcess = Get-Process -Id $reusePid -ErrorAction Stop
  } else {
    $argLine = "-c `"$phpIni`" -d curl.cainfo=`"$cacert`" -d openssl.cafile=`"$cacert`" -S ${hostAddr}:${port} -t `"$appDir`""
    if (Test-Path -LiteralPath $router) {
      $argLine += " `"$router`""
    }
    $phpProcess = Start-Process -FilePath $phpExe -ArgumentList $argLine -WorkingDirectory $appDir -WindowStyle Hidden -PassThru
  }
} catch {
  [System.Windows.Forms.MessageBox]::Show(
    ("Failed to start PHP: " + $_),
    "Ada Chat",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
  [void]$mutex.ReleaseMutex()
  $mutex.Dispose()
  exit 1
}

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 250
  if (Test-HttpOk $healthUrl 2) {
    $ready = $true
    break
  }
  if ($phpProcess.HasExited) { break }
}
if (-not $ready) {
  [System.Windows.Forms.MessageBox]::Show(
    ("Server not ready on port " + $port + ".`nRun Stop Ada Chat.bat then retry."),
    "Ada Chat",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
  try {
    if ($reusePid -le 0 -and $phpProcess -and -not $phpProcess.HasExited) {
      $phpProcess.Kill()
    }
  } catch { }
  [void]$mutex.ReleaseMutex()
  $mutex.Dispose()
  exit 1
}

try { Start-Process $loginUrl } catch { }

$ensure = Join-Path $appDir "tools\llama-vulkan\ensure-llama-vulkan.ps1"
if (Test-Path -LiteralPath $ensure) {
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
    "-File", $ensure
  ) -WindowStyle Hidden | Out-Null
}

$iconPath = Join-Path $appDir "assets\adachat-logo.ico"
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path -LiteralPath $iconPath) {
  $notifyIcon.Icon = New-Object System.Drawing.Icon($iconPath)
} else {
  $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
}
$notifyIcon.Text = ("Ada Chat - http://" + $hostAddr + ":" + $port)
$notifyIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
# UI labels: keep Chinese for tray menu (UTF-8 BOM required for WinPS 5.1)
$itemOpen = $menu.Items.Add([string][char]0x6253 + [char]0x5F00 + " Ada Chat")
$itemStopGpu = $menu.Items.Add("Stop GPU only (llama-server)")
$itemQuit = $menu.Items.Add("Quit all (PHP + GPU)")
# Prefer readable Chinese via Unicode escapes in a here-string decoded below
$zhOpen = [string]::Concat([char]0x6253,[char]0x5F00,[char]0x0020,[char]0x0041,[char]0x0064,[char]0x0061,[char]0x0020,[char]0x0043,[char]0x0068,[char]0x0061,[char]0x0074,[char]0x0020,[char]0xFF08,[char]0x6D4F,[char]0x89C8,[char]0x5668,[char]0xFF09)
$zhStopGpu = [string]::Concat([char]0x4EC5,[char]0x505C,[char]0x6B62,[char]0x0020,[char]0x0047,[char]0x0050,[char]0x0055,[char]0x0020,[char]0xFF08,[char]0x006C,[char]0x006C,[char]0x0061,[char]0x006D,[char]0x0061,[char]0x002D,[char]0x0073,[char]0x0065,[char]0x0072,[char]0x0076,[char]0x0065,[char]0x0072,[char]0x0020,[char]0x002F,[char]0x0020,[char]0x91CA,[char]0x663E,[char]0x5B58,[char]0xFF09)
$zhQuit = [string]::Concat([char]0x505C,[char]0x6B62,[char]0x5168,[char]0x90E8,[char]0x5E76,[char]0x9000,[char]0x51FA,[char]0x0020,[char]0xFF08,[char]0x0050,[char]0x0048,[char]0x0050,[char]0x0020,[char]0x002B,[char]0x0020,[char]0x0047,[char]0x0050,[char]0x0055,[char]0xFF09)
$itemOpen.Text = $zhOpen
$itemStopGpu.Text = $zhStopGpu
$itemQuit.Text = $zhQuit
$notifyIcon.ContextMenuStrip = $menu

$form = New-Object System.Windows.Forms.Form
$form.ShowInTaskbar = $false
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedToolWindow
$form.Size = New-Object System.Drawing.Size(1, 1)
$form.StartPosition = "Manual"
$form.Location = New-Object System.Drawing.Point(-32000, -32000)
$form.Opacity = 0

$script:phpProcess = $phpProcess
$script:mutex = $mutex
$script:notifyIcon = $notifyIcon
$script:loginUrl = $loginUrl

$form.add_FormClosing({
  param($sender, $e)
  try { Stop-AdaLlamaServer } catch { }
  try {
    if ($script:phpProcess -and -not $script:phpProcess.HasExited) {
      $script:phpProcess.Kill()
      $script:phpProcess.WaitForExit(8000) | Out-Null
    }
  } catch { }
  try {
    $script:notifyIcon.Visible = $false
    $script:notifyIcon.Dispose()
  } catch { }
  try {
    [void]$script:mutex.ReleaseMutex()
    $script:mutex.Dispose()
  } catch { }
})

$itemOpen.add_Click({
  try { Start-Process $script:loginUrl } catch { }
})

$itemStopGpu.add_Click({
  Stop-AdaLlamaServer
  $left = Get-LlamaRunning
  $msg = if ($left) {
    "llama-server still running. Retry or run Stop Ada Chat.bat."
  } else {
    "llama-server stopped. VRAM usually frees in a few seconds."
  }
  try {
    $script:notifyIcon.ShowBalloonTip(
      4000,
      "Ada Chat",
      $msg,
      [System.Windows.Forms.ToolTipIcon]::Info
    )
  } catch {
    [System.Windows.Forms.MessageBox]::Show($msg, "Ada Chat") | Out-Null
  }
})

$itemQuit.add_Click({
  $form.Close()
})

$notifyIcon.add_DoubleClick({
  try { Start-Process $script:loginUrl } catch { }
})

try {
  $notifyIcon.ShowBalloonTip(
    5000,
    "Ada Chat started",
    ("Tray icon is near the clock (click ^ if hidden). Right-click: stop GPU / quit all.`n" + $loginUrl),
    [System.Windows.Forms.ToolTipIcon]::Info
  )
} catch { }

[System.Windows.Forms.Application]::Run($form)