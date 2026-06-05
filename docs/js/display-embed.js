import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

const MAX_DISPLAY_VERTS = 5000;

/** Clona materiais para não afetar outros meshes que compartilham a mesma referência (ex.: Tool Cart). */
function isolateMaterials(mesh) {
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((m) => (m ? m.clone() : m));
  } else if (mesh.material) {
    mesh.material = mesh.material.clone();
  }
}

function hideTabletSurface(material) {
  if (!material) return;
  material.transparent = true;
  material.opacity = 0;
  material.depthWrite = false;
}

/** Encontra apenas o mesh pequeno do tablet (Plane), nunca um join gigante. */
function findTabletPlane(model, nodeName) {
  let best = null;
  let bestVerts = Infinity;

  model.traverse((child) => {
    if (!child.isMesh || child.name !== nodeName) return;
    const verts = child.geometry?.attributes?.position?.count ?? Infinity;
    if (verts > MAX_DISPLAY_VERTS || verts >= bestVerts) return;
    best = child;
    bestVerts = verts;
  });

  return best;
}

export function createCssRenderer(container) {
  const cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(container.clientWidth, container.clientHeight);
  cssRenderer.domElement.style.position = 'absolute';
  cssRenderer.domElement.style.inset = '0';
  cssRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(cssRenderer.domElement);
  return cssRenderer;
}

export function attachDisplayEmbed({ model, config, controls }) {
  const display = config?.display;
  if (!display?.embedUrl) return null;

  const nodeName = display.nodeName || 'Plane';
  const plane = findTabletPlane(model, nodeName);
  if (!plane) {
    console.warn(`[display] Mesh "${nodeName}" do tablet não encontrado (≤${MAX_DISPLAY_VERTS} vértices).`);
    return null;
  }

  isolateMaterials(plane);
  const materials = Array.isArray(plane.material) ? plane.material : [plane.material];
  materials.forEach(hideTabletSurface);

  const pixelWidth = display.pixelWidth || 1280;
  const pixelHeight = display.pixelHeight || 800;
  const bezel = display.bezelPx ?? 10;

  const screen = document.createElement('div');
  screen.style.width = `${pixelWidth}px`;
  screen.style.height = `${pixelHeight}px`;
  screen.style.overflow = 'hidden';
  screen.style.borderRadius = `${display.borderRadiusPx ?? 6}px`;
  screen.style.background = '#0a0c10';
  screen.style.boxShadow = 'inset 0 0 0 3px #1a1e26, 0 0 0 1px #3c4048';
  screen.style.pointerEvents = 'auto';

  const iframe = document.createElement('iframe');
  iframe.src = display.embedUrl;
  iframe.title = display.title || 'Display';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  iframe.style.display = 'block';
  iframe.style.background = '#0f1419';
  iframe.loading = 'lazy';
  screen.appendChild(iframe);

  screen.addEventListener('pointerenter', () => {
    if (controls) controls.enabled = false;
  });
  screen.addEventListener('pointerleave', () => {
    if (controls) controls.enabled = true;
  });

  plane.geometry.computeBoundingBox();
  const bb = plane.geometry.boundingBox;
  const localWidth = Math.max(bb.max.x - bb.min.x, 0.001);
  const localDepth = Math.max(bb.max.z - bb.min.z, 0.001);
  const centerX = (bb.min.x + bb.max.x) * 0.5;
  const centerY = (bb.min.y + bb.max.y) * 0.5;
  const centerZ = (bb.min.z + bb.max.z) * 0.5;

  const insetW = Math.max(localWidth - bezel * 0.002, localWidth * 0.92);
  const insetD = Math.max(localDepth - bezel * 0.002, localDepth * 0.92);

  const cssObject = new CSS3DObject(screen);
  cssObject.position.set(centerX, centerY + 0.003, centerZ);
  cssObject.rotation.x = -Math.PI / 2;
  cssObject.scale.set(insetW / pixelWidth, insetD / pixelHeight, 1);

  plane.add(cssObject);
  console.info(
    `[display] Tablet em "${plane.name}" (${plane.geometry.attributes.position.count} verts) → ${display.embedUrl}`,
  );
  return { iframe, plane, cssObject };
}

export function resizeCssRenderer(cssRenderer, width, height) {
  if (!cssRenderer) return;
  cssRenderer.setSize(width, height);
}

export function renderCssScene(cssRenderer, scene, camera) {
  if (!cssRenderer) return;
  cssRenderer.render(scene, camera);
}
