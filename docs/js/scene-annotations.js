import * as THREE from 'three';

const DEFAULT_ANNOTATIONS = [
  { nodeName: 'Plane (1)', label: 'HIPOT UG36 ETL', labelOffset: [100, -72] },
  { nodeName: 'Tool Cart', label: 'Aluminum frame enclosure', labelOffset: [-140, -80] },
  { nodeName: 'Plane', label: 'Screen 13"', maxVerts: 5000, labelOffset: [90, -64] },
  { nodeName: 'tower lamp', label: 'Towerlamp + Horn', labelOffset: [-130, -76] },
  { nodeName: 'BACK_CHASSIS', label: 'PLC, Database integration SIVAS, CSV, etc. 12 Channels with 10kV relay', labelOffset: [110, -88] },
  { nodeName: 'GraphicT', label: '11" Tablet', labelOffset: [95, -68] },
  { nodeName: 'control panel', label: 'Key switch Enable selection, E-stop, Local/Remote Control', labelOffset: [-120, -82] },
  { nodeName: 'posteseg', label: '3X Barrier Safety post with stop button and tower lamp', labelOffset: [105, -78] },
];

const CLICK_MAX_PX = 14;

/** gltf-transform renames "Tool Cart" → "Tool_Cart", "Plane (1)" → "Plane_(1)". */
function normalizeNodeName(name) {
  return (name || '').replace(/ /g, '_');
}

function nodeNamesMatch(a, b) {
  return normalizeNodeName(a) === normalizeNodeName(b);
}

function collectMeshes(root) {
  const meshes = [];
  root.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  return meshes;
}

/** Closest ancestor name match (hit object → parents). */
function resolveAnnotationIndex(object, entries) {
  let node = object;
  while (node) {
    for (const entry of entries) {
      if (!nodeNamesMatch(node.name, entry.nodeName)) continue;
      if (entry.maxVerts != null) {
        const mesh = object.isMesh ? object : (node.isMesh ? node : null);
        if (!mesh?.isMesh) continue;
        const verts = mesh.geometry?.attributes?.position?.count ?? Infinity;
        if (verts > entry.maxVerts) continue;
      }
      return entries.indexOf(entry);
    }
    node = node.parent;
  }
  return -1;
}

function anchorWorldPoint(mesh, hitPoint = null) {
  if (hitPoint) return hitPoint.clone();
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox.clone();
  const top = new THREE.Vector3(
    (box.min.x + box.max.x) * 0.5,
    box.max.y,
    (box.min.z + box.max.z) * 0.5,
  );
  return mesh.localToWorld(top);
}

function projectPoint(point, camera, width, height) {
  const p = point.clone().project(camera);
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  if (point.clone().sub(camera.position).dot(forward) <= 0) return null;
  return {
    x: (p.x * 0.5 + 0.5) * width,
    y: (-p.y * 0.5 + 0.5) * height,
    depth: p.z,
  };
}

function clampLabel(x, y, labelW, labelH, margin, width, height) {
  const maxX = width - labelW - margin;
  const maxY = height - labelH - margin;
  return {
    x: Math.min(Math.max(margin, x), Math.max(margin, maxX)),
    y: Math.min(Math.max(margin, y), Math.max(margin, maxY)),
  };
}

function labelAnchorPoint(labelX, labelY, labelW, labelH, targetX, targetY) {
  const cx = labelX + labelW * 0.5;
  const cy = labelY + labelH * 0.5;
  const dx = targetX - cx;
  const dy = targetY - cy;
  const hw = labelW * 0.5;
  const hh = labelH * 0.5;
  const scale = Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh, 1e-6);
  return { x: cx + dx / scale, y: cy + dy / scale };
}

