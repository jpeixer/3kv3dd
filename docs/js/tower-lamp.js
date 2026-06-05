import * as THREE from 'three';
import { SafetyBuzzer } from './safety-buzzer.js';

const BLINK_MS = 500;

function isolateMaterials(mesh) {
  if (!mesh?.isMesh) return;
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((m) => (m ? m.clone() : m));
  } else if (mesh.material) {
    mesh.material = mesh.material.clone();
  }
}

function applyLampGlow(mesh, on, hexColor, intensity = 2.2) {
  if (!mesh?.isMesh) return;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach((m) => {
    if (!m) return;
    if (!m.emissive) return;
    if (on) {
      m.emissive.setHex(hexColor);
      m.emissiveIntensity = intensity;
    } else {
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
    }
  });
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
    this.operational = false;
    this.buzzer = new SafetyBuzzer();
    this.rafId = 0;

    const { red, green } = findTowerLampMeshes(model, config);
    this.red = red;
    this.green = green;

    if (red) isolateMaterials(red);
    if (green) isolateMaterials(green);

    if (!red || !green) {
      console.warn('[tower-lamp] Meshes red/green nao encontrados em "tower lamp".');
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
    applyLampGlow(this.red, false, 0xff0000);
    applyLampGlow(this.green, true, 0x22cc44);
  }

  setEnergizedPhase(on) {
    applyLampGlow(this.red, on, 0xff2222);
    applyLampGlow(this.green, false, 0x22cc44);
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
