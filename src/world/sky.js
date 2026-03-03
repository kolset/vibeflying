import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.noise2D = createNoise2D();
    this.time = 0;
    this.islands = [];
    this.clouds = [];

    this._buildSky();
    this._buildSun();
    this._buildClouds();
    this._buildFloatingIslands();
  }

  _buildSky() {
    // Large sphere with gradient shader
    const geo = new THREE.SphereGeometry(3000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor:    { value: new THREE.Color(0x0a0520) },
        midColor:    { value: new THREE.Color(0x1a0a2e) },
        horizColor:  { value: new THREE.Color(0x8B2500) },
        goldColor:   { value: new THREE.Color(0xC87020) },
        sunPos:      { value: new THREE.Vector3(0.5, 0.3, -1).normalize() },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor, midColor, horizColor, goldColor, sunPos;
        varying vec3 vWorldPos;
        void main() {
          vec3 dir = normalize(vWorldPos);
          float t = clamp(dir.y * 1.5 + 0.5, 0.0, 1.0);
          float h = clamp(dir.y + 0.2, 0.0, 1.0);

          // Multi-stop gradient
          vec3 col = mix(goldColor, horizColor, smoothstep(0.0, 0.2, h));
          col = mix(col, midColor, smoothstep(0.1, 0.5, h));
          col = mix(col, topColor, smoothstep(0.4, 1.0, h));

          // Sun halo
          float sunDot = dot(dir, sunPos);
          float sunGlow = pow(max(0.0, sunDot), 30.0) * 2.0;
          float sunHalo = pow(max(0.0, sunDot), 6.0) * 0.4;
          col += vec3(1.0, 0.7, 0.3) * (sunGlow + sunHalo);

          // Stars (top of sky)
          float starField = step(0.997, fract(sin(dot(dir * 300.0, vec3(12.9898, 78.233, 45.0))) * 43758.5453));
          col += vec3(0.8, 0.7, 1.0) * starField * max(0.0, dir.y - 0.3) * 2.0;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.skyMesh = new THREE.Mesh(geo, mat);
    this.skyMat = mat;
    this.scene.add(this.skyMesh);
  }

  _buildSun() {
    // Visible sun disc
    const geo = new THREE.CircleGeometry(30, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xFFD080,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.sunDisc = new THREE.Mesh(geo, mat);
    this.sunDisc.position.set(800, 200, -2500);
    this.scene.add(this.sunDisc);

    // Sun glow sprite
    const glowGeo = new THREE.CircleGeometry(80, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xFF8030,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(this.sunDisc.position);
    this.scene.add(glow);
  }

  _buildClouds() {
    for (let i = 0; i < 20; i++) {
      const cloud = this._makeCloud();
      const angle = Math.random() * Math.PI * 2;
      const r = 300 + Math.random() * 1200;
      cloud.position.set(
        Math.cos(angle) * r,
        60 + Math.random() * 120,
        Math.sin(angle) * r
      );
      cloud.userData.speed = (Math.random() - 0.5) * 0.5;
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }

  _makeCloud() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9080a0,
      transparent: true,
      opacity: 0.35,
      roughness: 1,
    });

    const puffs = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < puffs; i++) {
      const r = 6 + Math.random() * 12;
      const geo = new THREE.SphereGeometry(r, 8, 6);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(
        (i - puffs / 2) * 8 + Math.random() * 4,
        Math.random() * 4,
        Math.random() * 5
      );
      group.add(m);
    }
    return group;
  }

  _buildFloatingIslands() {
    const positions = [
      [200, 120, -400], [-350, 150, 300], [500, 100, 200],
      [-200, 180, -600], [400, 130, 500], [-500, 160, -200],
      [100, 200, 700],
    ];

    for (const [x, y, z] of positions) {
      const island = this._makeIsland();
      island.position.set(x, y, z);
      island.userData.floatOffset = Math.random() * Math.PI * 2;
      island.userData.floatSpeed = 0.3 + Math.random() * 0.2;
      island.userData.baseY = y;
      this.islands.push(island);
      this.scene.add(island);
    }
  }

  _makeIsland() {
    const group = new THREE.Group();

    // Rock base — flattened sphere
    const rockGeo = new THREE.SphereGeometry(15, 12, 8);
    const rockPos = rockGeo.attributes.position;
    for (let i = 0; i < rockPos.count; i++) {
      if (rockPos.getY(i) < 0) {
        rockPos.setY(i, rockPos.getY(i) * 0.3); // flatten bottom
      }
    }
    rockGeo.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.95 });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    group.add(rock);

    // Green top (grass/palm area)
    const topGeo = new THREE.SphereGeometry(14, 10, 6);
    const topMat = new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.85 });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 6;
    top.scale.y = 0.3;
    group.add(top);

    // Palm trees
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      const palm = this._makePalm();
      palm.position.set(
        (Math.random() - 0.5) * 12,
        8,
        (Math.random() - 0.5) * 12
      );
      group.add(palm);
    }

    // Ruin columns
    if (Math.random() > 0.4) {
      for (let i = 0; i < 3; i++) {
        const colGeo = new THREE.CylinderGeometry(0.4, 0.5, 4 + Math.random() * 4, 8);
        const colMat = new THREE.MeshStandardMaterial({ color: 0xD4C4A0, roughness: 0.9 });
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(
          (Math.random() - 0.5) * 10,
          10 + col.geometry.parameters.height / 2,
          (Math.random() - 0.5) * 10
        );
        group.add(col);
      }
    }

    return group;
  }

  _makePalm() {
    const group = new THREE.Group();
    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 5, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6D4C41 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.rotation.z = (Math.random() - 0.5) * 0.3;
    group.add(trunk);

    // Fronds
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x33691E, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const frondGeo = new THREE.PlaneGeometry(0.4, 3);
      const frond = new THREE.Mesh(frondGeo, frondMat);
      frond.position.y = 2.8;
      frond.rotation.y = (i / 6) * Math.PI * 2;
      frond.rotation.x = -Math.PI / 4;
      group.add(frond);
    }
    return group;
  }

  update(dt) {
    this.time += dt;

    // Slowly rotate sky (sun cycles)
    this.skyMesh.rotation.y = this.time * 0.005;

    // Float islands gently
    for (const island of this.islands) {
      island.position.y = island.userData.baseY +
        Math.sin(this.time * island.userData.floatSpeed + island.userData.floatOffset) * 3;
      island.rotation.y = this.time * 0.05;
    }

    // Drift clouds
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.speed * dt * 10;
    }
  }
}
