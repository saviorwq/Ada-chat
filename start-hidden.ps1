# Ada Chat - 后台启动（隐藏 PHP 窗口）
# 运行此脚本可无窗口启动服务，点击「安全退出」后会自动关闭后台 PHP 进程
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$phpExe = Join-Path $scriptDir "php\php.exe"
$phpIni = Join-Path $scriptDir "php\php.ini"
$cacert = Join-Path $scriptDir "ssl\cacert.pem"
$router = Join-Path $scriptDir "router.php"
$hostAddr = "127.0.0.1"
$port = "8920"

if (-not (Test-Path $phpExe)) {
    Write-Host "[ERROR] PHP not found: $phpExe"
    Read-Host "Press Enter to exit"
    exit 1
}

# 先启动 PHP（无窗口），再打开浏览器，避免连接失败
$phpArgs = @(
    "-c", $phpIni,
    "-d", "curl.cainfo=$cacert",
    "-d", "openssl.cafile=$cacert",
    "-S", "${hostAddr}:${port}",
    "-t", $scriptDir
)
if (Test-Path $router) {
    $phpArgs += $router
}
Start-Process -FilePath $phpExe -ArgumentList $phpArgs -WindowStyle Hidden -WorkingDirectory $scriptDir

# 等待 PHP 绑定端口后再打开浏览器
Start-Sleep -Seconds 2
Start-Process "http://${hostAddr}:${port}/login.php"
