param(
    [string]$RepoUrl = "https://github.com/saviorwq/Ada-chat.git",
    [string]$Branch = "main",
    [string]$PluginRepoUrl = "https://github.com/saviorwq/Ada-chat-CYOA-Plugins.git",
    [string]$PluginBranch = "main"
)

$ErrorActionPreference = "Continue"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $AppDir "logs"
$LogFile = Join-Path $LogDir "auto-update.log"
$UpdaterRoot = Join-Path $AppDir ".updater"
$MainRepoCacheDir = Join-Path $UpdaterRoot "repo-main"
$PluginRepoCacheDir = Join-Path $UpdaterRoot "repo-plugin-cyoa"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}
if (-not (Test-Path $UpdaterRoot)) {
    New-Item -ItemType Directory -Path $UpdaterRoot | Out-Null
}

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Add-Content -Path $LogFile -Value $line
    Write-Output $line
}

function Sync-RepoCache {
    param(
        [string]$CacheDir,
        [string]$RemoteUrl,
        [string]$RemoteBranch,
        [string]$Name
    )
    if (-not (Test-Path (Join-Path $CacheDir ".git"))) {
        Write-Log "No cached $Name repo found. Cloning..."
        & git clone --depth 1 --branch $RemoteBranch $RemoteUrl $CacheDir
        if ($LASTEXITCODE -ne 0) {
            throw "$Name git clone failed with exit code $LASTEXITCODE"
        }
    }

    Set-Location $CacheDir
    Write-Log "Syncing $Name repo to origin/$RemoteBranch"
    & git fetch --prune origin $RemoteBranch
    if ($LASTEXITCODE -ne 0) {
        throw "$Name git fetch failed with exit code $LASTEXITCODE"
    }
    & git checkout -f $RemoteBranch
    if ($LASTEXITCODE -ne 0) {
        throw "$Name git checkout failed with exit code $LASTEXITCODE"
    }
    & git reset --hard "origin/$RemoteBranch"
    if ($LASTEXITCODE -ne 0) {
        throw "$Name git reset failed with exit code $LASTEXITCODE"
    }
}

try {
    Set-Location $UpdaterRoot
    Write-Log "Auto update started in $AppDir"

    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCmd) {
        throw "git command not found."
    }

    Sync-RepoCache -CacheDir $MainRepoCacheDir -RemoteUrl $RepoUrl -RemoteBranch $Branch -Name "main"

    Write-Log "Applying code updates to app directory..."
    $roboArgs = @(
        $MainRepoCacheDir,
        $AppDir,
        "/E",
        "/R:2",
        "/W:2",
        "/XD", ".git", ".updater", "logs", "ai_data",
        "/XF", "auto-update.ps1", "auto-update-loop.ps1", "register-auto-update-task.bat", "unregister-auto-update-task.bat", "enable-auto-update-startup.bat", "disable-auto-update-startup.bat"
    )
    & robocopy @roboArgs | Out-Null
    $roboCode = $LASTEXITCODE
    if ($roboCode -ge 8) {
        throw "robocopy failed with exit code $roboCode"
    }

    Sync-RepoCache -CacheDir $PluginRepoCacheDir -RemoteUrl $PluginRepoUrl -RemoteBranch $PluginBranch -Name "plugin"
    $PluginTargetDir = Join-Path $AppDir "plugins\cyoa"
    if (-not (Test-Path $PluginTargetDir)) {
        New-Item -ItemType Directory -Path $PluginTargetDir -Force | Out-Null
    }
    Write-Log "Applying plugin updates to $PluginTargetDir"
    $pluginRoboArgs = @(
        $PluginRepoCacheDir,
        $PluginTargetDir,
        "/E",
        "/R:2",
        "/W:2",
        "/XD", ".git"
    )
    & robocopy @pluginRoboArgs | Out-Null
    $pluginRoboCode = $LASTEXITCODE
    if ($pluginRoboCode -ge 8) {
        throw "plugin robocopy failed with exit code $pluginRoboCode"
    }

    if (Test-Path (Join-Path $AppDir "docker-compose.yml")) {
        $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
        if ($dockerCmd) {
            Write-Log "docker-compose detected, rebuilding containers..."
            docker compose up -d --build
        } else {
            Write-Log "docker not found. Skipping container rebuild."
        }
    } else {
        Write-Log "docker-compose.yml not found. Skipping container rebuild."
    }

    Write-Log "Auto update completed successfully."
    exit 0
}
catch {
    Write-Log "Auto update failed: $($_.Exception.Message)"
    exit 1
}
