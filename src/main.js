import * as THREE from 'three';
import { Carpet } from './carpet.js';
import { Terrain } from './world/terrain.js';
import { Sky } from './world/sky.js';
import { Wind } from './world/wind.js';
import { Particles } from './world/particles.js';
import { HUD } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { ExploreMode } from './modes/explore.js';
import { RaceMode } from './modes/race.js';
import { TutorialMode } from './modes/tutorial.js';

// ── Renderer ──────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// ── Scene ─────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a0a2e, 0.0008);

// ── Camera ────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(0, 80, -20);

// ── Lighting ─────────────────────────────────────────────
const sunLight = new THREE.DirectionalLight(0xffd280, 2.0);
sunLight.position.set(200, 300, 100);
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x301850, 0.8);
scene.add(ambientLight);

const fillLight = new THREE.HemisphereLight(0x8844aa, 0xc87020, 0.4);
scene.add(fillLight);

// ── World modules ─────────────────────────────────────────
const terrain = new Terrain(scene);
const sky = new Sky(scene);
const wind = new Wind(scene);
const particles = new Particles(scene);

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

// ── Start mode (called from menu buttons) ─────────────────
window.startMode = (modeName) => {
  if (currentMode) currentMode.stop();
  menu.hide();
  hud.show();
  currentMode = modes[modeName];
  carpet.reset();
  currentMode.start();
};

// ── Clock & loop vars ─────────────────────────────────────
const clock = new THREE.Clock();
let frameId;

function animate() {
  frameId = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // cap at 50ms

  // Update world
  sky.update(dt);
  wind.update(dt);
  particles.update(dt, carpet.position, carpet.velocity);

  // Update carpet
  carpet.update(dt);

  // Update current mode
  if (currentMode) currentMode.update(dt);

  // Update HUD
  if (currentMode) {
    hud.update(carpet.speed, carpet.position.y, wind.nearestAngle(carpet.position), currentMode);
  }

  // Terrain follows player
  terrain.follow(carpet.position);

  renderer.render(scene, camera);
}

// ── Resize ────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Boot ──────────────────────────────────────────────────
async function boot() {
  const progress = document.getElementById('loading-progress');
  const loading = document.getElementById('loading');

  // Simulate loading steps
  for (let i = 0; i <= 100; i += 10) {
    progress.style.width = i + '%';
    await new Promise(r => setTimeout(r, 50));
  }

  loading.classList.add('hidden');
  menu.show();
  animate();
}

boot();
