import * as THREE from 'three';

const ZOOM = 13;
const GRID = 5;
const HALF = Math.floor(GRID / 2);
const SEGS = 32;
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
    this.originTile = latLngToTile(lat, lng, ZOOM);
    this.playerTile = { x: this.originTile.x, y: this.originTile.y };
    this.tiles = new Map(); // key: "tx,ty" → { mesh, tx, ty }
    this.loadQueue = [];
    this.activeLoads = 0;
    this.placeholderColor = placeholderColor;

    this._buildGrid();
  }

  _buildGrid() {
    const order = [];
    for (let dy = -HALF; dy <= HALF; dy++) {
      for (let dx = -HALF; dx <= HALF; dx++) {
        order.push({ dx, dy, dist: Math.abs(dx) + Math.abs(dy) });
      }
    }
    order.sort((a, b) => a.dist - b.dist);

    for (const { dx, dy } of order) {
      this._addTile(this.playerTile.x + dx, this.playerTile.y + dy);
    }
    this._drainQueue();
  }

  _tileKey(tx, ty) { return `${tx},${ty}`; }

  _tileWorldPos(tx, ty) {
    return {
      x: (tx - this.originTile.x) * this.tileSizeM,
      z: (ty - this.originTile.y) * this.tileSizeM,
    };
  }

  _addTile(tx, ty) {
    const key = this._tileKey(tx, ty);
    if (this.tiles.has(key)) return;

    const geo = new THREE.PlaneGeometry(this.tileSizeM, this.tileSizeM, SEGS, SEGS);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: this.placeholderColor,
      roughness: 0.85,
    });

    const mesh = new THREE.Mesh(geo, mat);
    const pos = this._tileWorldPos(tx, ty);
    mesh.position.set(pos.x, 0, pos.z);
    this.group.add(mesh);
    this.tiles.set(key, { mesh, tx, ty });
    this.loadQueue.push({ tx, ty, key });
  }

  _removeTile(key) {
    const entry = this.tiles.get(key);
    if (!entry) return;
    if (entry.mesh.material.map) entry.mesh.material.map.dispose();
    entry.mesh.material.dispose();
    entry.mesh.geometry.dispose();
    this.group.remove(entry.mesh);
    this.tiles.delete(key);
  }

  _drainQueue() {
    while (this.activeLoads < MAX_CONCURRENT && this.loadQueue.length > 0) {
      const tile = this.loadQueue.shift();
      this._loadTile(tile).catch(() => {});
    }
  }

  async _loadTile({ tx, ty, key }) {
    this.activeLoads++;
    if (!this.tiles.has(key)) { this.activeLoads--; this._drainQueue(); return; }

    const [texture, elevs] = await Promise.all([
      this._loadTexture(tx, ty),
      this._loadElevation(tx, ty),
    ]);

    // Tile may have been removed while loading
    const entry = this.tiles.get(key);
    if (!entry) { this.activeLoads--; this._drainQueue(); return; }

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

  _loadTexture(tx, ty) {
    const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM}/${ty}/${tx}`;
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (tex) => { tex.colorSpace = THREE.SRGBColorSpace; resolve(tex); },
        undefined,
        () => resolve(null)
      );
    });
  }

  _loadElevation(tx, ty) {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const size = SEGS + 1;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        try {
          const { data } = ctx.getImageData(0, 0, size, size);
          const elevs = new Float32Array(size * size);
          for (let i = 0; i < size * size; i++) {
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
    // Determine which tile the player is over
    const ptx = this.originTile.x + Math.round(playerPos.x / this.tileSizeM);
    const pty = this.originTile.y + Math.round(playerPos.z / this.tileSizeM);

    if (ptx === this.playerTile.x && pty === this.playerTile.y) return;

    this.playerTile.x = ptx;
    this.playerTile.y = pty;

    // Which tiles should exist
    const needed = new Set();
    for (let dy = -HALF; dy <= HALF; dy++) {
      for (let dx = -HALF; dx <= HALF; dx++) {
        needed.add(this._tileKey(ptx + dx, pty + dy));
      }
    }

    // Remove tiles no longer needed
    for (const key of [...this.tiles.keys()]) {
      if (!needed.has(key)) this._removeTile(key);
    }

    // Filter stale load queue entries
    this.loadQueue = this.loadQueue.filter(item => needed.has(item.key));

    // Add missing tiles (center-outward)
    const order = [];
    for (let dy = -HALF; dy <= HALF; dy++) {
      for (let dx = -HALF; dx <= HALF; dx++) {
        order.push({ dx, dy, dist: Math.abs(dx) + Math.abs(dy) });
      }
    }
    order.sort((a, b) => a.dist - b.dist);
    for (const { dx, dy } of order) {
      this._addTile(ptx + dx, pty + dy);
    }

    this._drainQueue();
  }

  dispose() {
    for (const key of [...this.tiles.keys()]) {
      this._removeTile(key);
    }
    this.scene.remove(this.group);
    this.loadQueue = [];
  }

  heightAt() { return 0; }
}
