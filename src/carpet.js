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
    this.velocity = new THREE.Vector3(0, 0, 15); // start moving forward
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

    // Config — carpet glide feel (not rocket)
    this.DRAG        = 0.18;   // natural aero drag
    this.GRAVITY     = 3.0;   // floaty
    this.STEER_SPEED = 1.2;
    this.PITCH_SPEED = 0.8;
    this.MAX_SPEED   = 120;   // ~430 km/h at absolute max
    this.WIND_BOOST  = 32;    // wind gives nice surge, not instant max
    this.CAM_DIST    = 22;
    this.BASE_FOV    = 65;

    this._buildMesh();
    this._buildCarpetGlow();
    this._initJoystick();
    this._loadCountryFlag();
  }

  _buildCarpetTexture() {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#8B1A1A'; ctx.fillRect(0, 0, S, S);

    // Gold diamond lattice
    ctx.strokeStyle = '#D4AF37'; ctx.lineWidth = 2;
    const H = 32;
    for (let row = -1; row < S/H+2; row++) {
      for (let col = -1; col < S/H+2; col++) {
        const cx = col*H, cy = row*H;
        ctx.beginPath();
        ctx.moveTo(cx, cy-H/2); ctx.lineTo(cx+H/2, cy);
        ctx.lineTo(cx, cy+H/2); ctx.lineTo(cx-H/2, cy);
        ctx.closePath(); ctx.stroke();
      }
    }

    // Center medallion
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i/8)*Math.PI*2 - Math.PI/8;
      const p = [S/2 + Math.cos(a)*80, S/2 + Math.sin(a)*80];
      i===0 ? ctx.moveTo(...p) : ctx.lineTo(...p);
    }
    ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = '#C8960C'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(S/2, S/2, 40, 0, Math.PI*2); ctx.stroke();

    // Border
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 8; ctx.strokeRect(10, 10, S-20, S-20);
    ctx.lineWidth = 3; ctx.strokeRect(20, 20, S-40, S-40);

    return new THREE.CanvasTexture(cv);
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

    // Persian carpet texture with emissive gold bloom
    const carpetTex = this._buildCarpetTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: carpetTex,
      color: 0xffffff,       // white so texture isn't tinted
      roughness: 0.6,
      metalness: 0.05,
      emissive: 0x8B4A00,    // gold emissive for bloom
      emissiveIntensity: 0.5,
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

    this._buildFlag();
  }

  _buildFlag() {
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xD4AF37, metalness: 0.8, roughness: 0.2 });

    // Pole — slender gold cylinder at the nose of the carpet
    // Carpet nose is at group z=+3; pole sits just inside at z=+2.8
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.04, 1.6, 8);
    this.flagPole = new THREE.Mesh(poleGeo, goldMat);
    this.flagPole.position.set(0, 1.0, 2.8); // pole center; extends from y=0.2 to y=1.8
    this.group.add(this.flagPole);

    // Decorative finial on top
    const finialGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const finial = new THREE.Mesh(finialGeo, goldMat);
    finial.position.set(0, 1.87, 2.8);
    this.group.add(finial);

    // Flag fabric — red, extends from pole (+X direction), sits at top of pole
    const flagGeo = new THREE.PlaneGeometry(0.85, 0.5, 8, 4);
    // Shift vertices so left edge (x = -0.425) is at the pole rather than center
    const flagPos = flagGeo.attributes.position;
    for (let i = 0; i < flagPos.count; i++) {
      flagPos.setX(i, flagPos.getX(i) + 0.425);
    }
    flagPos.needsUpdate = true;
    flagGeo.computeVertexNormals();

    // Store original X for waving math
    this._flagOrigX = new Float32Array(flagPos.count);
    for (let i = 0; i < flagPos.count; i++) {
      this._flagOrigX[i] = flagPos.getX(i);
    }

    const flagMat = new THREE.MeshStandardMaterial({
      color: 0xCC1A00,
      side: THREE.DoubleSide,
      roughness: 0.75,
      emissive: 0x440000,
      emissiveIntensity: 0.25,
    });

    this.flagMesh = new THREE.Mesh(flagGeo, flagMat);
    this.flagMesh.position.set(0, 1.75, 2.8); // base of flag at top of pole
    this.group.add(this.flagMesh);
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

  async _loadCountryFlag() {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      const cc = (data.country_code || '').toLowerCase();
      if (!cc) return;

      const loader = new THREE.TextureLoader();
      loader.load(
        `https://flagcdn.com/w320/${cc}.png`,
        (texture) => {
          if (!this.flagMesh) return;
          texture.colorSpace = THREE.SRGBColorSpace;
          this.flagMesh.material.map = texture;
          this.flagMesh.material.color.set(0xffffff); // no tint
          this.flagMesh.material.emissive.set(0x111111);
          this.flagMesh.material.emissiveIntensity = 0.15;
          this.flagMesh.material.needsUpdate = true;
        }
      );
    } catch {
      // Keep default red flag on any error
    }
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
    this.velocity.set(0, 0, 15);
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

    // Propulsion: always gliding forward, nose down = faster
    const pitchFactor = -this.pitch; // nose down = speed
    this.velocity.addScaledVector(fwd, (7.0 + pitchFactor * 10) * dt);

    // Gravity on vertical component
    this.velocity.y -= this.GRAVITY * dt;

    // Altitude maintenance: speed gives lift — carpet needs momentum to stay up
    const speed = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).length();
    const lift  = Math.max(0, speed - 6) * 0.38;
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

    // Speed-reactive carpet flutter
    const t = performance.now() * 0.001;
    const fi = 0.04 + (this.speed / this.MAX_SPEED) * 0.12; // amplitude
    const ff = 2 + (this.speed / this.MAX_SPEED) * 4;       // frequency
    const carpetPos = this.mesh.geometry.attributes.position;
    for (let i = 0; i < carpetPos.count; i++) {
      const x = carpetPos.getX(i), y = carpetPos.getY(i);
      carpetPos.setZ(i, Math.sin(x*1.5 + t*ff)*fi + Math.cos(y*1.0 + t*ff*0.75)*fi*0.67);
    }
    carpetPos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();

    // Speed-reactive flag wave
    if (this.flagMesh) {
      const waveAmp  = 0.18 + (this.speed / this.MAX_SPEED) * 0.35;
      const waveFreq = 9    + (this.speed / this.MAX_SPEED) * 15;
      const flagPos = this.flagMesh.geometry.attributes.position;
      for (let i = 0; i < flagPos.count; i++) {
        const u = this._flagOrigX[i] / 0.85; // 0 at pole, 1 at tip
        const wave = u * u * Math.sin(u * Math.PI * 2.5 + t * waveFreq) * waveAmp;
        flagPos.setZ(i, wave);
      }
      flagPos.needsUpdate = true;
      this.flagMesh.geometry.computeVertexNormals();
    }

    // ── Camera follow ─────────────────────────────────────
    this._updateCamera(dt);
  }

  _updateCamera(dt) {
    const sf = this.speed / this.MAX_SPEED; // speed fraction 0..1

    // Pull camera back at speed
    const dist = this.CAM_DIST + this.speed * 0.15;

    // Widen FOV at speed (65° → 90°)
    const targetFOV = this.BASE_FOV + sf * 25;
    this.camera.fov += (targetFOV - this.camera.fov) * 4 * dt;
    this.camera.updateProjectionMatrix();

    const yaw = this.yaw + cameraYaw;
    const pitch = cameraPitch;
    const camOffset = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist + 3,
      -Math.cos(yaw) * Math.cos(pitch) * dist
    );
    const targetCamPos = this.position.clone().add(camOffset);
    this.camera.position.lerp(targetCamPos, (5 + sf * 8) * dt);
    this.camera.lookAt(this.position.clone().add(new THREE.Vector3(0, 2, 0)));
  }
}
