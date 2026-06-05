# 3kv3dd

Projeto Unity 6 (URP) com cena industrial montada no editor — painel de controle, chassi, carrinho de ferramentas, PLC, tablet gráfico e torre sinalizadora.

## Visualização 3D (GitHub Pages)

A visualização web interativa está em [`docs/`](docs/):

- **URL:** https://jpeixer.github.io/3kv3dd/
- Arraste para girar, scroll para zoom, botão direito para mover a câmera.
- O modelo é exportado da cena `Assets/Scenes/SampleScene.unity` (versão simplificada para web).

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
| Plane | Superfície auxiliar |

## Requisitos

- Unity **6000.0.41f1** ou compatível
- Universal Render Pipeline (URP)

## Abrir no Unity

1. Clone o repositório.
2. Abra a pasta do projeto no Unity Hub.
3. Abra a cena `Assets/Scenes/SampleScene.unity`.

## MCP Unity

O projeto inclui o pacote [MCPForUnity](https://github.com/CoplayDev/unity-mcp) para integração com agentes via Model Context Protocol.

## Estrutura

```
Assets/
  Scenes/SampleScene.unity    # Cena principal
  UnityFactorySceneHDRP/      # Assets de fábrica (HDRP)
docs/
  index.html                  # Visualizador Three.js (GLTFLoader)
  assets/scene.glb            # Modelo exportado (fora do LFS, compatível com GitHub Pages)
```

## Licença

Assets de terceiros podem ter licenças próprias — consulte as pastas de origem em `Assets/`.
