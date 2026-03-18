$ErrorActionPreference = "Continue"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Updater = Join-Path $AppDir "auto-update.ps1"
$IntervalMinutes = 60

while ($true) {
    try {
        powershell -NoProfile -ExecutionPolicy Bypass -File $Updater | Out-Null
    } catch {
        # Keep loop alive; errors are already recorded in auto-update.log.
    }
    Start-Sleep -Seconds ($IntervalMinutes * 60)
}
