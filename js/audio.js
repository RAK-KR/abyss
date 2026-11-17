// 절차적 사운드 (WebAudio) — 외부 음원 없이 생성
// 버스 구성: 효과음(sfx) / 환경음(amb) → 공통 버스(리버브 포함) → 마스터
export class AudioSys {
  constructor() {
    this.ctx = null; this.ok = false;
    this.vol = { master: 0.8, sfx: 0.9, amb: 0.8 };
    try {
      const v = JSON.parse(localStorage.getItem('abyss_vol') || 'null');
      if (v && typeof v.master === 'number') this.vol = { ...this.vol, ...v };
    } catch (e) { /* 저장값 없음 */ }
    this.nextBeat = 0; this.nextCreak = 12; this.nextCall = 35;
  }

  setVolume(kind, v) {
    this.vol[kind] = v;
    try { localStorage.setItem('abyss_vol', JSON.stringify(this.vol)); } catch (e) { /* 무시 */ }
    this.applyVolume();
  }
  applyVolume() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.vol.amb, t, 0.05);
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.bus = ctx.createGain();       // 공통(리버브 송신)
    // 수중 리버브
    const len = ctx.sampleRate * 2.8;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.5;
    this.dry = ctx.createGain(); this.dry.gain.value = 0.9;
    this.sfxBus.connect(this.bus); this.ambBus.connect(this.bus);
    this.bus.connect(this.dry).connect(this.master);
    this.bus.connect(this.verb).connect(this.verbGain).connect(this.master);
    this.master.connect(ctx.destination);

    // 드론(저음) — 깊이에 따라 두꺼워진다
    this.droneG = ctx.createGain(); this.droneG.gain.value = 0.0;
    this.droneF = ctx.createBiquadFilter(); this.droneF.type = 'lowpass'; this.droneF.frequency.value = 180;
    for (const [f, dt] of [[38, 0], [38.6, 0], [57, 3], [76.2, -2], [28, 0]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt * 10;
      o.connect(this.droneF); o.start();
    }
    this.droneF.connect(this.droneG).connect(this.ambBus);

    // 물소리(브라운 노이즈)
    const nb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const nd = nb.getChannelData(0); let last = 0;
    for (let i = 0; i < nd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; nd[i] = last * 3.2; }
    const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
    this.waterF = ctx.createBiquadFilter(); this.waterF.type = 'lowpass'; this.waterF.frequency.value = 400;
    this.waterG = ctx.createGain(); this.waterG.gain.value = 0.0;
    ns.connect(this.waterF).connect(this.waterG).connect(this.ambBus); ns.start();

    // 엔진
    this.engO = ctx.createOscillator(); this.engO.type = 'triangle'; this.engO.frequency.value = 52;
    this.engO2 = ctx.createOscillator(); this.engO2.type = 'sine'; this.engO2.frequency.value = 104;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 260;
    this.engO.connect(this.engF); this.engO2.connect(this.engF);
    this.engF.connect(this.engG).connect(this.sfxBus);
    this.engO.start(); this.engO2.start();

    // 위협 접근음
    this.thrO = ctx.createOscillator(); this.thrO.type = 'sawtooth'; this.thrO.frequency.value = 46;
    this.thrLfo = ctx.createOscillator(); this.thrLfo.frequency.value = 5.5;
    const lg = ctx.createGain(); lg.gain.value = 8;
    this.thrLfo.connect(lg).connect(this.thrO.frequency);
    this.thrF = ctx.createBiquadFilter(); this.thrF.type = 'lowpass'; this.thrF.frequency.value = 220; this.thrF.Q.value = 5;
    this.thrG = ctx.createGain(); this.thrG.gain.value = 0;
    this.thrO.connect(this.thrF).connect(this.thrG).connect(this.sfxBus);
    this.thrO.start(); this.thrLfo.start();
    this.ok = true;
    this.applyVolume();
  }

  // 매 프레임 상태 반영
  update(dt, st) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.droneG.gain.setTargetAtTime(0.05 + 0.08 * st.depth01, t, 1.0);
    this.droneF.frequency.setTargetAtTime(140 + 170 * st.depth01, t, 1.0);
    this.waterG.gain.setTargetAtTime(0.02 + st.speed01 * 0.16, t, 0.3);
    this.waterF.frequency.setTargetAtTime(280 + st.speed01 * 800, t, 0.3);
    this.engG.gain.setTargetAtTime(0.018 + st.thrust * 0.05 + (st.boost ? 0.04 : 0), t, 0.2);
    this.engO.frequency.setTargetAtTime(48 + st.speed01 * 40 + st.thrust * 14 + (st.boost ? 22 : 0), t, 0.2);
    this.engO2.frequency.setTargetAtTime(96 + st.speed01 * 80, t, 0.2);
    this.engF.frequency.setTargetAtTime(200 + st.speed01 * 260 + (st.boost ? 300 : 0), t, 0.2);
    this.thrG.gain.setTargetAtTime(st.danger * 0.16 + st.chase * 0.2, t, 0.3);
    this.thrO.frequency.setTargetAtTime(44 - st.chase * 12, t, 0.3);
    this.thrLfo.frequency.setTargetAtTime(4 + st.danger * 6 + st.chase * 5, t, 0.3);
    this.thrF.frequency.setTargetAtTime(160 + st.danger * 260 + st.chase * 300, t, 0.3);

    // 심박: 추격/위협이 가까울수록 빨라진다
    const stress = Math.max(st.chase, st.danger * 0.8);
    if (stress > 0.12 && t > this.nextBeat) {
      this.heartbeat(0.5 + stress * 0.5);
      this.nextBeat = t + (1.05 - stress * 0.6);
    }
    // 선체 삐걱임(깊을수록)
    if (st.depth01 > 0.3 && t > this.nextCreak) {
      this.creak(st.depth01);
      this.nextCreak = t + 14 + Math.random() * 18;
    }
    // 멀리서 들리는 긴 울음
    if (st.depth01 > 0.25 && t > this.nextCall) {
      this.distantCall();
      this.nextCall = t + 40 + Math.random() * 40;
    }
  }

  // ---- 기본 합성 도구 ----
  tone(freq, dur, type = 'sine', vol = 0.12, glide = 0, delay = 0, bus = null) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + glide), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  noiseBurst(dur, freq, vol, type = 'lowpass', q = 0.7, bus = null) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(bus || this.sfxBus); s.start(t);
  }

  // ---- 효과음 ----
  ping() { this.tone(1180, 2.4, 'sine', 0.05, -200, 0, this.ambBus); this.tone(1770, 1.6, 'sine', 0.018, -150, 0.04, this.ambBus); }
  pickup() { this.tone(520, 0.35, 'sine', 0.08); this.tone(780, 0.5, 'sine', 0.07, 0, 0.1); this.tone(1040, 0.7, 'sine', 0.05, 0, 0.2); }
  hit() { this.noiseBurst(0.7, 500, 0.7); this.tone(70, 0.9, 'sawtooth', 0.22, -35); this.tone(310, 0.5, 'square', 0.04, -200); this.creak(1, 0.14); }
  scrape() { this.noiseBurst(0.35, 1400, 0.22, 'bandpass', 1.4); }
  lurkerNotice() { this.tone(95, 1.4, 'sawtooth', 0.09, -40); }
  lurkerAttack() { this.tone(160, 0.9, 'sawtooth', 0.16, -110); this.noiseBurst(0.5, 700, 0.3); }
  flare() { this.noiseBurst(0.5, 2600, 0.25, 'highpass', 0.8); this.tone(320, 0.25, 'square', 0.04, 250); }
  lampClick() { this.tone(900, 0.05, 'square', 0.04); this.tone(600, 0.06, 'square', 0.03, 0, 0.05); }
  roar() {
    this.tone(48, 3.4, 'sawtooth', 0.34, -18);
    this.tone(72, 2.8, 'square', 0.12, -30, 0.1);
    this.tone(110, 2.2, 'sawtooth', 0.07, -50, 0.2);
    this.noiseBurst(2.4, 400, 0.6);
  }
  lungeWarn() { this.tone(180, 0.9, 'sawtooth', 0.1, 240); this.noiseBurst(0.9, 300, 0.4, 'bandpass', 2); }
  lunge() { this.tone(55, 1.5, 'sawtooth', 0.3, -25); this.noiseBurst(1.4, 600, 0.55); }
  rumble() { this.noiseBurst(4.5, 110, 1.1); this.tone(34, 4.5, 'sawtooth', 0.22, -6); this.tone(52, 3.8, 'square', 0.08, -14, 0.4); }
  whoosh() { this.noiseBurst(0.9, 900, 0.32, 'bandpass', 0.9); }
  alarm() { this.tone(660, 0.18, 'square', 0.05); this.tone(660, 0.18, 'square', 0.05, 0, 0.3); }
  win() { [392, 523, 659, 784].forEach((f, i) => this.tone(f, 2.2, 'sine', 0.07, 0, i * 0.22)); }
  lose() { this.tone(90, 2.5, 'sawtooth', 0.18, -50); }
  bump() { this.noiseBurst(0.18, 260, 0.5); this.tone(95, 0.25, 'sine', 0.2, -30); }

  // ---- 분위기 ----
  heartbeat(power = 0.7) {
    this.tone(58, 0.16, 'sine', 0.22 * power, -20);
    this.tone(52, 0.2, 'sine', 0.18 * power, -18, 0.17);
  }
  creak(depth01 = 0.5, vol = 0.07) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const f0 = 120 + Math.random() * 90;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (0.55 + Math.random() * 0.3), t + 1.4);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 9 + Math.random() * 8;
    const lg = ctx.createGain(); lg.gain.value = 160; lfo.connect(lg).connect(bp.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * (0.6 + depth01 * 0.6), t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(bp).connect(g).connect(this.sfxBus);
    o.start(t); lfo.start(t); o.stop(t + 1.6); lfo.stop(t + 1.6);
  }
  distantCall() {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    const f = 95 + Math.random() * 60;
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 1.6, t + 2.2);
    o.frequency.linearRampToValueAtTime(f * 0.8, t + 5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 1.6); g.gain.linearRampToValueAtTime(0.0001, t + 5.4);
    o.connect(g).connect(this.ambBus); o.start(t); o.stop(t + 5.6);
  }
}
