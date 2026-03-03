import * as THREE from 'three';

const ZOOM = 13;
const GRID = 5;
const SEGS = 32;           // 33×33 vertices — fast to compute
const ELEVATION_SCALE = 2.0;
const MAX_CONCURRENT = 6;

function latLngToTile(lat, lng, z) {
  const n = Math.pow(2, z);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor(
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
  );
  return { x, y };
}

function tileMeters(z) {
  return 40075016.686 / Math.pow(2, z);
}

export class MapTerrain {
  constructor(scene, lat = 59.9139, lng = 10.7522, placeholderColor = 0x5C7A5C) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.tileSizeM = tileMeters(ZOOM); // ~4891m per tile
    this.centerTile = latLngToTile(lat, lng, ZOOM);
    this.tiles = new Map();
    this.loadQueue = [];
    this.activeLoads = 0;
    this.placeholderColor = placeholderColor;

    this._initGrid();
  }

  _initGrid() {
    const half = Math.floor(GRID / 2);
    // Sort center-outward so center loads first
    const order = [];
    for (let dj = -half; dj <= half; dj++) {
      for (let di = -half; di <= half; di++) {
        order.push({ di, dj, dist: Math.abs(di) + Math.abs(dj) });
      }
    }
    order.sort((a, b) => a.dist - b.dist);

    for (const { di, dj } of order) {
      this._createTile(di, dj);
      this.loadQueue.push({ di, dj });
    }
    this._drainQueue();
  }

  _createTile(di, dj) {
    const geo = new THREE.PlaneGeometry(this.tileSizeM, this.tileSizeM, SEGS, SEGS);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: this.placeholderColor,
      roughness: 0.85,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(di * this.tileSizeM, 0, dj * this.tileSizeM);
    this.group.add(mesh);
    this.tiles.set(`${di},${dj}`, { mesh });
  }

  _drainQueue() {
    while (this.activeLoads < MAX_CONCURRENT && this.loadQueue.length > 0) {
      const tile = this.loadQueue.shift();
      this._loadTile(tile).catch(() => {});
    }
  }

  async _loadTile({ di, dj }) {
    this.activeLoads++;
    const tx = this.centerTile.x + di;
    const ty = this.centerTile.y + dj;
    const entry = this.tiles.get(`${di},${dj}`);
    if (!entry) { this.activeLoads--; return; }

    // Load satellite and elevation in parallel — both fail gracefully
    const [texture, elevs] = await Promise.all([
      this._loadTexture(tx, ty),
      this._loadElevation(tx, ty),
    ]);

    if (texture) {
      entry.mesh.material.map = texture;
      entry.mesh.material.color.set(0xffffff);
      entry.mesh.material.needsUpdate = true;
    }
    if (elevs) {
      this._applyElevation(entry.mesh.geometry, elevs);
    }

    this.activeLoads--;
    this._drainQueue();
  }

  // THREE.TextureLoader handles CORS correctly — no fetch/blob needed
  _loadTexture(tx, ty) {
    const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM}/${ty}/${tx}`;
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          resolve(tex);
        },
        undefined,
        () => resolve(null)  // fail → keep placeholder
      );
    });
  }

  // Load elevation PNG with crossOrigin, decode RGB → meters via canvas
  _loadElevation(tx, ty) {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const size = SEGS + 1; // 33
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        try {
          const { data } = ctx.getImageData(0, 0, size, size);
          const elevs = new Float32Array(size * size);
          for (let i = 0; i < size * size; i++) {
            // Terrarium: elevation = R*256 + G + B/256 - 32768  (meters)
            elevs[i] = (data[i*4]*256 + data[i*4+1] + data[i*4+2]/256 - 32768) * ELEVATION_SCALE;
          }
          resolve(elevs);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  _applyElevation(geo, elevs) {
    const size = SEGS + 1;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const row = Math.floor(i / size);
      const col = i % size;
      const elevIdx = (size - 1 - row) * size + col;
      pos.setY(i, elevs[Math.min(elevIdx, elevs.length - 1)]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  follow(playerPos) {
    // Snap terrain group so tiles stay centered under the player
    const snap = this.tileSizeM * GRID;
    this.group.position.x = Math.round(playerPos.x / snap) * snap;
    this.group.position.z = Math.round(playerPos.z / snap) * snap;
  }

  dispose() {
    for (const [, entry] of this.tiles) {
      if (entry.mesh.material.map) entry.mesh.material.map.dispose();
      entry.mesh.material.dispose();
      entry.mesh.geometry.dispose();
    }
    this.scene.remove(this.group);
    this.tiles.clear();
    this.loadQueue = [];
  }

  heightAt() { return 0; }
}
