@echo off
chcp 65001 >nul 2>&1
REM 彻底退出：强制结束 GPU llama-server + 本目录 PHP，并尽量清理 8920-8940 僵尸监听
REM Full quit: kill llama-server + Ada Chat php; note ghost ports may need OS reclaim

taskkill /F /T /IM llama-server.exe >nul 2>&1
ping 127.0.0.1 -n 2 >nul
taskkill /F /T /IM llama-server.exe >nul 2>&1
if exist "%~dp0tools\llama-vulkan\stop-llama-vulkan.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tools\llama-vulkan\stop-llama-vulkan.ps1" >nul 2>&1
)

REM 只杀本目录携带的 php.exe（避免误杀系统其它 PHP）
REM Kill bundled php.exe only
for /f "tokens=2 delims==" %%P in ('wmic process where "name='php.exe'" get ProcessId^,ExecutablePath /format:list 2^>nul ^| findstr /i "ProcessId ExecutablePath"') do (
  rem fallback below via powershell
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = (Resolve-Path '%~dp0').Path; " ^
  "Get-CimInstance Win32_Process -Filter \"name='php.exe'\" -ErrorAction SilentlyContinue | ForEach-Object { " ^
  "  if ($_.ExecutablePath -and ($_.ExecutablePath -like ($root + '*'))) { " ^
  "    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue " ^
  "  } " ^
  "}; " ^
  "Start-Sleep -Milliseconds 500; " ^
  "foreach ($port in 8920..8940) { " ^
  "  $rows = Get-NetTCPConnection -LocalPort $port -State Listen -EA SilentlyContinue; " ^
  "  foreach ($r in @($rows)) { " ^
  "    $procId = [int]$r.OwningProcess; " ^
  "    if ($procId -le 0) { continue } " ^
  "    $alive = Get-Process -Id $procId -EA SilentlyContinue; " ^
  "    if (-not $alive) { Write-Host ('ghost port ' + $port + ' pid=' + $procId + ' (OS may keep it until reboot)') } " ^
  "  } " ^
  "}"

exit
