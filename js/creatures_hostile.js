// 위협 생물: 루커(빛에 반응하는 심해 포식자), 레비아탄(최심부의 거대 생물)
import * as THREE from 'three';
import { makeRockMaterial } from './materials.js';
import { makeGlowTexture } from './world.js';
import { mulberry32, clamp, lerp, smoothstep } from './utils.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// ======================= 루커 =======================
class Lurker {
  constructor(parent, glowTex, x, y, z, seed) {
    this.group = new THREE.Group();
    this.pos = new THREE.Vector3(x, y, z);
    this.home = this.pos.clone();
    this.vel = new THREE.Vector3(0, 0, -1);
    this.state = 'idle';
    this.t = 0;
    this.seed = seed;
    this.wp = this.home.clone();
    this.lockDir = new THREE.Vector3();
    this.loseT = 0;
    this.cool = 0;
    this.heading = new THREE.Vector3(0, 0, -1);

    const skin = makeRockMaterial({ color: 0x1c2830, roughness: 0.45, bump: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x050809, roughness: 0.9 });
    const tooth = new THREE.MeshStandardMaterial({ color: 0xcfd6c8, roughness: 0.35 });

    // 몸통
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), skin);
    body.scale.set(2.1, 1.9, 3.3);
    body.castShadow = true;
    this.group.add(body);
    // 꼬리
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0, 2.9);
    const tm = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 12), skin);
    tm.rotation.x = Math.PI / 2; tm.position.z = 3;
    this.tail.add(tm);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.8, 2.2), skin);
    fin.position.z = 5.4; fin.rotation.x = 0.25;
    this.tail.add(fin);
    this.group.add(this.tail);
    // 옆 지느러미
    this.fins = [];
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), skin);
      f.rotation.set(0, 0, s * (Math.PI / 2 + 0.35)); f.position.set(s * 2.2, -0.5, 0.4);
      this.group.add(f); this.fins.push(f);
    }
    // 입: 위턱(몸통 앞), 아래턱
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.7, -2.5);
    const jm = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), skin);
    jm.scale.set(1.8, 0.9, 2.6); jm.position.z = -0.7; jm.castShadow = true;
    this.jaw.add(jm);
    const mouthIn = new THREE.Mesh(new THREE.CircleGeometry(1, 20), dark);
    mouthIn.scale.set(1.75, 2.4, 1); mouthIn.rotation.x = -Math.PI / 2; mouthIn.position.set(0, 0.02, -0.7);
    this.jaw.add(mouthIn);
    const toothG = new THREE.ConeGeometry(0.11, 0.85, 5);
    for (let i = 0; i < 16; i++) {
      const a = (i / 15) * Math.PI;
      const t = new THREE.Mesh(toothG, tooth);
      t.position.set(Math.cos(a) * 1.65, 0.35, -0.7 - Math.sin(a) * 2.3);
      this.jaw.add(t);
    }
    this.group.add(this.jaw);
    for (let i = 0; i < 18; i++) {
      const a = (i / 17) * Math.PI;
      const t = new THREE.Mesh(toothG, tooth);
      t.rotation.x = Math.PI;
      t.position.set(Math.cos(a) * 1.65, -0.55, -3.2 - Math.sin(a) * 1.9 + 0.2);
      t.position.y = -0.55; t.position.z = -3.3 + Math.sin(a) * -0.0 - Math.sin(a) * 1.5;
      this.group.add(t);
    }
    // 눈
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x331008 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), this.eyeMat);
      e.position.set(s * 1.2, 0.6, -2.5);
      this.group.add(e);
    }
    // 루어(미끼) — 줄기 + 발광구
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.7, -1.2), new THREE.Vector3(0, 3.8, -2.4), new THREE.Vector3(0, 4.6, -5.0), new THREE.Vector3(0, 3.0, -7.4)]);
    const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.07, 6, false), dark);
    this.group.add(stalk);
    this.lureMat = new THREE.MeshBasicMaterial({ color: 0xaaffee });
    this.lure = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), this.lureMat);
    this.lure.position.copy(curve.getPoint(1));
    this.group.add(this.lure);
    this.lureGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x66ffe0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.lureGlow.scale.setScalar(9);
    this.lure.add(this.lureGlow);
    // 몸에 점박이 발광
    const dotG = new THREE.SphereGeometry(0.09, 6, 5);
    const dotM = new THREE.MeshBasicMaterial({ color: 0x44ffd0 });
    const rnd = mulberry32(seed * 977 + 3);
    for (let i = 0; i < 26; i++) {
      const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
      const d = new THREE.Mesh(dotG, dotM);
      d.position.set(Math.sin(ph) * Math.cos(th) * 2.12, Math.cos(ph) * 1.92, Math.sin(ph) * Math.sin(th) * 3.32);
      if (d.position.z < -1.5 && d.position.y < 0.2) continue;
      this.group.add(d);
    }
    this.group.position.copy(this.pos);
    parent.add(this.group);
  }
}

