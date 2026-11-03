# VoiceCan - GitHub Releases otomatik yayinlama
# Kullanim: npm run release
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile  = Join-Path $repoRoot '.env.release'

if (-not (Test-Path $envFile)) { throw ".env.release bulunamadi: $envFile" }
$line = Get-Content $envFile | Where-Object { $_ -match '^GH_TOKEN=' } | Select-Object -First 1
if (-not $line) { throw '.env.release icinde GH_TOKEN satiri yok' }
$env:GH_TOKEN = ($line -replace '^GH_TOKEN=', '').Trim()
if (-not $env:GH_TOKEN) { throw 'GH_TOKEN bos' }

Write-Host '[release] GH_TOKEN yuklendi (deger gizli)' -ForegroundColor DarkGray

# Script frontend/ icinden cagrilir; npm/npx bu dizinde calismali
Set-Location -Path (Split-Path -Parent $PSScriptRoot)

Write-Host '[release] Vite build...' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Vite build basarisiz (exit $LASTEXITCODE)" }

Write-Host '[release] electron-builder --win --publish always ...' -ForegroundColor Cyan
npx electron-builder --win --publish always
if ($LASTEXITCODE -ne 0) { throw "electron-builder basarisiz (exit $LASTEXITCODE)" }

Write-Host '[release] Tamamlandi.' -ForegroundColor Green