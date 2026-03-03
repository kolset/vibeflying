import * as THREE from 'three';

export class ExploreMode {
  constructor(scene, carpet, hud, wind) {
    this.scene = scene;
    this.carpet = carpet;
    this.hud = hud;
    this.wind = wind;
    this.active = false;
  }

  start() {
    this.active = true;
    this._showNotification('✦ Explore — Ride the wind currents, discover floating islands');

    // Position carpet nicely for explore
    this.carpet.position.set(0, 80, 0);
    this.carpet.velocity.set(0, 0, 10);
  }

  stop() {
    this.active = false;
  }

  update(dt) {
    if (!this.active) return;
    // Nothing extra needed — pure free flight
  }

  _showNotification(msg) {
    const el = document.getElementById('notification');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4000);
  }
}
