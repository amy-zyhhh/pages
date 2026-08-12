param(
  [string]$TaskName = "Pages InfoRSS Monthly Backfill",
  [string]$Time = "03:30",
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

$updateScript = Join-Path $RepoRoot "scripts\inforss\daily-update.ps1"
if (-not (Test-Path -LiteralPath $updateScript)) {
  throw "Cannot find update script: $updateScript"
}

$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$updateScript`" -RepoRoot `"$RepoRoot`" -Mode month"
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Backfill one month of InfoRSS archive locally, build the Astro site, commit archive data, and push to GitHub." `
  -Force | Out-Null

Write-Host "Installed scheduled task: $TaskName"
Write-Host "Daily time: $Time"
Write-Host "Update script: $updateScript"
