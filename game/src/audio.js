// NEON HARBOR — all sound is synthesized live with WebAudio: engine hum,
// sirens, gunshots, jingles and a small synthwave loop. No audio files.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicOn = false;
  }

  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch { return false; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch { /* audio never breaks the game */ }
  }

  noise(dur, vol = 0.3, filterFreq = 1200, when = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime + when;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = filterFreq;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
    } catch { /* ignore */ }
  }

  click() { this.blip(660, 0.06, 'square', 0.08); }
  pickup() { this.blip(880, 0.1, 'sine', 0.18); this.blip(1318, 0.14, 'sine', 0.18, 0.08); }
  punch() { this.noise(0.12, 0.4, 500); this.blip(120, 0.1, 'sine', 0.3); }
  shot() { this.noise(0.14, 0.5, 2600); this.blip(180, 0.1, 'square', 0.25); }
  crash() { this.noise(0.3, 0.5, 700); this.blip(70, 0.25, 'sine', 0.4); }
  horn() { this.blip(370, 0.25, 'square', 0.12); this.blip(466, 0.25, 'square', 0.1); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.16, 'triangle', 0.2, i * 0.09)); }
  missionFail() { [392, 330, 262].forEach((f, i) => this.blip(f, 0.2, 'triangle', 0.18, i * 0.12)); }
  busted() { [330, 262, 196, 131].forEach((f, i) => this.blip(f, 0.3, 'sawtooth', 0.14, i * 0.16)); }

  engineStart() {
    if (!this.ctx || this.engineOsc) return;
    try {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    } catch { /* ignore */ }
  }

  engineUpdate(speedNorm, on) {
    if (!this.engineOsc) return;
    try {
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 130, t, 0.08);
      this.engineGain.gain.setTargetAtTime(on ? 0.05 + speedNorm * 0.06 : 0, t, 0.1);
    } catch { /* ignore */ }
  }

  sirenStart() {
    if (!this.ctx || this.sirenOsc) return;
    try {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start(); lfo.start();
      this.sirenOsc._lfo = lfo;
    } catch { /* ignore */ }
  }

  sirenStop() {
    if (!this.sirenOsc) return;
    try { this.sirenOsc.stop(); this.sirenOsc._lfo && this.sirenOsc._lfo.stop(); } catch { /* ignore */ }
    this.sirenOsc = null;
  }

  // A small synthwave loop: Am – F – C – G pads with a bass pulse.
  musicStart() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const chords = [
      [220, 261.6, 329.6], [174.6, 220, 261.6],
      [196, 246.9, 293.7], [196, 246.9, 293.7],
    ];
    const bass = [110, 87.3, 130.8, 98];
    this.musicStep = 0;
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const bar = Math.floor(this.musicStep / 4) % 4;
      const step = this.musicStep % 4;
      if (step === 0) {
        for (const f of chords[bar]) this.blip(f, 1.8, 'triangle', 0.045);
        this.blip(bass[bar] / 2, 0.5, 'sine', 0.12);
      }
      if (step === 2) this.blip(bass[bar], 0.4, 'sine', 0.1);
      this.musicStep += 1;
    }, 300);
  }

  musicStop() {
    this.musicOn = false;
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
