// 절차적 사운드 (WebAudio) — 외부 음원 없이 생성
export class AudioSys {
  constructor() { this.ctx = null; this.ok = false; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    // 간단한 수중 리버브
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.55;
    this.dry = ctx.createGain(); this.dry.gain.value = 0.9;
    this.bus = ctx.createGain();
    this.bus.connect(this.dry).connect(this.master);
    this.bus.connect(this.verb).connect(this.verbGain).connect(this.master);
    this.master.connect(ctx.destination);

    // 드론(저음)
    this.droneG = ctx.createGain(); this.droneG.gain.value = 0.0;
    this.droneF = ctx.createBiquadFilter(); this.droneF.type = 'lowpass'; this.droneF.frequency.value = 180;
    for (const [f, dt] of [[38, 0], [38.6, 0], [57, 3], [76.2, -2]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt * 10;
      o.connect(this.droneF); o.start();
    }
    this.droneF.connect(this.droneG).connect(this.bus);

    // 물소리(브라운 노이즈)
    const nb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const nd = nb.getChannelData(0); let last = 0;
    for (let i = 0; i < nd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; nd[i] = last * 3.2; }
    const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
    this.waterF = ctx.createBiquadFilter(); this.waterF.type = 'lowpass'; this.waterF.frequency.value = 400;
    this.waterG = ctx.createGain(); this.waterG.gain.value = 0.0;
    ns.connect(this.waterF).connect(this.waterG).connect(this.bus); ns.start();

    // 엔진
    this.engO = ctx.createOscillator(); this.engO.type = 'triangle'; this.engO.frequency.value = 52;
    this.engO2 = ctx.createOscillator(); this.engO2.type = 'sine'; this.engO2.frequency.value = 104;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 260;
    this.engO.connect(this.engF); this.engO2.connect(this.engF);
    this.engF.connect(this.engG).connect(this.bus);
    this.engO.start(); this.engO2.start();

    // 위협 접근음
    this.thrO = ctx.createOscillator(); this.thrO.type = 'sawtooth'; this.thrO.frequency.value = 46;
    this.thrLfo = ctx.createOscillator(); this.thrLfo.frequency.value = 5.5;
    const lg = ctx.createGain(); lg.gain.value = 8;
    this.thrLfo.connect(lg).connect(this.thrO.frequency);
    this.thrF = ctx.createBiquadFilter(); this.thrF.type = 'lowpass'; this.thrF.frequency.value = 220; this.thrF.Q.value = 5;
    this.thrG = ctx.createGain(); this.thrG.gain.value = 0;
    this.thrO.connect(this.thrF).connect(this.thrG).connect(this.bus);
    this.thrO.start(); this.thrLfo.start();
    this.ok = true;
  }

  // 매 프레임 상태 반영
  update(dt, st) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const k = 0.15;
    this.droneG.gain.setTargetAtTime(0.055 + 0.07 * st.depth01, t, 1.0);
    this.droneF.frequency.setTargetAtTime(150 + 160 * st.depth01, t, 1.0);
    this.waterG.gain.setTargetAtTime(0.02 + st.speed01 * 0.16, t, 0.3);
    this.waterF.frequency.setTargetAtTime(280 + st.speed01 * 800, t, 0.3);
    this.engG.gain.setTargetAtTime(0.018 + st.thrust * 0.05, t, 0.2);
    this.engO.frequency.setTargetAtTime(48 + st.speed01 * 40 + st.thrust * 14, t, 0.2);
    this.engO2.frequency.setTargetAtTime(96 + st.speed01 * 80, t, 0.2);
    this.engF.frequency.setTargetAtTime(200 + st.speed01 * 260, t, 0.2);
    // 위협: 가까울수록 낮게 울리며 커짐
    this.thrG.gain.setTargetAtTime(st.danger * 0.16 + st.chase * 0.2, t, 0.3);
    this.thrO.frequency.setTargetAtTime(44 - st.chase * 12, t, 0.3);
    this.thrLfo.frequency.setTargetAtTime(4 + st.danger * 6 + st.chase * 5, t, 0.3);
    this.thrF.frequency.setTargetAtTime(160 + st.danger * 260 + st.chase * 300, t, 0.3);
  }

  tone(freq, dur, type = 'sine', vol = 0.12, glide = 0, delay = 0) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + glide), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + dur + 0.05);
  }
  noiseBurst(dur, freq, vol) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(this.bus); s.start(t);
  }

  ping() { this.tone(1180, 2.4, 'sine', 0.05, -200); this.tone(1770, 1.6, 'sine', 0.018, -150, 0.04); }
  pickup() { this.tone(520, 0.35, 'sine', 0.08); this.tone(780, 0.5, 'sine', 0.07, 0, 0.1); this.tone(1040, 0.7, 'sine', 0.05, 0, 0.2); }
  hit() { this.noiseBurst(0.7, 500, 0.7); this.tone(70, 0.9, 'sawtooth', 0.22, -35); this.tone(310, 0.5, 'square', 0.04, -200); }
  scrape() { this.noiseBurst(0.3, 900, 0.25); }
  lurkerNotice() { this.tone(95, 1.4, 'sawtooth', 0.09, -40); }
  lurkerAttack() { this.tone(160, 0.9, 'sawtooth', 0.16, -110); this.noiseBurst(0.5, 700, 0.3); }
  flare() { this.noiseBurst(0.4, 2200, 0.25); this.tone(320, 0.25, 'square', 0.04, 250); }
  lampClick() { this.tone(900, 0.06, 'square', 0.04); }
  roar() {
    this.tone(48, 3.2, 'sawtooth', 0.34, -18);
    this.tone(72, 2.6, 'square', 0.12, -30, 0.1);
    this.noiseBurst(2.2, 400, 0.6);
  }
  alarm() { this.tone(660, 0.18, 'square', 0.05); this.tone(660, 0.18, 'square', 0.05, 0, 0.3); }
  win() { [392, 523, 659, 784].forEach((f, i) => this.tone(f, 2.2, 'sine', 0.07, 0, i * 0.22)); }
  lose() { this.tone(90, 2.5, 'sawtooth', 0.18, -50); }
}
