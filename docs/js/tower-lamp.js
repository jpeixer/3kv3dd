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

function normalizeNodeName(name) {
  return (name || '').replace(/ /g, '_');
}

function nodeNamesMatch(a, b) {
  return normalizeNodeName(a) === normalizeNodeName(b);
}

function findTowerLampRoots(model, config) {
  const rootNames = config?.towerLamp?.rootNames
    ?? (config?.towerLamp?.rootName ? [config.towerLamp.rootName] : ['tower lamp']);
  const extraRoots = config?.towerLamp?.extraRootNames ?? [];
  const allRootNames = [...rootNames, ...extraRoots];

  const roots = [];
  model.traverse((node) => {
    if (allRootNames.some((name) => nodeNamesMatch(node.name, name))) roots.push(node);
  });
  return roots;
}

function findLedsInRoot(root, redName, greenName) {
  let red = null;
  let green = null;
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (child.name === redName) red = child;
    if (child.name === greenName) green = child;
  });
  return { red, green };
}

function findAllTowerLamps(model, config) {
  const redName = config?.towerLamp?.redNode ?? 'red';
  const greenName = config?.towerLamp?.greenNode ?? 'green';
  const roots = findTowerLampRoots(model, config);

  const lamps = roots.map((root) => findLedsInRoot(root, redName, greenName));

  if (!lamps.length) {
    let red = null;
    let green = null;
    model.traverse((child) => {
      if (!child.isMesh) return;
      if (child.name === redName) red = child;
      if (child.name === greenName) green = child;
    });
    if (red || green) lamps.push({ red, green });
  }

  return lamps;
}

export class TowerLampController {
  constructor(model, config) {
    this.config = config;
    this.lampIntensity = config?.towerLamp?.emissiveIntensity ?? LAMP_EMISSIVE_INTENSITY;
    this.blinkMs = config?.towerLamp?.blinkMs ?? BLINK_MS;
    this.operational = false;
    this.buzzer = new SafetyBuzzer();
    this.rafId = 0;

    this.lamps = findAllTowerLamps(model, config);
    this.lamps.forEach(({ red, green }) => {
      if (red) {
        isolateMaterials(red);
        (Array.isArray(red.material) ? red.material : [red.material]).forEach(prepareLedMaterial);
      }
      if (green) {
        isolateMaterials(green);
        (Array.isArray(green.material) ? green.material : [green.material]).forEach(prepareLedMaterial);
      }
    });

    const ready = this.lamps.filter(({ red, green }) => red && green);
    if (!ready.length) {
      console.warn('[tower-lamp] red/green meshes not found on configured tower lamp roots.');
    } else {
      console.info(`[tower-lamp] ${ready.length} tower(s) synced`);
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
    this.lamps.forEach(({ red, green }) => {
      applyLampGlow(red, false, LAMP_COLORS.red, this.lampIntensity);
      applyLampGlow(green, true, LAMP_COLORS.green, this.lampIntensity);
    });
  }

  setEnergizedPhase(on) {
    this.lamps.forEach(({ red, green }) => {
      applyLampGlow(red, on, LAMP_COLORS.red, this.lampIntensity);
      applyLampGlow(green, false, LAMP_COLORS.green, this.lampIntensity);
    });
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
