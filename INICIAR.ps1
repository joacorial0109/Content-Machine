$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $project

$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js no esta instalado. Instalalo desde https://nodejs.org/"
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id Gyan.FFmpeg --exact --accept-package-agreements --accept-source-agreements --silent --disable-interactivity
    $env:Path = "$machinePath;$([Environment]::GetEnvironmentVariable('Path', 'User'))"
  } else {
    throw "FFmpeg no esta instalado y winget no esta disponible."
  }
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

$existing = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $existing) {
  Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory $project -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

Start-Process "http://localhost:3000"
