export class TutorialMode {
  constructor(scene, carpet, hud, wind) {
    this.scene = scene;
    this.carpet = carpet;
    this.hud = hud;
    this.wind = wind;

    this.step = 0;
    this.active = false;
    this.stepTimer = 0;

    this.steps = [
      {
        text: 'Use W/↑ and S/↓ to pitch up and down',
        stepLabel: 'STEP 1 / 5 — PITCH',
        condition: () => Math.abs(this.carpet.pitch) > 0.2,
        minTime: 2,
      },
      {
        text: 'Use A/← and D/→ to bank and steer',
        stepLabel: 'STEP 2 / 5 — STEER',
        condition: () => Math.abs(this.carpet.roll) > 0.25,
        minTime: 2,
      },
      {
        text: 'Fly toward the golden shimmer — that\'s a wind current!',
        stepLabel: 'STEP 3 / 5 — WIND',
        condition: () => this.carpet.inWindZone,
        minTime: 3,
      },
      {
        text: 'Hold SHIFT while in the wind to boost!',
        stepLabel: 'STEP 4 / 5 — BOOST',
        condition: () => {
          const shift = window._shiftHeld;
          return shift && this.carpet.inWindZone;
        },
        minTime: 2,
      },
      {
        text: 'Amazing! You\'re a natural. Explore freely now.',
        stepLabel: 'STEP 5 / 5 — COMPLETE',
        condition: () => this.stepTimer > 3,
        minTime: 3,
      },
    ];
  }

  start() {
    this.active = true;
    this.step = 0;
    this.stepTimer = 0;

    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) overlay.classList.add('visible');

    this.carpet.position.set(0, 80, 0);
    this.carpet.velocity.set(0, 0, 8);

    // Track shift key for step 4
    window._shiftHeld = false;
    document.addEventListener('keydown', this._onKey = e => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') window._shiftHeld = true;
    });
    document.addEventListener('keyup', this._offKey = e => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') window._shiftHeld = false;
    });

    this._showStep();
  }

  stop() {
    this.active = false;
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) overlay.classList.remove('visible');

    if (this._onKey) document.removeEventListener('keydown', this._onKey);
    if (this._offKey) document.removeEventListener('keyup', this._offKey);
  }

  _showStep() {
    const s = this.steps[this.step];
    if (!s) return;

    const textEl = document.getElementById('tutorial-text');
    const stepEl = document.getElementById('tutorial-step');
    if (textEl) textEl.textContent = s.text;
    if (stepEl) stepEl.textContent = s.stepLabel;
  }

  update(dt) {
    if (!this.active) return;

    const s = this.steps[this.step];
    if (!s) return;

    this.stepTimer += dt;

    const conditionMet = s.condition();
    const timeMet = this.stepTimer >= s.minTime;

    if (conditionMet && timeMet) {
      this.step++;
      this.stepTimer = 0;

      if (this.step >= this.steps.length) {
        // Tutorial complete — switch to explore
        setTimeout(() => {
          this.stop();
          window.startMode('explore');
        }, 2000);
      } else {
        this._showStep();
      }
    }
  }
}