export class SceneAnnotations {
  constructor({ model, camera, canvas, canvasWrap, config }) {
    this.model = model;
    this.camera = camera;
    this.canvas = canvas;
    this.canvasWrap = canvasWrap || canvas.parentElement;
    this.entries = config?.annotations?.length ? config.annotations : DEFAULT_ANNOTATIONS;
    this.pickableMeshes = collectMeshes(model);
    this.activeIndex = -1;
    this.activeMesh = null;
    this.activeHitPoint = null;
    this.anchor = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerDown = null;

    this.root = document.createElement('div');
    this.root.id = 'annotation-layer';
    this.root.innerHTML = `
      <svg id="annotation-svg" aria-hidden="true"><line id="annotation-line"></line></svg>
      <div id="annotation-label" class="hidden"></div>
    `;
    this.canvasWrap.appendChild(this.root);

    this.svg = this.root.querySelector('#annotation-svg');
    this.line = this.root.querySelector('#annotation-line');
    this.labelEl = this.root.querySelector('#annotation-label');

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);

    this.canvas.addEventListener('pointerdown', this.onPointerDown, true);
    this.canvas.addEventListener('pointerup', this.onPointerUp, true);

    console.info(`[annotations] ${this.pickableMeshes.length} meshes, ${this.entries.length} labels`);
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    this.pointerDown = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
    };
  }

  onPointerUp(event) {
    if (event.button !== 0 || !this.pointerDown) return;
    if (event.pointerId !== this.pointerDown.id) return;

    const dx = event.clientX - this.pointerDown.x;
    const dy = event.clientY - this.pointerDown.y;
    const dist = Math.hypot(dx, dy);
    this.pointerDown = null;

    if (dist > CLICK_MAX_PX) return;
    this.pick(event);
  }

  pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.model.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(this.pickableMeshes, false);
    for (const hit of hits) {
      const index = resolveAnnotationIndex(hit.object, this.entries);
      if (index >= 0) {
        this.select(index, hit.object, hit.point);
        return;
      }
    }
    this.clear();
  }

  select(index, mesh, hitPoint) {
    this.activeIndex = index;
    this.activeMesh = mesh;
    this.activeHitPoint = hitPoint;
    this.root.classList.add('visible');
    this.labelEl.classList.remove('hidden');
    this.labelEl.textContent = this.entries[index].label;
    this.updateLayout();
  }

  clear() {
    this.activeIndex = -1;
    this.activeMesh = null;
    this.activeHitPoint = null;
    this.root.classList.remove('visible');
    this.labelEl.classList.add('hidden');
  }

  updateLayout() {
    if (this.activeIndex < 0 || !this.activeMesh) return;

    const entry = this.entries[this.activeIndex];
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;

    this.svg.setAttribute('width', width);
    this.svg.setAttribute('height', height);

    this.anchor.copy(anchorWorldPoint(this.activeMesh, this.activeHitPoint));
    const projected = projectPoint(this.anchor, this.camera, width, height);
    if (!projected) {
      this.root.classList.remove('visible');
      return;
    }

    this.root.classList.add('visible');
    this.labelEl.textContent = entry.label;

    const offset = entry.labelOffset || [96, -72];
    this.labelEl.style.visibility = 'hidden';
    this.labelEl.classList.remove('hidden');
    const labelW = this.labelEl.offsetWidth || 160;
    const labelH = this.labelEl.offsetHeight || 40;
    const pos = clampLabel(
      projected.x + offset[0],
      projected.y + offset[1],
      labelW,
      labelH,
      12,
      width,
      height,
    );
    this.labelEl.style.left = `${pos.x}px`;
    this.labelEl.style.top = `${pos.y}px`;
    this.labelEl.style.visibility = 'visible';

    const labelW2 = this.labelEl.offsetWidth;
    const labelH2 = this.labelEl.offsetHeight;
    const edge = labelAnchorPoint(pos.x, pos.y, labelW2, labelH2, projected.x, projected.y);

    this.line.setAttribute('x1', projected.x);
    this.line.setAttribute('y1', projected.y);
    this.line.setAttribute('x2', edge.x);
    this.line.setAttribute('y2', edge.y);
  }

  update() {
    if (this.activeIndex >= 0) this.updateLayout();
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown, true);
    this.canvas.removeEventListener('pointerup', this.onPointerUp, true);
    this.root.remove();
  }
}
