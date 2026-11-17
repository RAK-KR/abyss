// 환경 디테일: 자갈, 산호, 고대 구조물, 수면 빛줄기
import * as THREE from 'three';
import { SHARED, makeRockMaterial } from './materials.js';
import { makeGlowTexture } from './world.js';
import { mulberry32, noise2, clamp, smoothstep } from './utils.js';

// ---------- 분기형 산호 지오메트리 (수동 병합) ----------
function buildCoral(seed) {
  const rand = mulberry32(seed);
  const pos = [], nor = [], idx = [];
  const RAD = 6;
  function tube(p0, p1, r0, r1) {
    const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3().crossVectors(dir, up).normalize();
    const b = new THREE.Vector3().crossVectors(dir, a).normalize();
    const base = pos.length / 3;
    for (let k = 0; k < 2; k++) {
      const c = k === 0 ? p0 : p1, r = k === 0 ? r0 : r1;
      for (let i = 0; i < RAD; i++) {
        const t = (i / RAD) * Math.PI * 2;
        const n = new THREE.Vector3().addScaledVector(a, Math.cos(t)).addScaledVector(b, Math.sin(t));
        pos.push(c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
        nor.push(n.x, n.y, n.z);
      }
    }
    for (let i = 0; i < RAD; i++) {
      const i2 = (i + 1) % RAD;
      idx.push(base + i, base + RAD + i, base + i2, base + i2, base + RAD + i, base + RAD + i2);
    }
  }
  function branch(p, dir, len, r, depth) {
    const end = p.clone().addScaledVector(dir, len);
    tube(p, end, r, r * 0.72);
    if (depth <= 0) return;
    const n = depth === 3 ? 3 : 2 + (rand() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const nd = dir.clone();
      nd.x += (rand() - 0.5) * 1.1; nd.z += (rand() - 0.5) * 1.1; nd.y += 0.25;
      nd.normalize();
      branch(end, nd, len * (0.7 + rand() * 0.15), r * 0.7, depth - 1);
    }
  }
  branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.9, 0.11, 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

export class Detail {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.glowTex = makeGlowTexture();
    this.ruins = [];
    this.buildPebbles();
    this.buildCoral();
    this.buildRuins();
    this.buildShafts();
  }

  // 자갈/작은 돌 무더기
  buildPebbles() {
    const rand = mulberry32(1234);
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.3 * (noise2(x * 2 + 3, y * 2 + z) - 0.5);
      p.setXYZ(i, x * n * 1.2, y * n * 0.6, z * n);
    }
    g.computeVertexNormals();
    const count = 4200;
    const m = new THREE.InstancedMesh(g, makeRockMaterial({ roughness: 0.85, bump: 0.5, detail: 0.5 }), count);
    const d = new THREE.Object3D(), c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const dist = rand() * 1480;
      const z = -dist;
      const w = this.world.halfWidth(z);
      const x = this.world.pathX(z) + (rand() - 0.5) * 2 * (w + 18) * Math.pow(rand(), 0.7);
      const y = this.world.heightAt(x, z);
      const s = 0.12 + Math.pow(rand(), 2.5) * 0.9;
      d.position.set(x, y + s * 0.15, z);
      d.rotation.set(rand() * 0.4, rand() * 6.28, rand() * 0.4);
      d.scale.set(s * (0.8 + rand() * 0.8), s, s * (0.8 + rand() * 0.8));
      d.updateMatrix(); m.setMatrixAt(i, d.matrix);
      const t = 0.5 + rand() * 0.6;
      c.setRGB(0.52 * t, 0.5 * t, 0.46 * t);
      m.setColorAt(i, c);
    }
    m.frustumCulled = false;
    this.scene.add(m);
  }

  // 분기형 산호 군락
  buildCoral() {
    const rand = mulberry32(777);
    const variants = [buildCoral(11), buildCoral(23), buildCoral(37)];
    const palette = [0xc8553a, 0xb0407a, 0x7a52b8, 0x3fa0a8, 0xd7c08a, 0xc87a2c];
    const per = 120;
    variants.forEach((g) => {
      const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), per);
      const d = new THREE.Object3D(), c = new THREE.Color();
      for (let i = 0; i < per; i++) {
        const dist = 30 + rand() * 1420;
        const z = -dist;
        const w = this.world.halfWidth(z);
        const x = this.world.pathX(z) + (rand() - 0.5) * 2 * w * 0.95;
        const y = this.world.heightAt(x, z) - 0.15;
        const s = 0.9 + rand() * 2.6;
        d.position.set(x, y, z);
        d.rotation.set((rand() - 0.5) * 0.25, rand() * 6.28, (rand() - 0.5) * 0.25);
        d.scale.setScalar(s);
        d.updateMatrix(); m.setMatrixAt(i, d.matrix);
        c.setHex(palette[Math.floor(rand() * palette.length)]).multiplyScalar(0.55 + rand() * 0.5);
        m.setColorAt(i, c);
      }
      m.frustumCulled = false; m.castShadow = true;
      this.scene.add(m);
    });
  }

  // 고대 구조물: 오벨리스크, 부서진 기둥, 고리 파편 (신호원과 같은 재질)
  buildRuins() {
    const rand = mulberry32(4242);
    const stone = makeRockMaterial({ color: 0x2c363c, roughness: 0.55, bump: 0.18, detail: 0.3 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x2fc8e0 });
    const slots = [260, 380, 470, 590, 700, 810, 920, 1030, 1130, 1220, 1300];
    for (const dist of slots) {
      const z = -(dist + (rand() - 0.5) * 30);
      const w = this.world.halfWidth(z);
      const x = this.world.pathX(z) + (rand() < 0.5 ? -1 : 1) * w * (0.35 + rand() * 0.4);
      const y = this.world.heightAt(x, z);
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      grp.rotation.y = rand() * 6.28;

      // 오벨리스크(위로 갈수록 가늘어짐)
      const H = 14 + rand() * 12;
      const og = new THREE.BoxGeometry(2.6, H, 2.6, 1, 4, 1);
      const op = og.attributes.position;
      for (let i = 0; i < op.count; i++) {
        const t = (op.getY(i) + H / 2) / H;
        const k = 1 - 0.45 * t;
        op.setX(i, op.getX(i) * k); op.setZ(i, op.getZ(i) * k);
      }
      og.computeVertexNormals();
      const ob = new THREE.Mesh(og, stone);
      ob.position.y = H / 2 - 0.8; ob.rotation.z = (rand() - 0.5) * 0.08;
      ob.castShadow = true; ob.receiveShadow = true;
      grp.add(ob);
      // 발광 띠(오벨리스크 둘레를 감싸는 고리)
      for (const t of [0.28, 0.5, 0.72]) {
        const rad = 1.3 * (1 - 0.45 * t) + 0.05;
        const band = new THREE.Mesh(new THREE.TorusGeometry(rad * 1.04, 0.09, 6, 20), glowMat);
        band.rotation.x = Math.PI / 2;
        band.position.y = (t - 0.5) * H;
        ob.add(band);
      }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x40d8f0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }));
      sp.scale.setScalar(9); sp.position.set(0, H - 1, 0);
      grp.add(sp);
      // 받침
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.6, 1.4, 8), stone);
      base.position.y = 0.2; base.receiveShadow = true; base.castShadow = true;
      grp.add(base);
      // 부서진 기둥들
      for (let i = 0; i < 3; i++) {
        const a = rand() * 6.28, r = 6 + rand() * 6, h = 2 + rand() * 6;
        const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, h, 8), stone);
        pl.position.set(Math.cos(a) * r, h / 2 - 0.6, Math.sin(a) * r);
        pl.rotation.set((rand() - 0.5) * 0.25, 0, (rand() - 0.5) * 0.25);
        pl.castShadow = true; pl.receiveShadow = true;
        grp.add(pl);
      }
      // 쓰러진 기둥
      const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 9, 8), stone);
      fall.rotation.z = Math.PI / 2; fall.rotation.y = rand() * 3;
      fall.position.set(rand() * 8 - 4, 0.5, 6 + rand() * 4);
      fall.castShadow = true;
      grp.add(fall);
      // 고리 파편(호)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.55, 8, 28, 2.2 + rand() * 1.4), stone);
      ring.position.set(-5, 3.5, -3); ring.rotation.set(Math.PI / 2 - 0.5, 0, rand() * 6.28);
      ring.castShadow = true;
      grp.add(ring);

      this.scene.add(grp);
      this.ruins.push({ x, z, y, seen: false });
    }
  }

  // 수면 빛줄기 (얕은 곳에서만 보임) — 카메라 주위에서 재활용
  buildShafts() {
    const H = 130;
    const g = new THREE.CylinderGeometry(5, 11, H, 18, 1, true);
    g.translate(0, -H / 2, 0);
    this.shaftMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uPow: { value: 1 }, uTime: SHARED.uTime },
      vertexShader: /* glsl */`varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vY = position.y; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vW; uniform float uPow; uniform float uTime;
        void main(){
          float fr = pow(abs(dot(normalize(vN), normalize(vV))), 2.4);
          float t = clamp(-vY / 130.0, 0.0, 1.0);
          float flick = 0.75 + 0.25 * sin(uTime * 0.6 + vW.x * 0.05 + vW.z * 0.04);
          float dist = distance(vW, cameraPosition);
          float a = fr * (1.0 - t) * (1.0 - t) * 0.16 * flick * uPow * smoothstep(6.0, 40.0, dist);
          gl_FragColor = vec4(vec3(0.55, 0.9, 1.0) * a, a);
        }`,
    });
    this.shafts = [];
    const rand = mulberry32(55);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(g, this.shaftMat);
      m.renderOrder = 4;
      m.userData = { ox: (rand() - 0.5) * 220, oz: (rand() - 0.5) * 220, sc: 0.6 + rand() * 1.1 };
      m.scale.set(m.userData.sc, 1, m.userData.sc);
      m.rotation.set(0.15, 0, 0.1);
      this.scene.add(m);
      this.shafts.push(m);
    }
  }

  update(camera, env, depth, story) {
    // 빛줄기: 카메라 격자에 맞춰 재배치
    const k = clamp(env.sun * 1.6, 0, 1) * (1 - smoothstep(60, 130, depth));
    this.shaftMat.uniforms.uPow.value = k;
    for (const m of this.shafts) {
      m.visible = k > 0.01;
      const gx = Math.round((camera.position.x - m.userData.ox) / 220) * 220 + m.userData.ox;
      const gz = Math.round((camera.position.z - m.userData.oz) / 220) * 220 + m.userData.oz;
      m.position.set(gx, 0, gz);
    }
  }

  nearestRuin(pos, maxD) {
    for (const r of this.ruins) {
      if (Math.hypot(pos.x - r.x, pos.z - r.z) < maxD && Math.abs(pos.y - r.y) < 40) return r;
    }
    return null;
  }
}
