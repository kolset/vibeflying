export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.speedEl = document.getElementById('stat-speed');
    this.altEl = document.getElementById('stat-alt');
    this.barSpeed = document.getElementById('bar-speed');
    this.barAlt = document.getElementById('bar-alt');
    this.compassArrow = document.getElementById('compass-arrow');
    this.controlsPanel = document.getElementById('controls-panel');
    this.visible = false;
    this._controlsTimer = null;
    this._controlsPinned = false;

    // H key toggles the controls panel
    document.addEventListener('keydown', e => {
      if (e.code === 'KeyH') this.toggleControls();
    });
  }

  show() {
    if (this.el) {
      this.el.classList.add('visible');
      this.visible = true;
    }
  }

  hide() {
    if (this.el) {
      this.el.classList.remove('visible');
      this.visible = false;
    }
  }

  /** Show the controls panel for `duration` ms, then auto-hide. */
  showControls(duration = 8000) {
    if (!this.controlsPanel) return;
    this._controlsPinned = false;
    this.controlsPanel.style.opacity = '1';
    if (this._controlsTimer) clearTimeout(this._controlsTimer);
    this._controlsTimer = setTimeout(() => {
      if (!this._controlsPinned) {
        this.controlsPanel.style.opacity = '0';
      }
    }, duration);
  }

  /** H key: toggle controls panel on/off. */
  toggleControls() {
    if (!this.controlsPanel) return;
    this._controlsPinned = !this._controlsPinned;
    this.controlsPanel.style.opacity = this._controlsPinned ? '1' : '0';
    if (this._controlsTimer) {
      clearTimeout(this._controlsTimer);
      this._controlsTimer = null;
    }
  }

  update(speed, altitude, windAngle, mode) {
    if (!this.visible) return;

    // Speed display
    const speedVal = Math.round(speed * 3.6); // m/s → km/h-ish
    if (this.speedEl) this.speedEl.textContent = speedVal;
    if (this.barSpeed) this.barSpeed.style.width = Math.min(100, (speed / 400) * 100) + '%';

    // Speed-reactive HUD border glow
    const sf = Math.min(1, speed / 400);
    if (sf > 0.6 && this.el) {
      const g = Math.round(255 * (sf - 0.6) / 0.4);
      this.el.style.setProperty('--hud-glow', `rgba(255,${175-g},55,${0.3+sf*0.5})`);
    } else if (this.el) {
      this.el.style.setProperty('--hud-glow', 'rgba(212,175,55,0.2)');
    }

    // Altitude
    const altVal = Math.round(altitude);
    if (this.altEl) this.altEl.textContent = altVal + 'm';
    if (this.barAlt) this.barAlt.style.width = Math.min(100, altVal / 3) + '%';

    // Wind compass arrow — points toward nearest wind zone
    if (this.compassArrow) {
      const deg = (windAngle * 180 / Math.PI);
      this.compassArrow.style.transform = `rotate(${deg}deg)`;
    }
  }
}
