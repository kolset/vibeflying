import * as THREE from 'three';

const ZONE_COUNT = 8;

export class Wind {
  constructor(scene) {
    this.scene = scene;
    this.zones = [];
    this.streams = [];
    this.time = 0;

    this._createZones();
    this._createStreams();
  }

  _createZones() {
    const positions = [
      [0, 100, 200], [-300, 80, 100], [200, 120, -300],
      [-150, 90, -200], [400, 110, 50], [-250, 130, 350],
      [100, 70, 450], [-400, 100, -100],
    ];
    const directions = [
      [1, 0.1, 0], [-0.7, 0.2, 0.7], [0.5, -0.1, 0.8],
      [-0.8, 0.1, -0.5], [0.3, 0.2, -0.9], [-0.6, 0.0, 0.7],
      [0.9, 0.15, 0.2], [-0.4, 0.1, -0.8],
    ];

    for (let i = 0; i < ZONE_COUNT; i++) {
      this.zones.push({
        center: new THREE.Vector3(...positions[i]),
        direction: new THREE.Vector3(...directions[i]).normalize(),
        radius: 40 + Math.random() * 30,
        strength: 1.0,
      });
    }
  }

  _createStreams() {
    for (const zone of this.zones) {
      const stream = this._makeStream(zone);
      this.streams.push(stream);
      this.scene.add(stream);
    }
  }

  _makeStream(zone) {
    const count = 200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const spread = 8;
      // Tube of particles along wind direction
      const along = (Math.random() - 0.5) * 80;
      const perp1 = (Math.random() - 0.5) * spread;
      const perp2 = (Math.random() - 0.5) * spread;

      const perp = new THREE.Vector3(1, 0, 0);
      if (Math.abs(zone.direction.x) > 0.9) perp.set(0, 1, 0);
      const perp2v = zone.direction.clone().cross(perp).normalize();
      perp.copy(zone.direction).cross(perp2v).normalize();

      const p = zone.center.clone()
        .addScaledVector(zone.direction, along)
        .addScaledVector(perp, perp1)
        .addScaledVector(perp2v, perp2);

      positions[i * 3]     = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;

      // Gold shimmer color
      const bright = 0.7 + Math.random() * 0.3;
      colors[i * 3]     = bright;
      colors[i * 3 + 1] = bright * 0.8;
      colors[i * 3 + 2] = bright * 0.2;

      sizes[i] = 1.5 + Math.random() * 2.5;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      sizeAttenuation: true,
      size: 2,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    points.userData.zone = zone;
    points.userData.offsets = new Float32Array(count).map(() => Math.random());
    return points;
  }

  update(dt) {
    this.time += dt;

    for (const stream of this.streams) {
      const zone = stream.userData.zone;
      const pos = stream.geometry.attributes.position;
      const offsets = stream.userData.offsets;
      const count = pos.count;

      for (let i = 0; i < count; i++) {
        // Animate particles flowing along wind direction
        const flow = ((this.time * 8 + offsets[i] * 80) % 80) - 40;
        const spread = 8;
        const perp1 = (offsets[i] - 0.5) * spread * 2;
        const perp2 = ((offsets[i] * 7.3) % 1 - 0.5) * spread * 2;

        const perpA = new THREE.Vector3(1, 0, 0);
        if (Math.abs(zone.direction.x) > 0.9) perpA.set(0, 1, 0);
        const perpB = zone.direction.clone().cross(perpA).normalize();
        perpA.copy(zone.direction).cross(perpB).normalize();

        const p = zone.center.clone()
          .addScaledVector(zone.direction, flow)
          .addScaledVector(perpA, perp1 * 0.5)
          .addScaledVector(perpB, perp2 * 0.5);

        pos.setXYZ(i, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;

      // Pulse opacity
      stream.material.opacity = 0.4 + Math.sin(this.time * 2 + zone.center.x) * 0.15;
    }
  }

  getForceAt(position) {
    const force = new THREE.Vector3();
    for (const zone of this.zones) {
      const dist = position.distanceTo(zone.center);
      if (dist < zone.radius) {
        const t = 1 - dist / zone.radius;
        force.addScaledVector(zone.direction, t * zone.strength);
      }
    }
    return force;
  }

  nearestAngle(position) {
    let nearest = null;
    let minDist = Infinity;
    for (const zone of this.zones) {
      const dist = position.distanceTo(zone.center);
      if (dist < minDist) {
        minDist = dist;
        nearest = zone;
      }
    }
    if (!nearest) return 0;
    const toZone = nearest.center.clone().sub(position);
    return Math.atan2(toZone.x, toZone.z);
  }
}
