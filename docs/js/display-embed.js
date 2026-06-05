import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

function hideMaterial(material) {
  if (!material) return;
  material.transparent = true;
  material.opacity = 0;
  material.depthWrite = false;
}

function findDisplayMesh(model, nodeName) {
  let match = null;
  model.traverse((child) => {
    if (!child.isMesh || match) return;
    if (child.name === nodeName || child.name.toLowerCase() === nodeName.toLowerCase()) {
      match = child;
    }
  });
  return match;
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
  const plane = findDisplayMesh(model, nodeName);
  if (!plane) {
    console.warn(`[display] Mesh "${nodeName}" não encontrado no GLB.`);
    return null;
  }

  const materials = Array.isArray(plane.material) ? plane.material : [plane.material];
  materials.forEach(hideMaterial);

  const pixelWidth = display.pixelWidth || 1280;
  const pixelHeight = display.pixelHeight || 800;

  const iframe = document.createElement('iframe');
  iframe.src = display.embedUrl;
  iframe.title = display.title || 'Display';
  iframe.style.width = `${pixelWidth}px`;
  iframe.style.height = `${pixelHeight}px`;
  iframe.style.border = '0';
  iframe.style.background = '#0f1419';
  iframe.style.borderRadius = '2px';
  iframe.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.12)';
  iframe.style.pointerEvents = 'auto';
  iframe.loading = 'lazy';

  iframe.addEventListener('pointerenter', () => {
    if (controls) controls.enabled = false;
  });
  iframe.addEventListener('pointerleave', () => {
    if (controls) controls.enabled = true;
  });

  plane.geometry.computeBoundingBox();
  const bb = plane.geometry.boundingBox;
  const localWidth = Math.max(bb.max.x - bb.min.x, 0.001);
  const localDepth = Math.max(bb.max.z - bb.min.z, 0.001);
  const centerX = (bb.min.x + bb.max.x) * 0.5;
  const centerY = (bb.min.y + bb.max.y) * 0.5;
  const centerZ = (bb.min.z + bb.max.z) * 0.5;

  const cssObject = new CSS3DObject(iframe);
  cssObject.position.set(centerX, centerY + 0.002, centerZ);
  cssObject.rotation.x = -Math.PI / 2;
  cssObject.scale.set(localWidth / pixelWidth, localDepth / pixelHeight, 1);

  plane.add(cssObject);
  console.info(`[display] Embed ativo em "${plane.name}" → ${display.embedUrl}`);
  return cssObject;
}

export function resizeCssRenderer(cssRenderer, width, height) {
  if (!cssRenderer) return;
  cssRenderer.setSize(width, height);
}

export function renderCssScene(cssRenderer, scene, camera) {
  if (!cssRenderer) return;
  cssRenderer.render(scene, camera);
}