export class Lurkers {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.glowTex = makeGlowTexture();
    this.list = [];
    const zones = [190, 340, 520, 700, 880, 1040, 1190, 1330];
    zones.forEach((d, i) => {
      const z = -d;
      const x = world.pathX(z) + (i % 2 ? 1 : -1) * world.halfWidth(z) * 0.45;
      const y = world.heightAt(x, z) + 14 + (i % 3) * 5;
      this.list.push(new Lurker(scene, this.glowTex, x, y, z, i + 1));
    });
    // 루어 조명 풀(2개)
    this.lights = [0, 1].map(() => {
      const l = new THREE.PointLight(0x66ffe0, 0, 70, 1.6);
      scene.add(l);
      return l;
    });
    this.nearest = null;
    this.nearestDist = 1e9;
  }

  // flares: [{pos, alive}] ; 반환: 피해 이벤트
  update(dt, time, sub, flares, onHit, audio) {
    const events = [];
    this.nearestDist = 1e9;
    let dangerNear = 0;
    for (const L of this.list) {
      L.t += dt;
      const toP = _v.copy(sub.pos).sub(L.pos);
      const dist = toP.length();
      // 감지 반경
      let R = 20 + (sub.lampOn && sub.lampLevel > 0.3 ? 52 : 0) + Math.min(sub.speed, 16) * 3.2;
      if (!sub.lampOn && sub.speed < 2.5) R = 10;
      // 조명 플레어 우선
      let target = sub.pos, tdist = dist;
      for (const f of flares) {
        if (!f.alive) continue;
        const fd = f.pos.distanceTo(L.pos);
        if (fd < 80 && fd < dist + 25) { target = f.pos; tdist = fd; }
      }
      const targetIsFlare = target !== sub.pos;
      let speed = 2.4, turn = 1.2;
      const wantDir = _v2.set(0, 0, 0);

      switch (L.state) {
        case 'idle': {
          if (L.t > 6 || L.pos.distanceTo(L.wp) < 5) {
            L.t = 0;
            L.wp.set(L.home.x + (Math.random() - 0.5) * 70, L.home.y + (Math.random() - 0.5) * 12, L.home.z + (Math.random() - 0.5) * 70);
          }
          wantDir.copy(L.wp).sub(L.pos).normalize();
          speed = 2.6;
          if (dist < R || (targetIsFlare && tdist < 75)) { L.state = 'stalk'; L.t = 0; L.loseT = 0; audio && audio.lurkerNotice(); }
          break;
        }
        case 'stalk': {
          wantDir.copy(target).sub(L.pos).normalize();
          speed = 8.5; turn = 2.2;
          if (targetIsFlare && tdist < 7) { speed = 2; }
          if (dist > R * 1.4 && !targetIsFlare) L.loseT += dt; else L.loseT = 0;
          if (L.loseT > 4.5) { L.state = 'idle'; L.t = 0; }
          if (!targetIsFlare && dist < 22 && L.t > 1.4) {
            L.state = 'attack'; L.t = 0;
            L.lockDir.copy(sub.pos).sub(L.pos).normalize();
            audio && audio.lurkerAttack();
          }
          break;
        }
        case 'attack': {
          // 약한 유도
          const hom = _v2.copy(sub.pos).sub(L.pos).normalize();
          L.lockDir.lerp(hom, 1 - Math.exp(-dt * 2.5)).normalize();
          wantDir.copy(L.lockDir);
          speed = 21; turn = 5;
          if (dist < 4.6 && L.cool <= 0) {
            L.cool = 2;
            events.push({ type: 'hit', damage: 22, dir: toP.clone().normalize(), from: L });
            L.state = 'recover'; L.t = 0;
          }
          if (L.t > 1.6) { L.state = 'recover'; L.t = 0; }
          break;
        }
        case 'recover': {
          wantDir.copy(L.pos).sub(sub.pos).normalize();
          wantDir.y += 0.2;
          speed = 6; turn = 1.5;
          if (L.t > 3) { L.state = dist < R ? 'stalk' : 'idle'; L.t = 0; }
          break;
        }
      }
      L.cool = Math.max(0, L.cool - dt);

      // 이동
      L.heading.lerp(wantDir, 1 - Math.exp(-dt * turn)).normalize();
      L.vel.lerp(_v.copy(L.heading).multiplyScalar(speed), 1 - Math.exp(-dt * 2.2));
      L.pos.addScaledVector(L.vel, dt);
      // 지형 회피
      const gy = this.world.heightAt(L.pos.x, L.pos.z) + 5;
      if (L.pos.y < gy) { L.pos.y += (gy - L.pos.y) * Math.min(1, dt * 4); }
      L.pos.y = Math.min(L.pos.y, -18);
      L.group.position.copy(L.pos);
      // 자세
      _v.copy(L.pos).addScaledVector(L.vel.lengthSq() > 0.01 ? L.vel : L.heading, -1);
      L.group.lookAt(_v.x, _v.y, _v.z); // +Z가 뒤쪽을 향하도록 (머리는 -Z)
      L.group.rotateZ(Math.sin(time * 1.3 + L.seed) * 0.05);
      L.tail.rotation.y = Math.sin(time * (2.2 + L.vel.length() * 0.18) + L.seed) * (0.3 + L.vel.length() * 0.015);
      L.fins.forEach((f, i) => { f.rotation.x = Math.sin(time * 2 + i * 3 + L.seed) * 0.35; });
      const open = L.state === 'attack' ? 0.9 : L.state === 'stalk' ? 0.25 : 0.06 + 0.04 * Math.sin(time * 1.5 + L.seed);
      L.jaw.rotation.x = lerp(L.jaw.rotation.x, open, 1 - Math.exp(-dt * 8));
      const hunting = L.state === 'stalk' || L.state === 'attack';
      L.eyeMat.color.setHex(hunting ? 0xff3a1a : 0x331008);
      const pulse = hunting ? 0.55 + 0.45 * Math.sin(time * 14 + L.seed) : 0.75 + 0.25 * Math.sin(time * 1.6 + L.seed);
      L.lureMat.color.setRGB(0.55 * pulse + 0.3, 1.0 * pulse, 0.85 * pulse);
      L.lureGlow.material.opacity = 0.5 + 0.5 * pulse;

      if (dist < this.nearestDist) { this.nearestDist = dist; this.nearest = L; }
      if (hunting) dangerNear = Math.max(dangerNear, 1 - clamp(dist / 80, 0, 1));
    }
    // 가까운 루어 2개에만 실제 조명 할당
    const sorted = this.list.slice().sort((a, b) => a.pos.distanceToSquared(sub.pos) - b.pos.distanceToSquared(sub.pos));
    for (let i = 0; i < this.lights.length; i++) {
      const L = sorted[i];
      const w = new THREE.Vector3(); L.lure.getWorldPosition(w);
      this.lights[i].position.copy(w);
      this.lights[i].intensity = L.pos.distanceTo(sub.pos) < 120 ? 260 : 0;
    }
    this.danger = dangerNear;
    return events;
  }
}

