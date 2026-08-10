param(
  [string]$Php = "",
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

function Resolve-PhpExe {
  param([string]$PhpArg)

  if ($PhpArg -and (Test-Path $PhpArg)) { return (Resolve-Path $PhpArg).Path }

  if ($env:ADACHAT_PHP -and (Test-Path $env:ADACHAT_PHP)) {
    return (Resolve-Path $env:ADACHAT_PHP).Path
  }

  $cmd = Get-Command php -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "C:\php\php.exe",
    "C:\Program Files\php\php.exe",
    "C:\Program Files\PHP\php.exe",
    "C:\xampp\php\php.exe",
    "C:\wamp64\bin\php\php*\php.exe",
    "C:\wamp\bin\php\php*\php.exe"
  )
  foreach ($c in $candidates) {
    $m = Get-ChildItem -Path $c -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { return $m.FullName }
  }

  return ""
}

$phpExe = Resolve-PhpExe -PhpArg $Php
if (-not $phpExe) {
  Write-Host "未找到 php.exe。请先安装 PHP，或指定路径：" -ForegroundColor Yellow
  Write-Host "  powershell -NoProfile -File scripts\php-lint.ps1 -Php C:\path\to\php.exe" -ForegroundColor Yellow
  Write-Host "  或设置环境变量 ADACHAT_PHP 指向 php.exe" -ForegroundColor Yellow
  exit 2
}

Write-Host "PHP: $phpExe"
Write-Host "Root: $Root"

$phpFiles = Get-ChildItem -Path $Root -Recurse -File -Filter *.php `
  -ErrorAction Stop | Where-Object { $_.FullName -notmatch '\\node_modules\\' }

if (-not $phpFiles -or $phpFiles.Count -eq 0) {
  Write-Host "未找到任何 PHP 文件。"
  exit 0
}

$failed = 0
foreach ($f in $phpFiles) {
  $out = & $phpExe -l $f.FullName 2>&1
  if ($LASTEXITCODE -ne 0) {
    $failed++
    Write-Host ""
    Write-Host "FAIL: $($f.FullName)" -ForegroundColor Red
    Write-Host $out
  }
}

if ($failed -gt 0) {
  Write-Host ""
  Write-Host "PHP lint 失败：$failed 个文件" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "PHP lint 通过：$($phpFiles.Count) 个文件" -ForegroundColor Green
exit 0

