import * as THREE from 'three';

const ZOOM = 13;
const GRID = 5;        // 5×5 tile grid
const SEGS = 64;       // geometry segments per tile (65×65 vertices)
const ELEVATION_SCALE = 2.0;
const MAX_CONCURRENT = 6;

// Dubai, UAE — perfect Arabian Nights start location
const CENTER_LAT = 25.1972;
const CENTER_LNG = 55.2796;

function latLngToTile(lat, lng, z) {
  const x = Math.floor((lng + 180) / 360 * Math.pow(2, z));
  const sinLat = Math.sin(lat * Math.PI / 180);
  const y = Math.floor(
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, z)
  );
  return { x, y };
}

function tileMeters(z) {
  return 40075016.686 / Math.pow(2, z);
}

export class MapTerrain {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.tileSizeM = tileMeters(ZOOM); // ~4891m per tile
    this.centerTile = latLngToTile(CENTER_LAT, CENTER_LNG, ZOOM);
    this.tiles = new Map(); // key: "di,dj" → { mesh, loaded }
    this.loadQueue = [];
    this.activeLoads = 0;

    this._initGrid();
  }

  _tileKey(di, dj) {
    return `${di},${dj}`;
  }

  _initGrid() {
    const half = Math.floor(GRID / 2); // 2
    // Load center-outward for better perceived performance
    const order = [];
    for (let dj = -half; dj <= half; dj++) {
      for (let di = -half; di <= half; di++) {
        order.push({ di, dj, dist: Math.abs(di) + Math.abs(dj) });
      }
    }
    order.sort((a, b) => a.dist - b.dist);

    for (const { di, dj } of order) {
      this._createPlaceholder(di, dj);
      this.loadQueue.push({ di, dj });
    }
    this._drainQueue();
  }

  _createPlaceholder(di, dj) {
    const geo = new THREE.PlaneGeometry(
      this.tileSizeM, this.tileSizeM, SEGS, SEGS
    );
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: 0xC2A67A, // warm Dubai sand placeholder
      roughness: 0.9,
      metalness: 0.0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(di * this.tileSizeM, 0, dj * this.tileSizeM);
    this.group.add(mesh);
    this.tiles.set(this._tileKey(di, dj), { mesh, loaded: false });
  }

  _drainQueue() {
    while (this.activeLoads < MAX_CONCURRENT && this.loadQueue.length > 0) {
      const tile = this.loadQueue.shift();
      this._loadTile(tile);
    }
  }

  async _loadTile({ di, dj }) {
    this.activeLoads++;
    const tx = this.centerTile.x + di;
    const ty = this.centerTile.y + dj;

    try {
      const [elevData, satTexture] = await Promise.all([
        this._fetchElevation(tx, ty),
        this._fetchSatellite(tx, ty),
      ]);

      const key = this._tileKey(di, dj);
      const entry = this.tiles.get(key);
      if (!entry) return;

      if (elevData) {
        this._applyElevation(entry.mesh.geometry, elevData);
      }

      if (satTexture) {
        entry.mesh.material.map = satTexture;
        entry.mesh.material.color.set(0xffffff);
        entry.mesh.material.needsUpdate = true;
      }

      entry.loaded = true;
    } catch (e) {
      // Graceful degradation — tile stays as sandy placeholder
      console.warn(`MapTerrain tile [${di},${dj}] failed:`, e.message);
    }

    this.activeLoads--;
    this._drainQueue();
  }

  async _fetchElevation(tx, ty) {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const img = await this._loadImage(blobUrl);
      URL.revokeObjectURL(blobUrl);

      // Decode elevation via canvas (avoids CORS canvas taint)
      const size = SEGS + 1; // 65×65
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);

      // Terrarium decode: elevation = R * 256 + G + B / 256 - 32768 (meters)
      const elevs = new Float32Array(size * size);
      for (let i = 0; i < size * size; i++) {
        const R = data[i * 4];
        const G = data[i * 4 + 1];
        const B = data[i * 4 + 2];
        elevs[i] = (R * 256 + G + B / 256 - 32768) * ELEVATION_SCALE;
      }
      return elevs;
    } catch {
      return null;
    }
  }

  async _fetchSatellite(tx, ty) {
    // Esri World Imagery URL: z / y / x (y and x are swapped vs. standard)
    const url = `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM}/${ty}/${tx}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      return await new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(
          blobUrl,
          (tex) => {
            URL.revokeObjectURL(blobUrl);
            tex.colorSpace = THREE.SRGBColorSpace;
            resolve(tex);
          },
          undefined,
          (err) => {
            URL.revokeObjectURL(blobUrl);
            reject(err);
          }
        );
      });
    } catch {
      return null;
    }
  }

  _loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  _applyElevation(geo, elevs) {
    const size = SEGS + 1; // 65
    const pos = geo.attributes.position;

    // After rotateX(-PI/2), the geometry's Y axis points up.
    // Vertices are row-major; we flip the row so north (+Z) aligns with tile north.
    for (let i = 0; i < pos.count; i++) {
      const row = Math.floor(i / size);
      const col = i % size;
      const elevIdx = (size - 1 - row) * size + col;
      const elev = elevs[Math.min(elevIdx, elevs.length - 1)];
      pos.setY(i, elev);
    }

    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  follow(playerPos) {
    // The 5×5 grid (~24km²) is large enough for normal gameplay.
    // Snap the group in large chunks so the terrain group tracks the player
    // without moving so fast it looks wrong.
    const snap = this.tileSizeM * GRID;
    this.group.position.x = Math.round(playerPos.x / snap) * snap;
    this.group.position.z = Math.round(playerPos.z / snap) * snap;
  }

  heightAt(x, z) {
    return 0; // simplified — terrain is mostly flat (Dubai)
  }

  dispose() {
    for (const { mesh } of this.tiles.values()) {
      mesh.geometry.dispose();
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
    }
    this.tiles.clear();
  }
}
