import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';
import { Carpet } from './carpet.js';
import { MapTerrain } from './world/map-terrain.js';
import { Sky } from './world/sky.js';
import { Wind } from './world/wind.js';
import { Particles } from './world/particles.js';
import { Buildings } from './world/buildings.js';
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

// ── Renderer ──────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// ── Scene ─────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a0a2e, 0.00015);

// ── Camera ────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 15000);
camera.position.set(0, 80, -20);

// ── Post-processing ───────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.9,   // strength
  0.5,   // radius
  0.15   // threshold
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ── Lighting ─────────────────────────────────────────────
const sunLight = new THREE.DirectionalLight(0xffd280, 2.0);
sunLight.position.set(200, 300, 100);
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x301850, 0.8);
scene.add(ambientLight);

const fillLight = new THREE.HemisphereLight(0x8844aa, 0xc87020, 0.4);
scene.add(fillLight);

// ── World modules (terrain + buildings deferred to startMode) ─
const sky = new Sky(scene);
const wind = new Wind(scene);
const particles = new Particles(scene);
let terrain = null;
let buildings = null;

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

  // Recreate terrain + buildings for selected location
  if (terrain) terrain.dispose();
  if (buildings) buildings.dispose();
  const loc = LOCATIONS[selectedLocKey];
  terrain = new MapTerrain(scene, loc.lat, loc.lng, loc.color);
  buildings = new Buildings(scene);
  buildings.load(loc.lat, loc.lng); // async — buildings appear after a few seconds

  currentMode = modes[modeName];
  carpet.reset();
  currentMode.start();
};

// ── Clock & loop vars ─────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  sky.update(dt);
  wind.update(dt);
  particles.update(dt, carpet.position, carpet.velocity, carpet.speed, carpet.MAX_SPEED);
  carpet.update(dt);

  if (currentMode) currentMode.update(dt);

  if (currentMode) {
    hud.update(carpet.speed, carpet.position.y, wind.nearestAngle(carpet.position), currentMode);
  }

  if (terrain) terrain.follow(carpet.position);

  composer.render();
}

// ── Resize ────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
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

  window.startMode('explore');
  animate();
}

boot();
