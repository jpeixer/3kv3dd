# Exporta GLB da Unity e otimiza para GitHub Pages (sem simplificar geometria).
param(
    [string]$InputGlb = "docs/assets/scene.glb",
    [string]$OutputGlb = "docs/assets/scene-web.glb"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "Otimizando $InputGlb ..."
npx --yes @gltf-transform/cli optimize $InputGlb $OutputGlb `
    --compress draco `
    --texture-compress webp `
    --texture-size 1024 `
    --simplify false

Move-Item -Force $OutputGlb $InputGlb
$sizeMb = (Get-Item $InputGlb).Length / 1MB
Write-Host "Pronto: $InputGlb ($([math]::Round($sizeMb, 2)) MB)"
