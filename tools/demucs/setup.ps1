# AdaChat Demucs 四轨分轨环境
# Demucs 4-stem env for DAW ZIP export

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo = Resolve-Path (Join-Path $Root "..\..")
$Venv = Join-Path $Root ".venv"
$Py311 = "D:\Python311\python.exe"
if (-not (Test-Path $Py311)) {
  $Py311 = (Get-Command py -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
  if ($Py311) {
    # use py -3.11 if available
  }
}

Write-Host "[demucs] repo=$Repo"
Write-Host "[demucs] venv=$Venv"

if (-not (Test-Path (Join-Path $Venv "Scripts\python.exe"))) {
  if (Test-Path "D:\Python311\python.exe") {
    & "D:\Python311\python.exe" -m venv $Venv
  } else {
    py -3.11 -m venv $Venv
  }
}

$Py = Join-Path $Venv "Scripts\python.exe"
& $Py -m pip install -U pip setuptools wheel
& $Py -m pip install --index-url https://download.pytorch.org/whl/cpu torch torchaudio
& $Py -m pip install demucs numpy

Write-Host "[demucs] checking..."
& $Py -c "import demucs, numpy, torch; print('ok demucs', getattr(demucs,'__version__','?'), 'torch', torch.__version__)"
Write-Host "[demucs] done. Optional: set ADACHAT_DEMUCS_PYTHON=$Py"
