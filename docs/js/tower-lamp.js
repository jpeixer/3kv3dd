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

function setMaterialGlow(material, on, hexColor, intensity = LAMP_EMISSIVE_INTENSITY) {
  if (!material) return;
  const mats = Array.isArray(material) ? material : [material];
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

function normalizeNodeName(name) {
  return (name || '').replace(/ /g, '_');
}

function isTowerLampRootName(name) {
  const n = normalizeNodeName(name);
  return /^tower_lamp(\d+|_\(\d+\))?$/.test(n);
}

function isUnderTowerLamp(node) {
  let current = node?.parent ?? null;
  while (current) {
    if (isTowerLampRootName(current.name)) return true;
    current = current.parent;
  }
  return false;
}

/** Collect every red/green LED mesh under any tower-lamp root (works with shared GLB meshes). */
function findAllTowerLedMeshes(model, config) {
  const redName = config?.towerLamp?.redNode ?? 'red';
  const greenName = config?.towerLamp?.greenNode ?? 'green';
  const reds = [];
  const greens = [];

  model.traverse((child) => {
    if (!child.isMesh || !isUnderTowerLamp(child)) return;
    if (child.name === redName) reds.push(child);
    if (child.name === greenName) greens.push(child);
  });

  return { reds, greens };
}

/** One shared material per color — both towers always show the same LED state. */
function linkSharedMaterial(meshes) {
  if (!meshes.length) return null;
  const source = Array.isArray(meshes[0].material) ? meshes[0].material[0] : meshes[0].material;
  const shared = source ? source.clone() : new THREE.MeshStandardMaterial();
  prepareLedMaterial(shared);
  meshes.forEach((mesh) => {
    mesh.material = shared;
  });
  return shared;
}

export class TowerLampController {
  constructor(model, config) {
    this.config = config;
    this.lampIntensity = config?.towerLamp?.emissiveIntensity ?? LAMP_EMISSIVE_INTENSITY;
    this.blinkMs = config?.towerLamp?.blinkMs ?? BLINK_MS;
    this.operational = false;
    this.buzzer = new SafetyBuzzer();
    this.blinkTimer = 0;

    const { reds, greens } = findAllTowerLedMeshes(model, config);
    this.reds = reds;
    this.greens = greens;
    this.redMaterial = linkSharedMaterial(reds);
    this.greenMaterial = linkSharedMaterial(greens);

    if (!this.redMaterial || !this.greenMaterial) {
      console.warn('[tower-lamp] red/green meshes not found under tower lamp roots.');
    } else {
      console.info(
        `[tower-lamp] linked ${reds.length} red + ${greens.length} green mesh(es) to shared materials`,
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
    setMaterialGlow(this.redMaterial, false, LAMP_COLORS.red, this.lampIntensity);
    setMaterialGlow(this.greenMaterial, true, LAMP_COLORS.green, this.lampIntensity);
  }

  setEnergizedPhase(on) {
    setMaterialGlow(this.redMaterial, on, LAMP_COLORS.red, this.lampIntensity);
    setMaterialGlow(this.greenMaterial, false, LAMP_COLORS.green, this.lampIntensity);
  }

  startBlinkLoop() {
    this.stopBlinkLoop();
    const tick = () => {
      if (!this.operational) return;
      const on = Math.floor(Date.now() / this.blinkMs) % 2 === 0;
      this.setEnergizedPhase(on);
    };
    tick();
    this.blinkTimer = window.setInterval(tick, this.blinkMs);
  }

  stopBlinkLoop() {
    if (this.blinkTimer) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = 0;
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
