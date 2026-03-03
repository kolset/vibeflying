import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.noise2D = createNoise2D();
    this._build();
  }

  _build() {
    const size = 2000;
    const segs = 80;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this._height(x, z);
      pos.setY(i, h);
    }
    geo.computeVertexNormals();

    // Warm sand gradient using vertex colors
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i);
      const t = Math.max(0, Math.min(1, (h + 5) / 30));
      // Deep sand to bright crest
      colors[i * 3]     = 0.6 + t * 0.25;
      colors[i * 3 + 1] = 0.4 + t * 0.2;
      colors[i * 3 + 2] = 0.2 + t * 0.05;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.0,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = false;
    this.scene.add(this.mesh);
  }

  _height(x, z) {
    const n = this.noise2D;
    let h = 0;
    h += n(x * 0.002, z * 0.002) * 20;   // large dunes
    h += n(x * 0.008, z * 0.008) * 8;    // medium dunes
    h += n(x * 0.025, z * 0.025) * 2.5;  // ripples
    return h;
  }

  follow(playerPos) {
    // Terrain chunk follows player for infinite feel
    const chunk = 200;
    this.mesh.position.x = Math.round(playerPos.x / chunk) * chunk;
    this.mesh.position.z = Math.round(playerPos.z / chunk) * chunk;
  }

  heightAt(x, z) {
    return this._height(x - this.mesh.position.x, z - this.mesh.position.z);
  }
}
