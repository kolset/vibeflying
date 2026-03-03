import * as THREE from 'three';
import { Carpet } from './carpet.js';
import { MapTerrain } from './world/map-terrain.js';
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
scene.fog = new THREE.FogExp2(0x1a0a2e, 0.00015); // lighter fog so terrain visible at distance

// ── Camera ────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 15000);
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
const terrain = new MapTerrain(scene);
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
  hud.showControls(); // show controls for 8s when entering any mode
  currentMode = modes[modeName];
  carpet.reset();
  currentMode.start();
};

// ── Intro zoom state ──────────────────────────────────────
let introActive = true;
let introStartTime = 0;
const INTRO_DURATION = 5.0; // seconds
const INTRO_START_Y = 50000;
const INTRO_END_Y = 300;

// ── Clock & loop vars ─────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // cap at 50ms

  // Sky and wind always update
  sky.update(dt);
  wind.update(dt);

  if (introActive) {
    // Tiles load at world origin during intro zoom
    terrain.follow({ x: 0, y: 0, z: 0 });

    const elapsed = clock.elapsedTime - introStartTime;
    const t = Math.min(elapsed / INTRO_DURATION, 1.0);

    // Cubic ease-in-out
    const ease = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const currentY = INTRO_START_Y + (INTRO_END_Y - INTRO_START_Y) * ease;
    // Pull camera back slightly on Z as we zoom in for parallax feel
    const currentZ = -20 * ease;
    camera.position.set(0, currentY, currentZ);
    camera.lookAt(0, 0, 0);

    if (t >= 1.0) {
      // Intro complete — restore normal settings
      scene.fog.density = 0.00015;
      camera.far = 15000;
      camera.updateProjectionMatrix();
      carpet.group.visible = true;
      introActive = false;
      menu.show();
    }
  } else {
    // Normal gameplay
    particles.update(dt, carpet.position, carpet.velocity);
    carpet.update(dt);

    if (currentMode) currentMode.update(dt);

    if (currentMode) {
      hud.update(carpet.speed, carpet.position.y, wind.nearestAngle(carpet.position), currentMode);
    }

    terrain.follow(carpet.position);
  }

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

  // Animate loading bar while tiles begin loading in background
  for (let i = 0; i <= 100; i += 10) {
    progress.style.width = i + '%';
    await new Promise(r => setTimeout(r, 50));
  }

  loading.classList.add('hidden');

  // Setup intro: camera way up high, fog nearly off, carpet hidden
  carpet.group.visible = false;
  scene.fog.density = 0.000005;  // nearly invisible at 50km altitude
  camera.far = 100000;           // see terrain from 50km
  camera.updateProjectionMatrix();
  camera.position.set(0, INTRO_START_Y, 0);
  camera.lookAt(0, 0, 0);

  introStartTime = clock.elapsedTime;
  animate();
}

boot();