// ======================= 레비아탄 =======================
export class Leviathan {
  constructor(scene, world, core) {
    this.scene = scene; this.world = world;
    this.N = 36; this.spacing = 7.2;
    this.state = 'sleep';       // sleep | rising | hunt
    this.t = 0;
    this.speed = 0;
    this.huntT = 0;
    this.glowTex = makeGlowTexture();
    this.group = new THREE.Group();
    scene.add(this.group);

    const bodyMat = makeRockMaterial({ color: 0x182229, roughness: 0.5, bump: 0.5 });
    const segG = new THREE.SphereGeometry(1, 20, 14);
    this.seg = new THREE.InstancedMesh(segG, bodyMat, this.N);
    this.seg.castShadow = true; this.seg.receiveShadow = true; this.seg.frustumCulled = false;
    this.group.add(this.seg);
    // 옆구리 발광 점
    this.dotsPer = 5;
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.N * this.dotsPer * 2);
    this.dots.frustumCulled = false;
    this.group.add(this.dots);
    const c = new THREE.Color();
    for (let i = 0; i < this.dots.count; i++) { c.setHSL(0.5 + (i % 7) * 0.012, 0.9, 0.55).multiplyScalar(1.7); this.dots.setColorAt(i, c); }

    // 머리
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), bodyMat);
    skull.scale.set(8.5, 5.8, 12); skull.castShadow = true;
    this.head.add(skull);
    this.jaw = new THREE.Group(); this.jaw.position.set(0, -3.0, -3);
    const jm = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), bodyMat);
    jm.scale.set(7.2, 3.4, 10.5); jm.position.z = -3.2; jm.castShadow = true;
    this.jaw.add(jm);
    const toothM = new THREE.MeshStandardMaterial({ color: 0xc9d1c2, roughness: 0.4 });
    const tg = new THREE.ConeGeometry(0.42, 3.4, 6);
    for (let i = 0; i < 20; i++) {
      const a = (i / 19) * Math.PI;
      const t = new THREE.Mesh(tg, toothM);
      t.position.set(Math.cos(a) * 6.6, 1.4, -3.2 - Math.sin(a) * 9.3);
      this.jaw.add(t);
    }
    this.head.add(this.jaw);
    for (let i = 0; i < 20; i++) {
      const a = (i / 19) * Math.PI;
      const t = new THREE.Mesh(tg, toothM);
      t.rotation.x = Math.PI;
      t.position.set(Math.cos(a) * 6.8, -2.6, -6.7 - Math.sin(a) * 6.5);
      this.head.add(t);
    }
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x200a06 });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), this.eyeMat);
      e.position.set(s * 5.4, 1.2, -8.2);
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff5a22, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      g.scale.setScalar(16);
      e.add(g);
      this.head.add(e); this.eyes.push(g);
    }
    // 머리의 발광 줄무늬
    const strG = new THREE.SphereGeometry(0.28, 6, 5);
    const strM = new THREE.MeshBasicMaterial({ color: 0x59f6ff });
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Mesh(strG, strM);
      const a = (i / 16) * 1.6 - 0.8;
      s.position.set(Math.sin(a) * 6.5, 4.6 - Math.abs(a) * 2, -3 - Math.cos(a) * 4);
      this.head.add(s);
      const s2 = s.clone(); s2.position.x *= -1; this.head.add(s2);
    }
    this.group.add(this.head);

    // 궤적(트레일)과 초기 코일 배치
    this.center = new THREE.Vector3(core.x, core.y, core.z);
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.trail = [];  // 머리부터 꼬리 방향 (0 = 가장 최근)
    this.initCoil();
    this.writeSegments(0);
  }

  initCoil() {
    const L = this.N * this.spacing + 120;
    const pts = [];
    const R0 = 58, R1 = 42;
    const th0 = Math.PI * 0.18;
    for (let s = 0; s <= L; s += 1.5) {
      const R = lerp(R0, R1, s / L);
      const th = th0 + s / R;
      pts.push(new THREE.Vector3(
        this.center.x + Math.cos(th) * R,
        this.center.y - 6 + 8 + 5 * Math.sin(s * 0.045) + s * 0.012,
        this.center.z + Math.sin(th) * R));
    }
    // 가장 앞(머리)이 pts[0]. 이후는 꼬리 방향.
    this.trail = pts;
    this.pos.copy(pts[0]);
    // 머리 방향: pts[0] -> 앞쪽(코일 진행 반대)
    this.dir.copy(pts[0]).sub(pts[4]).normalize();
  }

  // 트레일에서 머리로부터 거리 s 위치
  sample(s, out) {
    const t = this.trail;
    let acc = 0;
    for (let i = 0; i < t.length - 1; i++) {
      const d = t[i].distanceTo(t[i + 1]);
      if (acc + d >= s) { return out.copy(t[i]).lerp(t[i + 1], (s - acc) / Math.max(d, 1e-5)); }
      acc += d;
    }
    return out.copy(t[t.length - 1]);
  }

  wake() {
    if (this.state !== 'sleep') return;
    this.state = 'rising'; this.t = 0; this.speed = 2;
  }

  writeSegments(time) {
    const d = new THREE.Object3D();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), tangent = new THREE.Vector3();
    const breathe = this.state === 'sleep' ? 1 + 0.015 * Math.sin(time * 0.6) : 1;
    for (let i = 0; i < this.N; i++) {
      const s = (i + 1.4) * this.spacing;
      this.sample(s, a); this.sample(s + 2, b);
      tangent.copy(a).sub(b);
      if (tangent.lengthSq() < 1e-6) tangent.set(0, 0, -1);
      d.position.copy(a);
      d.lookAt(a.x - tangent.x, a.y - tangent.y, a.z - tangent.z);
      const f = i / (this.N - 1);
      const r = lerp(6.4, 0.9, Math.pow(f, 0.85)) * breathe;
      d.scale.set(r, r * 0.88, this.spacing * 0.78);
      d.updateMatrix();
      this.seg.setMatrixAt(i, d.matrix);
      // 옆 발광 점
      for (let k = 0; k < this.dotsPer; k++) {
        for (const side of [-1, 1]) {
          const idx = (i * this.dotsPer + k) * 2 + (side > 0 ? 1 : 0);
          const dd = new THREE.Object3D();
          dd.position.copy(a);
          dd.lookAt(a.x - tangent.x, a.y - tangent.y, a.z - tangent.z);
          dd.translateX(side * r * 0.98 * Math.cos(0.15 + k * 0.17));
          dd.translateY(-r * 0.18 + r * 0.25 * Math.sin(0.15 + k * 0.17) * 0.0 + (k - 2) * r * 0.2);
          dd.translateZ((k - 2) * this.spacing * 0.16);
          const gl = this.state === 'sleep' ? 0.55 + 0.45 * Math.sin(time * 0.8 + i * 0.5 + k) : 0.8 + 0.2 * Math.sin(time * 4 + i * 0.7 + k);
          dd.scale.setScalar(Math.max(0.2, (1.0 - f * 0.4) * gl * (r / 6.4 + 0.35)));
          dd.updateMatrix();
          this.dots.setMatrixAt(idx, dd.matrix);
        }
      }
    }
    this.seg.instanceMatrix.needsUpdate = true;
    this.dots.instanceMatrix.needsUpdate = true;
    // 머리
    this.head.position.copy(this.pos);
    this.head.lookAt(this.pos.x - this.dir.x, this.pos.y - this.dir.y, this.pos.z - this.dir.z);
  }

  update(dt, time, sub) {
    this.t += dt;
    let kill = false;
    if (this.state === 'sleep') {
      this.eyeMat.color.setHex(0x200a06);
      this.eyes.forEach(g => (g.material.opacity = 0));
      this.jaw.rotation.x = 0.05 + 0.03 * Math.sin(time * 0.6);
    } else {
      // 눈 점화
      const ign = clamp(this.t / 1.8, 0, 1);
      this.eyeMat.color.setRGB(1.0 * ign + 0.1, 0.38 * ign + 0.03, 0.12 * ign);
      this.eyes.forEach(g => (g.material.opacity = ign * (0.75 + 0.25 * Math.sin(time * 8))));
      this.jaw.rotation.x = lerp(this.jaw.rotation.x, this.state === 'hunt' ? 0.55 + 0.1 * Math.sin(time * 3) : 0.1, 1 - Math.exp(-dt * 3));

      let wantDir = _v.copy(sub.pos).sub(this.pos);
      const dist = wantDir.length();
      wantDir.normalize();
      if (this.state === 'rising') {
        wantDir.set(0, 1, 0).addScaledVector(this.dir, 0.2).normalize();
        this.speed = lerp(this.speed, 6, 1 - Math.exp(-dt * 0.8));
        if (this.t > 3.2) { this.state = 'hunt'; this.huntT = 0; }
      } else {
        this.huntT += dt;
        const k = clamp(this.huntT / 38, 0, 1);
        const base = lerp(9.8, 14.5, k);
        // 플레이어가 멀면 따라붙고, 너무 앞서가면 약간 가속(긴장감 유지)
        this.speed = lerp(this.speed, base + clamp((dist - 90) * 0.04, 0, 3), 1 - Math.exp(-dt * 1.2));
      }
      const turn = this.state === 'hunt' ? 0.95 : 1.4;
      this.dir.lerp(wantDir, 1 - Math.exp(-dt * turn)).normalize();
      this.pos.addScaledVector(this.dir, this.speed * dt);
      // 트레일 갱신
      const first = this.trail[0];
      if (first.distanceTo(this.pos) > 1.5) {
        this.trail.unshift(this.pos.clone());
        if (this.trail.length > 900) this.trail.pop();
      } else first.copy(this.pos);
      // 충돌
      const headHit = this.pos.distanceTo(sub.pos);
      if (headHit < 11) kill = true;
      if (!kill) {
        for (let i = 0; i < 7; i++) {
          this.sample((i + 1.4) * this.spacing, _v2);
          const r = lerp(6.4, 0.9, Math.pow(i / (this.N - 1), 0.85));
          if (_v2.distanceTo(sub.pos) < r * 0.95 + 2.6) { kill = true; break; }
        }
      }
      this.gap = dist;
    }
    this.writeSegments(time);
    return kill;
  }
}
