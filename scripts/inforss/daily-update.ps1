param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [ValidateSet("daily", "month")]
  [string]$Mode = "daily",
  [string]$Branch = "",
  [string]$CommitMessage = "",
  [string]$LogDir = ""
)

$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $RepoRoot

if (-not $LogDir) {
  $LogDir = Join-Path $RepoRoot "logs\inforss"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$logFile = Join-Path $LogDir ("{0}-update-{1}.log" -f $Mode, (Get-Date -Format "yyyyMMdd"))

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  $line | Tee-Object -FilePath $logFile -Append
}

function ConvertTo-ArgumentString {
  param([string[]]$Arguments)

  return ($Arguments | ForEach-Object {
    if ($_ -match '[\s"]') {
      '"' + ($_ -replace '\\(?=\\*")', '$0$0' -replace '"', '\"') + '"'
    } else {
      $_
    }
  }) -join " "
}

function Run-Step {
  param(
    [string]$Name,
    [string]$Command,
    [string[]]$Arguments
  )

  Write-Log "Start: $Name"
  $stdoutFile = Join-Path $LogDir ("stdout-{0}.tmp" -f ([guid]::NewGuid().ToString("N")))
  $stderrFile = Join-Path $LogDir ("stderr-{0}.tmp" -f ([guid]::NewGuid().ToString("N")))

  try {
    $process = Start-Process `
      -FilePath $Command `
      -ArgumentList (ConvertTo-ArgumentString $Arguments) `
      -WorkingDirectory $RepoRoot `
      -NoNewWindow `
      -Wait `
      -PassThru `
      -RedirectStandardOutput $stdoutFile `
      -RedirectStandardError $stderrFile

    foreach ($file in @($stdoutFile, $stderrFile)) {
      if (Test-Path -LiteralPath $file) {
        Get-Content -LiteralPath $file | Tee-Object -FilePath $logFile -Append
      }
    }

    if ($process.ExitCode -ne 0) {
      throw "$Name failed with exit code $($process.ExitCode)."
    }
  }
  finally {
    foreach ($file in @($stdoutFile, $stderrFile)) {
      if (Test-Path -LiteralPath $file) {
        Remove-Item -LiteralPath $file -Force
      }
    }
  }

  Write-Log "Done: $Name"
}

$lockFile = Join-Path $LogDir ("{0}-update.lock" -f $Mode)
if (Test-Path -LiteralPath $lockFile) {
  $lockAgeMinutes = ((Get-Date) - (Get-Item -LiteralPath $lockFile).LastWriteTime).TotalMinutes
  if ($lockAgeMinutes -lt 120) {
    Write-Log "Another InfoRSS update seems to be running. Stop this run."
    exit 0
  }
  Write-Log "Remove stale lock file."
  Remove-Item -LiteralPath $lockFile -Force
}

try {
  New-Item -ItemType File -Force -Path $lockFile | Out-Null

  if (-not $Branch) {
    $Branch = (& git branch --show-current).Trim()
  }
  if (-not $Branch) {
    throw "Cannot detect current git branch."
  }

  if (-not $CommitMessage) {
    if ($Mode -eq "month") {
      $CommitMessage = "Backfill InfoRSS archive {0}" -f (Get-Date -Format "yyyyMMdd")
    } else {
      $CommitMessage = "Update InfoRSS archive {0}" -f (Get-Date -Format "yyyyMMdd")
    }
  }

  Write-Log "Repository: $RepoRoot"
  Write-Log "Branch: $Branch"
  Write-Log "Mode: $Mode"

  if ($Mode -eq "month") {
    Run-Step "Fetch InfoRSS month" "node" @("--use-system-ca", "scripts/inforss/fetch-month.mjs")
  } else {
    Run-Step "Fetch InfoRSS daily" "node" @("--use-system-ca", "scripts/inforss/fetch.mjs", "--daily")
  }
  Run-Step "Build site" "npm.cmd" @("run", "build")

  $stagePaths = @("data-generated/inforss")
  if (Test-Path -LiteralPath (Join-Path $RepoRoot "scripts/inforss/month-state.json")) {
    $stagePaths += "scripts/inforss/month-state.json"
  }

  Run-Step "Stage InfoRSS archive" "git" (@("add") + $stagePaths)

  & git diff --cached --quiet -- @stagePaths
  $hasStagedArchiveChanges = $LASTEXITCODE -ne 0

  if (-not $hasStagedArchiveChanges) {
    Write-Log "No InfoRSS archive changes to commit."
    exit 0
  }

  Run-Step "Commit InfoRSS archive" "git" @("commit", "-m", $CommitMessage)
  try {
    Run-Step "Push branch" "git" @("push", "origin", $Branch)
  }
  catch {
    $remoteUrl = (& git remote get-url origin).Trim()
    if ($remoteUrl -match '^git@github\.com:(.+)\.git$') {
      $httpsUrl = "https://github.com/$($Matches[1]).git"
      Write-Log "SSH push failed. Retry with HTTPS remote: $httpsUrl"
      Run-Step "Push branch over HTTPS" "git" @("push", $httpsUrl, $Branch)
    } else {
      throw
    }
  }

  Write-Log "InfoRSS $Mode update completed."
}
catch {
  Write-Log "Error: $($_.Exception.Message)"
  exit 1
}
finally {
  if (Test-Path -LiteralPath $lockFile) {
    Remove-Item -LiteralPath $lockFile -Force
  }
}
