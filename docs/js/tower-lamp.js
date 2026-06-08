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

function isolateMaterials(mesh) {
  if (!mesh?.isMesh) return;
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((m) => (m ? m.clone() : m));
  } else if (mesh.material) {
    mesh.material = mesh.material.clone();
  }
}

function findTowerLampMeshes(model, config) {
  const rootName = config?.towerLamp?.rootName ?? 'tower lamp';
  const redName = config?.towerLamp?.redNode ?? 'red';
  const greenName = config?.towerLamp?.greenNode ?? 'green';

  let root = null;
  model.traverse((node) => {
    if (node.name === rootName) root = node;
  });

  let red = null;
  let green = null;

  const search = (node) => {
    node.traverse((child) => {
      if (!child.isMesh) return;
      if (child.name === redName) red = child;
      if (child.name === greenName) green = child;
    });
  };

  if (root) search(root);
  else {
    model.traverse((child) => {
      if (!child.isMesh) return;
      if (child.name === redName) red = child;
      if (child.name === greenName) green = child;
    });
  }

  return { red, green };
}

export class TowerLampController {
  constructor(model, config) {
    this.config = config;
    this.lampIntensity = config?.towerLamp?.emissiveIntensity ?? LAMP_EMISSIVE_INTENSITY;
    this.operational = false;
    this.buzzer = new SafetyBuzzer();
    this.rafId = 0;

    const { red, green } = findTowerLampMeshes(model, config);
    this.red = red;
    this.green = green;

    if (red) {
      isolateMaterials(red);
      (Array.isArray(red.material) ? red.material : [red.material]).forEach(prepareLedMaterial);
    }
    if (green) {
      isolateMaterials(green);
      (Array.isArray(green.material) ? green.material : [green.material]).forEach(prepareLedMaterial);
    }

    if (!red || !green) {
      console.warn('[tower-lamp] red/green meshes not found on "tower lamp".');
    } else {
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
    applyLampGlow(this.red, false, LAMP_COLORS.red, this.lampIntensity);
    applyLampGlow(this.green, true, LAMP_COLORS.green, this.lampIntensity);
  }

  setEnergizedPhase(on) {
    applyLampGlow(this.red, on, LAMP_COLORS.red, this.lampIntensity);
    applyLampGlow(this.green, false, LAMP_COLORS.green, this.lampIntensity);
  }

  startBlinkLoop() {
    this.stopBlinkLoop();
    const tick = () => {
      if (!this.operational) return;
      const on = Math.floor(Date.now() / BLINK_MS) % 2 === 0;
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
