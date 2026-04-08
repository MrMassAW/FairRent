# One Windows Terminal window, split left | right: Vite (left) + listing agent (verbose, right).
# Falls back to two separate PowerShell windows if Windows Terminal (wt.exe) is missing.

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Resolve-WtPath {
  $candidates = @(
    'wt.exe',
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\wt.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Windows Terminal\wt.exe'),
    (Join-Path $env:ProgramFiles 'Windows Terminal\wt.exe')
  )
  foreach ($p in $candidates) {
    if (-not $p) { continue }
    if (Test-Path -LiteralPath $p) { return $p }
  }
  $cmd = Get-Command wt.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

# Single argument string for wt: first pane = frontend, split-pane -V = new pane on the right = backend
function Build-WtArguments {
  param([string]$ProjectRoot)
  $d = '"' + $ProjectRoot.Replace('"', '""') + '"'
  return "-d $d cmd /k `"title FairRent-Frontend && npm run dev`" ; split-pane -V -d $d cmd /k `"title FairRent-Backend && set LISTING_AGENT_VERBOSE=1 && npm run dev:server`""
}

$wt = Resolve-WtPath
if ($wt) {
  $argLine = Build-WtArguments -ProjectRoot $root
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $wt
  $psi.Arguments = $argLine
  $psi.WorkingDirectory = $root
  $psi.UseShellExecute = $true
  [void][System.Diagnostics.Process]::Start($psi)
  Write-Host 'Opened Windows Terminal: split panes (left = Vite, right = listing agent).' -ForegroundColor Green
  exit 0
}

Write-Host 'Windows Terminal (wt.exe) not found. Opening two PowerShell windows instead.' -ForegroundColor Yellow

$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $ps)) {
  $ps = 'powershell.exe'
}

Start-Process -FilePath $ps -WorkingDirectory $root -WindowStyle Normal -ArgumentList @(
  '-NoExit',
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-Command',
  "`$Host.UI.RawUI.WindowTitle = 'FairRent - Frontend (Vite)'; npm run dev"
)

Start-Sleep -Milliseconds 600

Start-Process -FilePath $ps -WorkingDirectory $root -WindowStyle Normal -ArgumentList @(
  '-NoExit',
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-Command',
  "`$Host.UI.RawUI.WindowTitle = 'FairRent - Backend (listing agent)'; `$env:LISTING_AGENT_VERBOSE = '1'; npm run dev:server"
)

Write-Host 'Opened 2 PowerShell windows. Install Windows Terminal from the Store for a single split window.' -ForegroundColor Green
