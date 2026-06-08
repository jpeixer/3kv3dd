import * as THREE from 'three';

function normalizeNodeName(name) {
  return (name || '').replace(/ /g, '_');
}

function nodeNamesMatch(a, b) {
  return normalizeNodeName(a) === normalizeNodeName(b);
}

function isTowerLampRootName(name) {
  return /tower[\s_]?lamp/i.test(name || '');
}

/** gltf-transform often corrupts KHR_texture_transform on export — reapply Unity tiling in the viewer. */
export function applyMaterialOverrides(model, config) {
  const overrides = config?.materials;
  if (!overrides) return;

  model.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((mat) => {
      if (!mat) return;
      const entry = Object.entries(overrides).find(([name]) => nodeNamesMatch(mat.name, name));
      if (!entry) return;

      const [, spec] = entry;
      const [tx, ty] = spec.tiling || [1, 1];
      const [ox, oy] = spec.offset || [0, 0];

      if (mat.map) {
        mat.map.wrapS = THREE.RepeatWrapping;
        mat.map.wrapT = THREE.RepeatWrapping;
        mat.map.repeat.set(tx, ty);
        mat.map.offset.set(ox, oy);
        mat.map.needsUpdate = true;
      }
      mat.needsUpdate = true;
    });
  });
}
