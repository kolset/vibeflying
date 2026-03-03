import * as THREE from 'three';
import { Carpet } from './carpet.js';
import { Wind } from './world/wind.js';
import { Particles } from './world/particles.js';
import { GoogleTiles3D } from './world/google-tiles.js';
import { HUD } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { ExploreMode } from './modes/explore.js';
import { RaceMode } from './modes/race.js';
import { TutorialMode } from './modes/tutorial.js';

// ── World locations ───────────────────────────────────────
const LOCATIONS = {
  oslo:    { lat: 59.9139, lng: 10.7522, color: 0x5C7A5C },
  dubai:   { lat: 25.1972, lng: 55.2796, color: 0xC8A97A },
  tokyo:   { lat: 35.6762, lng: 139.6503, color: 0x7A8C7A },
  newyork: { lat: 40.7580, lng: -73.9855, color: 0x707880 },
  london:  { lat: 51.5074, lng: -0.1278, color: 0x6B7B5A },
  sydney:  { lat: -33.8688, lng: 151.2093, color: 0x7A9A7A },
  paris:   { lat: 48.8566, lng: 2.3522, color: 0x8A8A70 },
  rio:     { lat: -22.9068, lng: -43.1729, color: 0x5A8A5A },
};
let selectedLocKey = 'oslo';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// ── Renderer ──────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// ── Scene ─────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // clear sky blue

// ── Camera ────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 1, 100000);
camera.position.set(0, 80, -20);

// ── Lighting (minimal — tiles have baked lighting) ────────
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

// ── World modules (google tiles deferred to startMode) ──
const wind = new Wind(scene);
const particles = new Particles(scene);
let googleTiles = null;

// ── Carpet (player) ───────────────────────────────────────
const carpet = new Carpet(scene, camera, wind);

// ── UI ────────────────────────────────────────────────────
const hud = new HUD();
const menu = new Menu();

// ── Game modes ────────────────────────────────────────────
const modes = {
  explore: new ExploreMode(scene, carpet, hud, wind),
  race: new RaceMode(scene, carpet, hud, wind),
  tutorial: new TutorialMode(scene, carpet, hud, wind),
};
let currentMode = null;

// ── Location picker ───────────────────────────────────────
window.setLocation = (key) => {
  selectedLocKey = key;
  document.querySelectorAll('.loc-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-loc="${key}"]`)?.classList.add('active');
};

// ── Start mode ────────────────────────────────────────────
window.startMode = (modeName) => {
  if (currentMode) currentMode.stop();
  menu.hide();
  hud.show();
  hud.showControls();

  // Recreate Google 3D Tiles for selected location
  if (googleTiles) googleTiles.dispose();
  const loc = LOCATIONS[selectedLocKey];
  googleTiles = new GoogleTiles3D(scene, camera, renderer, loc.lat, loc.lng, GOOGLE_MAPS_API_KEY);

  currentMode = modes[modeName];
  carpet.reset();
  currentMode.start();

  if (!animating) {
    animating = true;
    animate();
  }
};

// ── Clock & loop vars ─────────────────────────────────────
let animating = false;
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  wind.update(dt);
  particles.update(dt, carpet.position, carpet.velocity, carpet.speed, carpet.MAX_SPEED);
  carpet.update(dt);

  if (currentMode) currentMode.update(dt);

  if (currentMode) {
    hud.update(carpet.speed, carpet.position.y, wind.nearestAngle(carpet.position), currentMode);
  }

  if (googleTiles) {
    camera.updateMatrixWorld();
    googleTiles.update();
  }

  renderer.render(scene, camera);
}

// ── Resize ────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (googleTiles) googleTiles.onResize();
});

// ── Boot ──────────────────────────────────────────────────
async function boot() {
  const progress = document.getElementById('loading-progress');
  const loading = document.getElementById('loading');

  for (let i = 0; i <= 100; i += 10) {
    progress.style.width = i + '%';
    await new Promise(r => setTimeout(r, 50));
  }

  loading.classList.add('hidden');
  // Menu is visible by default — user picks location + mode
}

boot();
