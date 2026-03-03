import * as THREE from 'three';

const KEYS = {};
document.addEventListener('keydown', e => { KEYS[e.code] = true; });
document.addEventListener('keyup', e => { KEYS[e.code] = false; });

// Mouse drag for camera orbit
let mouseDown = false, lastMouse = { x: 0, y: 0 };
let cameraYaw = 0, cameraPitch = 0.3;

document.addEventListener('mousedown', e => { mouseDown = true; lastMouse = { x: e.clientX, y: e.clientY }; });
document.addEventListener('mouseup', () => { mouseDown = false; });
document.addEventListener('mousemove', e => {
  if (!mouseDown) return;
  const dx = e.clientX - lastMouse.x;
  const dy = e.clientY - lastMouse.y;
  cameraYaw -= dx * 0.004;
  cameraPitch = Math.max(0.05, Math.min(1.0, cameraPitch + dy * 0.003));
  lastMouse = { x: e.clientX, y: e.clientY };
});

// Touch for camera orbit (non-joystick touches)
document.addEventListener('touchstart', e => {
  if (e.touches.length === 1 && e.touches[0].clientX > 200) {
    mouseDown = true;
    lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
}, { passive: true });
document.addEventListener('touchend', () => { mouseDown = false; }, { passive: true });
document.addEventListener('touchmove', e => {
  if (!mouseDown || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - lastMouse.x;
  const dy = e.touches[0].clientY - lastMouse.y;
  cameraYaw -= dx * 0.004;
  cameraPitch = Math.max(0.05, Math.min(1.0, cameraPitch + dy * 0.003));
  lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });

// Joystick input from nipplejs (set externally)
export let joystickInput = { x: 0, y: 0 };

export class Carpet {
  constructor(scene, camera, wind) {
    this.scene = scene;
    this.camera = camera;
    this.wind = wind;

    // Physics state
    this.position = new THREE.Vector3(0, 80, 0);
    this.velocity = new THREE.Vector3(0, 0, 8); // start moving forward
    this.speed = 0;
    this.pitch = 0;   // nose up/down angle (radians)
    this.yaw = 0;     // heading angle
    this.roll = 0;    // bank angle

    // Carpet tilt (visual)
    this.targetPitch = 0;
    this.targetRoll = 0;

    // Wind boost state
    this.inWindZone = false;
    this.boostTimer = 0;

    // Config
    this.DRAG = 0.35;
    this.GRAVITY = 4.0;
    this.STEER_SPEED = 1.2;
    this.PITCH_SPEED = 0.8;
    this.MAX_SPEED = 60;
    this.WIND_BOOST = 18;
    this.CAM_DIST = 22;

    this._buildMesh();
    this._buildCarpetGlow();
    this._initJoystick();
  }

  _buildMesh() {
    // Carpet body — flat rectangular plane
    const geo = new THREE.PlaneGeometry(4, 6, 8, 12);

    // Displace vertices slightly for wavy look
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 1.5) * 0.08 + Math.cos(y * 1.0) * 0.05);
    }
    geo.computeVertexNormals();

    // Rich carpet material — bright crimson with subtle glow
    const mat = new THREE.MeshStandardMaterial({
      color: 0xC0392B,
      roughness: 0.5,
      metalness: 0.1,
      emissive: 0x4A1010,
      emissiveIntensity: 0.3,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2; // lay flat

    // Gold border fringe (thin lines around edge)
    const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(4.1, 6.1));
    const borderMat = new THREE.LineBasicMaterial({ color: 0xD4AF37, linewidth: 1 });
    this.border = new THREE.LineSegments(borderGeo, borderMat);
    this.border.rotation.x = -Math.PI / 2;

    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.add(this.border);
    this.scene.add(this.group);
  }

  _buildCarpetGlow() {
    // Soft glow underneath carpet
    const glowGeo = new THREE.PlaneGeometry(5, 7);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xD4AF37,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    this.glow = new THREE.Mesh(glowGeo, glowMat);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = -0.3;
    this.group.add(this.glow);
  }

  _initJoystick() {
    // nipplejs mobile joystick
    const zone = document.getElementById('joystick-zone');
    if (!zone) return;

    import('nipplejs').then(({ default: nipplejs }) => {
      const joystick = nipplejs.create({
        zone,
        mode: 'dynamic',
        color: 'rgba(212,175,55,0.5)',
      });
      joystick.on('move', (evt, data) => {
        if (data.vector) {
          joystickInput.x = data.vector.x;
          joystickInput.y = -data.vector.y;
        }
      });
      joystick.on('end', () => {
        joystickInput.x = 0;
        joystickInput.y = 0;
      });
    }).catch(() => {});
  }

  reset() {
    this.position.set(0, 80, 0);
    this.velocity.set(0, 0, 8);
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    cameraYaw = 0;
    cameraPitch = 0.3;
  }

  get forward() {
    return new THREE.Vector3(
      Math.sin(this.yaw),
      Math.sin(this.pitch),
      Math.cos(this.yaw)
    ).normalize();
  }

  update(dt) {
    const boost = KEYS['ShiftLeft'] || KEYS['ShiftRight'];

    // ── Input → target angles ─────────────────────────────
    const leftRight = (KEYS['KeyA'] || KEYS['ArrowLeft'] ? -1 : 0) +
                      (KEYS['KeyD'] || KEYS['ArrowRight'] ? 1 : 0) +
                      joystickInput.x;
    const upDown    = (KEYS['KeyW'] || KEYS['ArrowUp'] ? 1 : 0) +
                      (KEYS['KeyS'] || KEYS['ArrowDown'] ? -1 : 0) +
                      (-joystickInput.y); // up is positive

    this.yaw -= leftRight * this.STEER_SPEED * dt;
    this.targetPitch = upDown * 0.35;
    this.targetRoll  = -leftRight * 0.4;

    // Smooth pitch & roll (banking feel)
    this.pitch += (this.targetPitch - this.pitch) * 3.5 * dt;
    this.roll  += (this.targetRoll  - this.roll)  * 5.0 * dt;

    // ── Velocity ──────────────────────────────────────────
    const fwd = this.forward;
    const currentSpeed = this.velocity.length();

    // Drag
    this.velocity.multiplyScalar(1 - this.DRAG * dt);

    // Propulsion: pitch down = speed gain, pitch up = altitude gain
    const pitchFactor = -this.pitch; // nose down = speed
    this.velocity.addScaledVector(fwd, (3.0 + pitchFactor * 6) * dt);

    // Gravity on vertical component
    this.velocity.y -= this.GRAVITY * dt;

    // Altitude maintenance: speed gives lift
    const speed = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).length();
    const lift  = Math.max(0, speed - 4) * 0.25;
    this.velocity.y += lift * dt;

    // Wind boost
    const windBoost = this.wind.getForceAt(this.position);
    if (windBoost.length() > 0.1) {
      this.inWindZone = true;
      this.boostTimer = 0.5;
      const boostMult = boost ? 1.8 : 1.0;
      this.velocity.addScaledVector(windBoost.normalize(), this.WIND_BOOST * boostMult * dt);
      document.getElementById('wind-boost').classList.add('active');
    } else {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) {
        this.inWindZone = false;
        document.getElementById('wind-boost').classList.remove('active');
      }
    }

    // Speed cap
    if (this.velocity.length() > this.MAX_SPEED) {
      this.velocity.setLength(this.MAX_SPEED);
    }

    this.speed = this.velocity.length();

    // ── Position ──────────────────────────────────────────
    this.position.addScaledVector(this.velocity, dt);

    // Ground clamp (don't go below y=3)
    if (this.position.y < 3) {
      this.position.y = 3;
      this.velocity.y = Math.max(0, this.velocity.y);
    }

    // ── Mesh transform ────────────────────────────────────
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.group.rotation.z = this.roll;
    this.group.rotation.x = -this.pitch; // mesh already lays flat; group only needs dynamic pitch

    // Subtle carpet flutter
    const t = performance.now() * 0.001;
    const carpetPos = this.mesh.geometry.attributes.position;
    for (let i = 0; i < carpetPos.count; i++) {
      const x = carpetPos.getX(i), y = carpetPos.getY(i);
      carpetPos.setZ(i, Math.sin(x * 1.5 + t * 2) * 0.06 + Math.cos(y * 1.0 + t * 1.5) * 0.04);
    }
    carpetPos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();

    // ── Camera follow ─────────────────────────────────────
    this._updateCamera(dt);
  }

  _updateCamera(dt) {
    // Orbit camera around carpet
    const dist = this.CAM_DIST;
    const yaw = this.yaw + cameraYaw;
    const pitch = cameraPitch;

    const camOffset = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist + 3,
      -Math.cos(yaw) * Math.cos(pitch) * dist
    );

    const targetCamPos = this.position.clone().add(camOffset);
    this.camera.position.lerp(targetCamPos, 5 * dt);
    this.camera.lookAt(this.position.clone().add(new THREE.Vector3(0, 2, 0)));
  }
}
