import * as THREE from 'three';

const TRAIL_COUNT = 800;

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.positions = new Float32Array(TRAIL_COUNT * 3);
    this.alphas = new Float32Array(TRAIL_COUNT);
    this.velocities = [];
    this.head = 0;
    this.emitTimer = 0;
    this.time = 0;
    this.EMIT_RATE = 0.010; // denser trail

    // Init velocities
    for (let i = 0; i < TRAIL_COUNT; i++) {
      this.velocities.push(new THREE.Vector3());
      this.alphas[i] = 0;
    }

    this._build();
  }

  _build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    // Per-particle color (gold shimmer)
    const colors = new Float32Array(TRAIL_COUNT * 3);
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const t = Math.random();
      colors[i * 3]     = 0.9 + t * 0.1;
      colors[i * 3 + 1] = 0.7 + t * 0.2;
      colors[i * 3 + 2] = 0.1 + t * 0.15;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.attributes.color.usage = THREE.DynamicDrawUsage; // allow per-frame updates
    this.colorBuffer = colors; // store reference for speed-reactive updates

    this.geometry = geo;

    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 1.4,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);
  }

  update(dt, carpetPos, carpetVel, speed = 0, maxSpeed = 150) {
    this.time += dt;
    this.emitTimer += dt;

    const sf = Math.min(1, speed / maxSpeed);
    const dynamicRate = this.EMIT_RATE / (1 + sf * 4); // 5x faster at max speed

    // Emit new particles from carpet position
    if (this.emitTimer >= dynamicRate) {
      this.emitTimer = 0;

      // Spawn 2–7 particles per frame depending on speed
      const count = 2 + Math.floor(sf * 5);
      for (let j = 0; j < count; j++) {
        const i = this.head % TRAIL_COUNT;
        this.head++;

        this.positions[i * 3]     = carpetPos.x + (Math.random() - 0.5) * 3;
        this.positions[i * 3 + 1] = carpetPos.y + (Math.random() - 0.5) * 0.5;
        this.positions[i * 3 + 2] = carpetPos.z + (Math.random() - 0.5) * 3;

        this.velocities[i].set(
          (Math.random() - 0.5) * 2 - carpetVel.x * 0.1,
          Math.random() * 1.5,
          (Math.random() - 0.5) * 2 - carpetVel.z * 0.1,
        );
        this.alphas[i] = 1.0;

        // Speed-reactive color: gold (0.95,0.80,0.15) → orange (1.0,0.45,0.05)
        this.colorBuffer[i * 3]     = 0.95 + sf * 0.05;
        this.colorBuffer[i * 3 + 1] = 0.80 - sf * 0.35;
        this.colorBuffer[i * 3 + 2] = 0.15 - sf * 0.10;
      }
    }

    // Update existing particles
    for (let i = 0; i < TRAIL_COUNT; i++) {
      if (this.alphas[i] <= 0) continue;

      this.positions[i * 3]     += this.velocities[i].x * dt;
      this.positions[i * 3 + 1] += this.velocities[i].y * dt;
      this.positions[i * 3 + 2] += this.velocities[i].z * dt;

      // Drift up slightly
      this.velocities[i].y += 0.5 * dt;
      this.velocities[i].multiplyScalar(1 - 1.5 * dt);

      // Fade over 2 seconds
      this.alphas[i] -= dt / 2.0;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;

    // Pulse shared opacity for trail shimmer effect
    this.points.material.opacity = 0.65 + Math.sin(this.time * 4) * 0.25;
  }
}
