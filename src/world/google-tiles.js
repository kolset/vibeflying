import { TilesRenderer } from '3d-tiles-renderer';
import {
  GoogleCloudAuthPlugin,
  ReorientationPlugin,
  GLTFExtensionsPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
} from '3d-tiles-renderer/plugins';

/**
 * Google Photorealistic 3D Tiles — replaces MapTerrain + Buildings
 * with Google Earth-quality photogrammetry streamed into Three.js.
 */
export class GoogleTiles3D {
  constructor(scene, camera, renderer, lat, lng, apiKey) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    // Create tiles renderer
    this.tiles = new TilesRenderer();

    // Register plugins — order matters
    this.tiles.registerPlugin(new GLTFExtensionsPlugin());
    this.tiles.registerPlugin(new TileCompressionPlugin());
    this.tiles.registerPlugin(new TilesFadePlugin());
    this.tiles.registerPlugin(new ReorientationPlugin({
      lat: lat * Math.PI / 180,   // convert degrees to radians
      lon: lng * Math.PI / 180,
      height: 0,
      up: '+y',
      recenter: true,
    }));
    this.tiles.registerPlugin(new GoogleCloudAuthPlugin({
      apiToken: apiKey,
      useRecommendedSettings: true,
    }));

    // Performance tuning for fast flight
    this.tiles.errorTarget = 12;
    this.tiles.lruCache.maxSize = 1200;

    // Register camera so tiles stream based on viewpoint
    this.tiles.setCamera(camera);
    this.tiles.setResolutionFromRenderer(camera, renderer);

    // Add to scene
    scene.add(this.tiles.group);

    // Google attribution overlay (required by ToS)
    this._createAttribution();
  }

  update() {
    // Update camera matrices before tile selection
    this.camera.updateMatrixWorld();
    this.tiles.setResolutionFromRenderer(this.camera, this.renderer);
    this.tiles.update();
  }

  onResize() {
    this.tiles.setResolutionFromRenderer(this.camera, this.renderer);
  }

  dispose() {
    this.scene.remove(this.tiles.group);
    this.tiles.dispose();
    if (this._attrEl) {
      this._attrEl.remove();
      this._attrEl = null;
    }
  }

  _createAttribution() {
    // Google Maps Platform ToS requires visible attribution
    const el = document.createElement('div');
    el.id = 'google-attribution';
    el.style.cssText = `
      position: fixed;
      bottom: 4px;
      right: 4px;
      background: rgba(0,0,0,0.6);
      color: #ccc;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      pointer-events: none;
      z-index: 1000;
      font-family: sans-serif;
    `;
    el.textContent = 'Google';
    document.body.appendChild(el);
    this._attrEl = el;
  }
}
