export class Audio {
  constructor() {
    this.ctx = null;
    this.nodes = {};
    this.started = false;
  }

  _init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  startAmbient() {
    this._init();
    if (this.started) return;
    this.started = true;

    // Desert wind drone — low filtered noise
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Low-pass filter for wind feel
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    filter.Q.value = 0.5;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.04;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();

    this.nodes.windSource = source;
    this.nodes.windGain = gain;

    // Soft harmonic drone (A2 + E3 + A3)
    const freqs = [110, 165, 220, 330];
    for (let i = 0; i < freqs.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freqs[i];

      const oscGain = this.ctx.createGain();
      oscGain.gain.value = 0.008 / (i + 1);

      // Slow tremolo
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.08 + i * 0.03;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.003;

      lfo.connect(lfoGain);
      lfoGain.connect(oscGain.gain);
      lfo.start();

      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start();
    }
  }

  playWhoosh(intensity = 1.0) {
    if (!this.ctx) return;

    const bufSize = this.ctx.sampleRate * 0.3;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800 + intensity * 600;
    bp.Q.value = 1.5;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(intensity * 0.15, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.ctx.destination);
    src.start();
  }

  setWindIntensity(v) {
    if (!this.nodes.windGain) return;
    this.nodes.windGain.gain.setTargetAtTime(
      0.04 + v * 0.06,
      this.ctx.currentTime,
      0.5
    );
  }
}
