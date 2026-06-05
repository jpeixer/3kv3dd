/** Buzina intermitente 0,5 s ligada / 0,5 s desligada (Web Audio API). */
export class SafetyBuzzer {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this.osc = null;
    this.active = false;
    this.tickTimer = null;
    this.unlocked = false;
  }

  unlock() {
    if (this.unlocked) return;
    this.ctx = new AudioContext();
    this.unlocked = true;
  }

  start() {
    if (this.active) return;
    this.active = true;
    if (!this.ctx) this.unlock();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    this.tickTimer = window.setInterval(() => this.pulse(), 500);
    this.pulse();
  }

  stop() {
    this.active = false;
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.silence();
  }

  pulse() {
    if (!this.active || !this.ctx) return;
    const phaseOn = Math.floor(Date.now() / 500) % 2 === 0;
    if (phaseOn) this.beep();
    else this.silence();
  }

  beep() {
    if (!this.ctx) return;
    this.silence();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.08;
    this.osc = this.ctx.createOscillator();
    this.osc.type = 'square';
    this.osc.frequency.value = 880;
    this.osc.connect(this.gain);
    this.gain.connect(this.ctx.destination);
    this.osc.start();
  }

  silence() {
    if (this.osc) {
      try {
        this.osc.stop();
      } catch {
        /* already stopped */
      }
      this.osc.disconnect();
      this.osc = null;
    }
    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
    }
  }

  dispose() {
    this.stop();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.unlocked = false;
  }
}
