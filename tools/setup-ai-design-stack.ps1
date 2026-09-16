param(
  [switch]$Apply,
  [switch]$SkipNpmCi
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

if (-not (Test-Path (Join-Path $repoRoot 'package.json')) -or -not (Test-Path (Join-Path $repoRoot 'manager.html'))) {
  throw 'Run this script from the SMART HSR repository. Repository markers were not found.'
}

Require-Command node
Require-Command npm
Require-Command npx

$nodeVersion = (& node -p "process.versions.node").Trim()
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 18) {
  throw "Node.js 18+ is required. Detected $nodeVersion."
}

Write-Host 'SMART HSR — AI Design Stack bootstrap' -ForegroundColor Green
Write-Host "Repository: $repoRoot"
Write-Host "Node: $nodeVersion"
Write-Host 'Safety mode: project-local only; no Production deployment; Graft global Codex writes disabled.'

Write-Step 'Previewing Graft changes (dry-run)'
& npx -y @nanonets/graft init . --dry-run --agents agents --no-global
if ($LASTEXITCODE -ne 0) { throw 'Graft dry-run failed.' }

if (-not $Apply) {
  Write-Host "`nDry-run complete. No Graft or Impeccable project wiring was applied." -ForegroundColor Yellow
  Write-Host 'To apply the project-local setup after reviewing the dry-run, run:'
  Write-Host '  powershell -ExecutionPolicy Bypass -File .\tools\setup-ai-design-stack.ps1 -Apply'
  exit 0
}

Write-Step 'Wiring Graft into project instructions only'
& npx -y @nanonets/graft init . --agents agents --no-global
if ($LASTEXITCODE -ne 0) { throw 'Graft project wiring failed.' }

Write-Step 'Installing Impeccable for Codex at project scope'
& npx -y impeccable install --providers=codex --scope=project
if ($LASTEXITCODE -ne 0) { throw 'Impeccable project installation failed.' }

if (-not $SkipNpmCi) {
  Write-Step 'Verifying locked project dependencies'
  & npm ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
}

Write-Step 'Verifying Playwright package'
& npx playwright --version
if ($LASTEXITCODE -ne 0) {
  throw 'Playwright is unavailable after dependency verification.'
}

Write-Host "`nSetup complete." -ForegroundColor Green
Write-Host 'Installed/wired:'
Write-Host '  - Graft: project AGENTS.md integration; no machine-wide Codex config'
Write-Host '  - Impeccable: project-scoped Codex design skill/hooks'
Write-Host '  - Playwright: existing repository dependency verified'
Write-Host "`nNext safe gate: run design QA against a Vercel Preview URL, never Production."
Write-Host '  $env:SMART_HSR_PREVIEW_URL="https://<preview>.vercel.app"'
Write-Host '  npm run test:e2e:user-center-design'
