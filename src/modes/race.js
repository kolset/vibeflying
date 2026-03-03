import * as THREE from 'three';
import { SeededRNG } from '../utils/seeded-rng.js';

const GATE_COUNT = 10;

export class RaceMode {
  constructor(scene, carpet, hud, wind) {
    this.scene = scene;
    this.carpet = carpet;
    this.hud = hud;
    this.wind = wind;

    this.gates = [];
    this.gateObjects = [];
    this.currentGate = 0;
    this.timer = 0;
    this.running = false;
    this.finished = false;
    this.active = false;
  }

  get bestTime() {
    return parseFloat(localStorage.getItem('vibeflying_best') || 'Infinity');
  }

  set bestTime(v) {
    localStorage.setItem('vibeflying_best', v.toString());
  }

  start() {
    this.active = true;
    this.currentGate = 0;
    this.timer = 0;
    this.running = true;
    this.finished = false;

    this._clearGates();
    this._generateGates();

    // Show race HUD
    const raceHUD = document.getElementById('hud-race');
    if (raceHUD) raceHUD.classList.add('visible');

    this._updateRaceHUD();
    this._showNotification('⏱ Daily Race — Fly through 10 gates!');

    // Position at start
    this.carpet.position.set(0, 80, 0);
    this.carpet.velocity.set(0, 0, 12);
  }

  stop() {
    this.active = false;
    this.running = false;
    this._clearGates();

    const raceHUD = document.getElementById('hud-race');
    if (raceHUD) raceHUD.classList.remove('visible');
  }

  _generateGates() {
    // Date-seeded for daily course
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const rng = new SeededRNG(today);

    for (let i = 0; i < GATE_COUNT; i++) {
      const angle = rng.next() * Math.PI * 2;
      const dist  = 80 + rng.next() * 200 + i * 30;
      const alt   = 50 + rng.next() * 130;

      const pos = new THREE.Vector3(
        Math.cos(angle) * dist,
        alt,
        Math.sin(angle) * dist,
      );

      this.gates.push(pos);

      const gateObj = this._makeGate(pos, i);
      this.gateObjects.push(gateObj);
      this.scene.add(gateObj);
    }
  }

  _makeGate(pos, index) {
    const group = new THREE.Group();

    // Torus gate ring
    const torusGeo = new THREE.TorusGeometry(12, 0.6, 12, 48);
    const torusMat = new THREE.MeshStandardMaterial({
      color: index === 0 ? 0x00FF88 : 0xD4AF37,
      emissive: index === 0 ? 0x00CC66 : 0x8B6914,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2,
    });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    group.add(torus);

    // Gate number label (using glow sphere at center)
    const dotGeo = new THREE.SphereGeometry(1.5, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    group.add(dot);

    // Sparkle particles around gate
    const sparkCount = 30;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(sparkCount * 3);
    for (let i = 0; i < sparkCount; i++) {
      const a = (i / sparkCount) * Math.PI * 2;
      sparkPos[i * 3]     = Math.cos(a) * 13;
      sparkPos[i * 3 + 1] = Math.sin(a) * 13;
      sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xD4AF37, size: 0.5, sizeAttenuation: true,
      transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    group.add(new THREE.Points(sparkGeo, sparkMat));

    group.position.copy(pos);
    group.userData.radius = 12;
    return group;
  }

  _clearGates() {
    for (const obj of this.gateObjects) {
      this.scene.remove(obj);
    }
    this.gates = [];
    this.gateObjects = [];
  }

  _checkGateCollision() {
    if (this.currentGate >= GATE_COUNT) return;

    const gatePos = this.gates[this.currentGate];
    const dist = this.carpet.position.distanceTo(gatePos);

    if (dist < 13) {
      // Passed through gate!
      const obj = this.gateObjects[this.currentGate];

      // Flash gate green
      obj.children[0].material.color.setHex(0x00FF88);
      obj.children[0].material.emissive.setHex(0x00FF88);

      // Fade out gate after 1 second
      setTimeout(() => { this.scene.remove(obj); }, 1000);

      this.currentGate++;
      this._updateRaceHUD();

      this._showNotification(`Gate ${this.currentGate} / ${GATE_COUNT} ✓`);

      // Advance next gate marker
      if (this.currentGate < GATE_COUNT) {
        this.gateObjects[this.currentGate].children[0].material.color.setHex(0x00FF88);
        this.gateObjects[this.currentGate].children[0].material.emissive.setHex(0x00CC66);
      }

      if (this.currentGate >= GATE_COUNT) {
        this._finish();
      }
    }
  }

  _finish() {
    this.running = false;
    this.finished = true;

    const isNewBest = this.timer < this.bestTime;
    if (isNewBest) this.bestTime = this.timer;

    const m = Math.floor(this.timer / 60);
    const s = (this.timer % 60).toFixed(1);
    const timeStr = `${m}:${s.padStart(4, '0')}`;

    const msg = isNewBest
      ? `🏆 New best! ${timeStr}`
      : `Finished: ${timeStr} (best: ${this._formatTime(this.bestTime)})`;

    this._showNotification(msg);

    // Return to menu after 5 seconds
    setTimeout(() => {
      this.stop();
      document.getElementById('hud').classList.remove('visible');
      document.getElementById('menu').classList.remove('hidden');
    }, 5000);
  }

  _formatTime(t) {
    if (!isFinite(t)) return '--';
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1);
    return `${m}:${s.padStart(4, '0')}`;
  }

  _updateRaceHUD() {
    const timerEl = document.getElementById('race-timer');
    const gatesEl = document.getElementById('race-gates');
    const bestEl  = document.getElementById('race-best');

    if (timerEl) timerEl.textContent = this._formatTime(this.timer);
    if (gatesEl) gatesEl.textContent = `Gate ${this.currentGate} / ${GATE_COUNT}`;
    if (bestEl && isFinite(this.bestTime)) {
      bestEl.textContent = `Best: ${this._formatTime(this.bestTime)}`;
    }

    // Animate gate rings
    for (let i = 0; i < this.gateObjects.length; i++) {
      const obj = this.gateObjects[i];
      if (i < this.currentGate) continue;
      obj.rotation.y += 0.001;
      obj.rotation.z = Math.sin(Date.now() * 0.001 + i) * 0.05;
    }
  }

  update(dt) {
    if (!this.active) return;

    // Animate gates
    for (let i = this.currentGate; i < this.gateObjects.length; i++) {
      const obj = this.gateObjects[i];
      const t = Date.now() * 0.001;
      obj.rotation.y = t * 0.5;
      obj.rotation.x = Math.sin(t * 0.3 + i) * 0.1;
    }

    if (!this.running || this.finished) return;

    this.timer += dt;

    const timerEl = document.getElementById('race-timer');
    if (timerEl) timerEl.textContent = this._formatTime(this.timer);

    this._checkGateCollision();
  }

  _showNotification(msg) {
    const el = document.getElementById('notification');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3500);
  }
}
