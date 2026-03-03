import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const RADIUS_M = 2000;
const MAX_ELEMENTS = 3000;
const RELOAD_DIST = 1500;

export class Buildings {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.originLat = 0;
    this.originLng = 0;
    this.lastLoadX = 0;
    this.lastLoadZ = 0;
    this._loading = false;
  }

  async load(centerLat, centerLng) {
    this.originLat = centerLat;
    this.originLng = centerLng;
    this.lastLoadX = 0;
    this.lastLoadZ = 0;
    await this._fetch(centerLat, centerLng);
  }

  async _fetch(queryLat, queryLng) {
    if (this._loading) return;
    this._loading = true;

    const dLat = RADIUS_M / 111320;
    const dLng = RADIUS_M / (111320 * Math.cos(queryLat * Math.PI / 180));

    const s = queryLat - dLat;
    const n = queryLat + dLat;
    const w = queryLng - dLng;
    const e = queryLng + dLng;

    const query =
      `[out:json][timeout:25];way["building"](${s},${w},${n},${e});out geom ${MAX_ELEMENTS};`;

    try {
      const res = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
      );
      const { elements = [] } = await res.json();

      // Dispose old mesh
      if (this.mesh) {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.scene.remove(this.mesh);
        this.mesh = null;
      }

      this._build(elements, this.originLat, this.originLng);
    } catch (err) {
      console.warn('Buildings load failed:', err.message);
    }
    this._loading = false;
  }

  /** Call every frame — reloads buildings when player moves far enough */
  follow(playerPos) {
    if (this._loading) return;

    const dx = playerPos.x - this.lastLoadX;
    const dz = playerPos.z - this.lastLoadZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > RELOAD_DIST) {
      this.lastLoadX = playerPos.x;
      this.lastLoadZ = playerPos.z;

      // Convert game position to lat/lng
      const R = 6371000;
      const lat = this.originLat - (playerPos.z / (R * Math.PI / 180));
      const lng = this.originLng + (playerPos.x / (R * Math.PI / 180 * Math.cos(this.originLat * Math.PI / 180)));

      this._fetch(lat, lng);
    }
  }

  _build(elements, cLat, cLng) {
    const geos = [];

    for (const el of elements) {
      if (el.type !== 'way' || !el.geometry || el.geometry.length < 3) continue;

      // Remove closing duplicate node (OSM ways are closed polygons)
      let nodes = el.geometry;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (first.lat === last.lat && first.lon === last.lon) {
        nodes = nodes.slice(0, -1);
      }
      if (nodes.length < 3) continue;

      const height = this._height(el.tags);

      // Map to shape space: x = east offset, y = -south offset
      // This gives correct orientation after geo.rotateX(-PI/2)
      const pts = nodes.map(({ lat, lon }) => {
        const { x, z } = this._toGame(lat, lon, cLat, cLng);
        return new THREE.Vector2(x, -z);
      });

      // Ensure CCW winding (positive signed area) for correct outward normals
      if (this._signedArea(pts) < 0) pts.reverse();

      try {
        const shape = new THREE.Shape(pts);
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: height,
          bevelEnabled: false,
        });
        geo.rotateX(-Math.PI / 2);
        geos.push(geo);
      } catch {
        // Skip degenerate or self-intersecting footprints
      }
    }

    if (!geos.length) return;

    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) return;

    this.mesh = new THREE.Mesh(
      merged,
      new THREE.MeshStandardMaterial({
        color: 0x7A8FA8,       // cool blue-grey concrete
        roughness: 0.88,
        metalness: 0.0,
        emissive: 0x1A2A44,    // subtle window-glow blue for bloom
        emissiveIntensity: 0.22,
        side: THREE.DoubleSide,
      })
    );
    this.scene.add(this.mesh);
  }

  /** Extract building height from OSM tags, in metres */
  _height(tags = {}) {
    const h = parseFloat(tags?.height);
    if (h > 0) return h;
    const lvl = parseInt(tags?.['building:levels']);
    if (lvl > 0) return lvl * 3.5;
    return 10; // default ~2-3 storey
  }

  /** Lat/lng → game-world metres relative to map centre (x=east, z=south) */
  _toGame(lat, lon, cLat, cLng) {
    const R = 6371000;
    return {
      x:  (lon - cLng) * (Math.PI / 180) * R * Math.cos(cLat * Math.PI / 180),
      z: -(lat - cLat) * (Math.PI / 180) * R,
    };
  }

  /** 2D signed area via shoelace — positive = CCW */
  _signedArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const j = (i + 1) % n;
      a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return a * 0.5;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.scene.remove(this.mesh);
      this.mesh = null;
    }
  }
}
