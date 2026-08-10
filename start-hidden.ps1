# Ada Chat - 后台启动（隐藏 PHP 窗口）
# Delegates to start-adachat.ps1 -Hidden
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $scriptDir "start-adachat.ps1") -Hidden
