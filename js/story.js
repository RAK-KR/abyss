// 자막/대사 — 수심, 사건에 따라 한 번씩 출력
export class Story {
  constructor(el) {
    this.el = el;
    this.queue = [];
    this.cur = null;
    this.t = 0;
    this.fired = new Set();
  }
  say(text, dur = 5.5) { this.queue.push({ text, dur }); }
  once(key, text, dur) { if (this.fired.has(key)) return; this.fired.add(key); this.say(text, dur); }
  reset() { this.queue.length = 0; this.cur = null; this.fired.clear(); this.el.classList.remove('show'); }

  update(dt) {
    if (!this.cur && this.queue.length) {
      this.cur = this.queue.shift(); this.t = 0;
      this.el.textContent = this.cur.text;
      this.el.classList.add('show');
    }
    if (this.cur) {
      this.t += dt;
      if (this.t > this.cur.dur) { this.el.classList.remove('show'); this.cur = null; this.gap = 1.0; }
    }
  }

  // 수심 기반 트리거
  depthTriggers(depth, ctx) {
    if (depth > 6) this.once('start', '신호 수신. 해저 460미터 지점. 발신원 불명.', 6);
    if (depth > 9) this.once('hint', '빛줄기가 보이는 방향이 신호가 오는 쪽이다.', 5);
    if (depth > 70) this.once('sun', '햇빛이 더는 닿지 않는다.', 4.5);
    if (depth > 150) this.once('light', '조명에 반응하는 생물이 있다. 필요할 때만 켜는 편이 낫다. (F)', 6);
    if (depth > 260) this.once('sig', '신호가 선명해진다. 일정한 간격이다. 누군가 보내고 있다.', 5.5);
    if (depth > 380 && ctx.battery < 40) this.once('batt', '배터리가 부족하다. 올라갈 때를 위해 남겨 둬야 한다.', 5.5);
    if (depth > 430) this.once('struct', '구조물이다. 사람이 만든 것이 아니다.', 5);
    if (depth > 455) this.once('core', '저 빛이 신호의 근원이다. 가까이 가 보자.', 5);
  }
}
