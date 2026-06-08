import * as THREE from 'three';
import { SafetyBuzzer } from './safety-buzzer.js';

const BLINK_MS = 500;
const LAMP_COLORS = {
  red: 0xff1a1a,
  green: 0x00e676,
  off: 0x141414,
};
const LAMP_EMISSIVE_INTENSITY = 2.5;

function prepareLedMaterial(m) {
  if (!m) return;
  m.metalness = 0;
  m.roughness = 1;
  if ('emissiveIntensity' in m) m.emissiveIntensity = 0;
  if (m.emissive) m.emissive.setHex(0x000000);
  if (m.color) m.color.setHex(LAMP_COLORS.off);
  m.toneMapped = false;
  m.needsUpdate = true;
}

function applyLampGlow(mesh, on, hexColor, intensity = LAMP_EMISSIVE_INTENSITY) {
  if (!mesh?.isMesh) return;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach((m) => {
    if (!m) return;
    m.metalness = 0;
    m.roughness = 1;
    m.toneMapped = false;
    if (on) {
      if (m.color) m.color.setHex(hexColor);
      if (m.emissive) m.emissive.setHex(hexColor);
      if ('emissiveIntensity' in m) m.emissiveIntensity = intensity;
    } else {
      if (m.color) m.color.setHex(LAMP_COLORS.off);
      if (m.emissive) m.emissive.setHex(0x000000);
      if ('emissiveIntensity' in m) m.emissiveIntensity = 0;
    }
    m.needsUpdate = true;
  });
}

function ensureUniqueMaterials(mesh) {
  if (!mesh?.isMesh) return;
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((m) => (m ? m.clone() : m));
  } else if (mesh.material) {
    mesh.material = mesh.material.clone();
  }
}

function normalizeNodeName(name) {
  return (name || '').replace(/ /g, '_');
}

function nodeNamesMatch(a, b) {
  return normalizeNodeName(a) === normalizeNodeName(b);
}

function isTowerLampRootName(name) {
  return /tower[\s_]?lamp/i.test(name || '');
}

function findLedsInRoot(root, redName, greenName) {
  const reds = [];
  const greens = [];
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (child.name === redName) reds.push(child);
    if (child.name === greenName) greens.push(child);
  });
  return { reds, greens };
}

function findTowerLampRoots(model, config) {
  const configured = [
    ...(config?.towerLamp?.rootNames ?? []),
    ...(config?.towerLamp?.rootName ? [config.towerLamp.rootName] : []),
    ...(config?.towerLamp?.extraRootNames ?? []),
  ];
  const uniqueConfigured = [...new Set(configured.map(normalizeNodeName))];

  const roots = [];
  model.traverse((node) => {
    if (uniqueConfigured.some((name) => nodeNamesMatch(node.name, name))) roots.push(node);
  });

  if (roots.length) return roots;

  model.traverse((node) => {
    if (!isTowerLampRootName(node.name)) return;
    const { reds, greens } = findLedsInRoot(
      node,
      config?.towerLamp?.redNode ?? 'red',
      config?.towerLamp?.greenNode ?? 'green',
    );
    if (reds.length && greens.length) roots.push(node);
  });

  return roots;
}

function findAllTowerLedMeshes(model, config) {
  const redName = config?.towerLamp?.redNode ?? 'red';
  const greenName = config?.towerLamp?.greenNode ?? 'green';
  const roots = findTowerLampRoots(model, config);
  const reds = [];
  const greens = [];

  const collect = (root) => {
    const found = findLedsInRoot(root, redName, greenName);
    reds.push(...found.reds);
    greens.push(...found.greens);
  };

  if (roots.length) roots.forEach(collect);
  else {
    model.traverse((child) => {
      if (!child.isMesh) return;
      if (child.name === redName) reds.push(child);
      if (child.name === greenName) greens.push(child);
    });
  }

  return { reds, greens, roots };
}

export class TowerLampController {
  constructor(model, config) {
    this.config = config;
    this.lampIntensity = config?.towerLamp?.emissiveIntensity ?? LAMP_EMISSIVE_INTENSITY;
    this.blinkMs = config?.towerLamp?.blinkMs ?? BLINK_MS;
    this.operational = false;
    this.buzzer = new SafetyBuzzer();
    this.rafId = 0;

    const { reds, greens, roots } = findAllTowerLedMeshes(model, config);
    this.reds = reds;
    this.greens = greens;

    [...reds, ...greens].forEach((mesh) => {
      ensureUniqueMaterials(mesh);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(prepareLedMaterial);
    });

    if (!reds.length || !greens.length) {
      console.warn('[tower-lamp] red/green meshes not found on configured tower lamp roots.');
    } else {
      console.info(
        `[tower-lamp] ${roots.length || 'auto'} root(s), ${reds.length} red + ${greens.length} green LED mesh(es) synced`,
      );
      this.setIdle();
    }
  }

  unlockAudio() {
    this.buzzer.unlock();
  }

  setOperational(on) {
    if (this.operational === on) return;
    this.operational = on;
    if (on) {
      this.buzzer.start();
      this.startBlinkLoop();
    } else {
      this.buzzer.stop();
      this.stopBlinkLoop();
      this.setIdle();
    }
  }

  setIdle() {
    this.reds.forEach((mesh) => applyLampGlow(mesh, false, LAMP_COLORS.red, this.lampIntensity));
    this.greens.forEach((mesh) => applyLampGlow(mesh, true, LAMP_COLORS.green, this.lampIntensity));
  }

  setEnergizedPhase(on) {
    this.reds.forEach((mesh) => applyLampGlow(mesh, on, LAMP_COLORS.red, this.lampIntensity));
    this.greens.forEach((mesh) => applyLampGlow(mesh, false, LAMP_COLORS.green, this.lampIntensity));
  }

  startBlinkLoop() {
    this.stopBlinkLoop();
    const tick = () => {
      if (!this.operational) return;
      const on = Math.floor(Date.now() / this.blinkMs) % 2 === 0;
      this.setEnergizedPhase(on);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stopBlinkLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  dispose() {
    this.setOperational(false);
    this.buzzer.dispose();
  }
}

export function listenEmbedSafety(onOperationalChange) {
  const handler = (event) => {
    const data = event.data;
    if (!data || data.type !== '3kv:safety') return;
    onOperationalChange(Boolean(data.operational));
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
