param(
  [string]$TaskName = "Pages InfoRSS Monthly Backfill"
)

$ErrorActionPreference = "Stop"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed scheduled task: $TaskName"
