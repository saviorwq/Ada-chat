# 下载 ACE-Step Base（约 4.8GB）
# Download acestep-v15-base into checkpoints/

$ErrorActionPreference = "Stop"
$Root = "D:\ACE-Step\ACE-Step-1.5"
$Dest = Join-Path $Root "checkpoints\acestep-v15-base"
$Log = Join-Path $Root "logs\download_base.log"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $Log) | Out-Null

Set-Location $Root
$ms = Join-Path $Root "venv_xpu\Scripts\modelscope.exe"
$hf = Join-Path $Root "venv_xpu\Scripts\huggingface-cli.exe"

"$(Get-Date -Format o) download begin" | Tee-Object -FilePath $Log
if (Test-Path $ms) {
  & $ms download --model ACE-Step/acestep-v15-base --local_dir $Dest 2>&1 | Tee-Object -FilePath $Log -Append
  if ($LASTEXITCODE -ne 0) {
    & $hf download ACE-Step/acestep-v15-base --local-dir $Dest 2>&1 | Tee-Object -FilePath $Log -Append
  }
} else {
  & $hf download ACE-Step/acestep-v15-base --local-dir $Dest 2>&1 | Tee-Object -FilePath $Log -Append
}
"$(Get-Date -Format o) EXIT=$LASTEXITCODE" | Tee-Object -FilePath $Log -Append
