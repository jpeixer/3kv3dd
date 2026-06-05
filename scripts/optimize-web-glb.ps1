# Exporta GLB da Unity e otimiza para GitHub Pages (sem simplificar geometria).
param(
    [string]$InputGlb = "docs/assets/scene.glb",
    [string]$OutputGlb = "docs/assets/scene-web.glb"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

if (-not (Test-Path $InputGlb)) {
    throw "Arquivo nao encontrado: $InputGlb. Rode Export for Web na Unity primeiro."
}

$inputSize = (Get-Item $InputGlb).Length
if ($inputSize -lt 1024) {
    throw "GLB de entrada invalido ($inputSize bytes). Reexporte na Unity."
}

Write-Host "Otimizando $InputGlb ($([math]::Round($inputSize/1MB, 2)) MB) ..."
npx --yes @gltf-transform/cli optimize $InputGlb $OutputGlb `
    --compress draco `
    --texture-compress webp `
    --texture-size 1024 `
    --simplify false `
    --flatten false `
    --join false

Move-Item -Force $OutputGlb $InputGlb
$sizeMb = (Get-Item $InputGlb).Length / 1MB
Write-Host "Pronto: $InputGlb ($([math]::Round($sizeMb, 2)) MB)"
