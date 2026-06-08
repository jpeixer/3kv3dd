import * as THREE from 'three';

const DEFAULT_ANNOTATIONS = [
  { nodeName: 'Plane (1)', label: 'HIPOT UG36 ETL', labelOffset: [100, -72] },
  { nodeName: 'Tool Cart', label: 'Aluminum frame enclosure', matchHierarchy: true, labelOffset: [-140, -80] },
  { nodeName: 'Plane', label: 'Screen 13"', maxVerts: 5000, labelOffset: [90, -64] },
];

function findMeshByName(model, nodeName, maxVerts = Infinity) {
  let best = null;
  let bestVerts = Infinity;
  model.traverse((child) => {
    if (!child.isMesh || child.name !== nodeName) return;
    const verts = child.geometry?.attributes?.position?.count ?? Infinity;
    if (verts > maxVerts || verts >= bestVerts) return;
    best = child;
    bestVerts = verts;
  });
  return best;
}

function resolveAnnotationMesh(model, entry) {
  if (entry.maxVerts != null) return findMeshByName(model, entry.nodeName, entry.maxVerts);
  if (entry.matchHierarchy) {
    let found = null;
    model.traverse((child) => {
      if (found || !child.isMesh) return;
      let node = child;
      while (node) {
        if (node.name === entry.nodeName) {
          found = child;
          break;
        }
        node = node.parent;
      }
    });
    return found;
  }
  return findMeshByName(model, entry.nodeName);
}

function buildMeshIndex(model, entries) {
  const meshes = [];
  entries.forEach((entry, index) => {
    const mesh = resolveAnnotationMesh(model, entry);
    if (mesh) meshes.push({ mesh, entry, index });
    else console.warn(`[annotations] Mesh not found for "${entry.nodeName}"`);
  });
  return meshes;
}

function anchorWorldPoint(mesh) {
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
  if (p.z < -1 || p.z > 1) return null;
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
  constructor({ model, camera, canvas, config }) {
    this.model = model;
    this.camera = camera;
    this.canvas = canvas;
    this.entries = config?.annotations?.length ? config.annotations : DEFAULT_ANNOTATIONS;
    this.meshIndex = buildMeshIndex(model, this.entries);
    this.activeIndex = -1;
    this.anchor = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragStart = null;

    this.root = document.createElement('div');
    this.root.id = 'annotation-layer';
    this.root.innerHTML = `
      <svg id="annotation-svg" aria-hidden="true"><line id="annotation-line"></line></svg>
      <div id="annotation-label" class="hidden"></div>
    `;
    canvas.parentElement.appendChild(this.root);

    this.svg = this.root.querySelector('#annotation-svg');
    this.line = this.root.querySelector('#annotation-line');
    this.labelEl = this.root.querySelector('#annotation-label');

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
  }

  onPointerDown = (event) => {
    if (event.button !== 0) return;
    this.dragStart = { x: event.clientX, y: event.clientY };
  };

  onPointerUp = (event) => {
    if (event.button !== 0 || !this.dragStart) return;
    const dx = event.clientX - this.dragStart.x;
    const dy = event.clientY - this.dragStart.y;
    this.dragStart = null;
    if (Math.hypot(dx, dy) > 6) return;
    this.pick(event);
  };

  pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const meshes = this.meshIndex.map((item) => item.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) {
      this.clear();
      return;
    }

    const hitMesh = hits[0].object;
    const match = this.meshIndex.find((item) => item.mesh === hitMesh);
    if (match) this.select(match.index);
  }

  select(index) {
    if (this.activeIndex === index) return;
    this.activeIndex = index;
    this.root.classList.add('visible');
    this.labelEl.classList.remove('hidden');
    this.labelEl.textContent = this.entries[index].label;
    this.updateLayout();
  }

  clear() {
    this.activeIndex = -1;
    this.root.classList.remove('visible');
    this.labelEl.classList.add('hidden');
  }

  updateLayout() {
    if (this.activeIndex < 0) return;

    const { mesh, entry } = this.meshIndex[this.activeIndex];
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;

    this.svg.setAttribute('width', width);
    this.svg.setAttribute('height', height);

    this.anchor.copy(anchorWorldPoint(mesh));
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
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.root.remove();
  }
}
