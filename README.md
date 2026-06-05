# 3kv3dd

Projeto Unity 6 (URP) com cena industrial montada no editor — painel de controle, chassi, carrinho de ferramentas, PLC, tablet gráfico e torre sinalizadora.

## Visualização 3D (GitHub Pages)

A visualização web interativa está em [`docs/`](docs/):

- **URL:** https://jpeixer.github.io/3kv3dd/
- Arraste para girar, scroll para zoom, botão direito para mover a câmera.
- O **Plane** da cena exibe o portal [3kv](https://jpeixer.github.io/3kv/) embarcado como tela interativa no viewer web.
- **Torre sinalizadora** (`tower lamp`): **verde** aceso quando o ensaio está parado; **vermelho** piscando + **buzina** (0,5 s / 0,5 s) durante o ensaio em `/test` (high voltage).

### Publicar / atualizar o site

1. Na Unity: **3kv3dd → Export for Web** (gera `docs/assets/scene.glb` bruto).
2. No terminal: `.\scripts\optimize-web-glb.ps1` (comprime com Draco + WebP, **sem** simplificar malhas).
3. Commit e push da pasta `docs/` para o branch `main`.
4. GitHub Pages publica automaticamente via workflow em `.github/workflows/pages.yml`.

### Testar localmente

```bash
npx --yes serve docs
```

## Elementos na cena

| Objeto | Descrição |
|--------|-----------|
| Tool Cart | Carrinho de ferramentas |
| plc | CLP / controlador |
| BACK_CHASSIS | Chassi traseiro |
| control panel | Painel de controle |
| H3000_PanelControl | Painel H3000 |
| GraphicT | Tablet gráfico |
| tower lamp | Torre sinalizadora |
| Plane | Tela embarcada — portal [3kv](https://jpeixer.github.io/3kv/) |

## Requisitos

- Unity **6000.0.41f1** ou compatível
- Universal Render Pipeline (URP)
- Pacote **glTFast** (`com.unity.cloud.gltfast`) — já no `Packages/manifest.json`

## Abrir no Unity

1. Clone o repositório.
2. Abra a pasta do projeto no Unity Hub.
3. Abra a cena `Assets/Scenes/SampleScene.unity`.

## MCP Unity

O projeto inclui o pacote [MCPForUnity](https://github.com/CoplayDev/unity-mcp) para integração com agentes via Model Context Protocol.

## Estrutura

```
Assets/
  Editor/WebExportMenu.cs   # Menu 3kv3dd → Export for Web
  Scripts/DisplayScreen.cs  # Marca o Plane como display embarcado
  Scenes/SampleScene.unity  # Cena principal
docs/
  index.html                # Visualizador Three.js + iframe no Plane
  data/viewer-config.json   # URL do embed (3kv)
  js/display-embed.js       # CSS3D iframe no mesh Plane
  js/tower-lamp.js          # Sinaleiro + listener postMessage 3kv
  js/safety-buzzer.js       # Buzina 500 ms ON/OFF
  assets/scene.glb          # Modelo exportado (fora do LFS)
scripts/
  optimize-web-glb.ps1      # Pós-processamento Draco/WebP
```

## Licença

Assets de terceiros podem ter licenças próprias — consulte as pastas de origem em `Assets/`.
