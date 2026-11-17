// 해저 협곡: 절차적 지형, 데코레이션, 수면, 환경(수심별 안개/조명)
import * as THREE from 'three';
import { CFG, ENV_KEYS } from './config.js';
import { clamp, lerp, smoothstep, fbm2, noise2, mulberry32 } from './utils.js';
import { makeRockMaterial, SHARED } from './materials.js';

const STEP = 4;          // 지형 격자 간격(m)
const CHUNK_ROWS = 40;   // 청크 하나의 행 수

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    scene.fog = new THREE.FogExp2(0x2a8fb0, 0.01);
    scene.background = new THREE.Color(0x2a8fb0);

    // 조명 (수심에 따라 세기 변화)
    this.hemi = new THREE.HemisphereLight(0x5fb8d8, 0x0a1c2a, 1.0);
    this.sun = new THREE.DirectionalLight(0xbfefff, 2.2);
    this.sun.position.set(40, 200, 30);
    scene.add(this.hemi, this.sun);

    this._envColor = new THREE.Color();
    this.buildTerrain();
    this.buildDecor();
    this.buildVents();
    this.buildSurface();
  }

  // ---------- 지형 함수 ----------
  pathX(z) {
    const d = -z;
    const amp = smoothstep(-20, 140, d) * (1 - smoothstep(1250, 1400, d));
    return (55 * Math.sin(d * 0.0042) + 28 * Math.sin(d * 0.011 + 1.3)) * amp;
  }
  halfWidth(z) {
    const d = -z;
    let w = 38 + 16 * noise2(d * 0.012, 3.3);
    w = lerp(w, 125, smoothstep(1290, 1420, d));
    return w;
  }
  floorY(z) {
    const d = clamp(-z, -100, 1700);
    let base = -22 - 0.30 * d + 9 * Math.sin(d * 0.021) + 5 * Math.sin(d * 0.057 + 1.0);
    base = lerp(base, -470, smoothstep(1330, 1430, d));
    return base;
  }
  heightAt(x, z) {
    const d = clamp(-z, -100, 1700);
    const cx = this.pathX(z);
    const w = this.halfWidth(z);
    const dx = Math.abs(x - cx);
    const wallT = smoothstep(w, w + 55, dx);
    const wallH = 70 + 0.34 * clamp(d, 0, 1500);
    const basin = smoothstep(1330, 1430, d);
    let h = this.floorY(z) + wallT * wallH;
    const big = fbm2(x * 0.02 + 10, z * 0.02, 4);
    const mid = fbm2(x * 0.07, z * 0.07 + 5, 3);
    const small = noise2(x * 0.4, z * 0.4) - 0.5;
    h += big * (2.5 * (1 - basin * 0.7) + 17 * wallT) + mid * (1.1 + 4.5 * wallT) + small * (0.3 + 1.0 * wallT);
    // 벽면 단층 느낌
    h += wallT * Math.sin(h * 0.35 + big * 6) * 1.6;
    // 부드러운 상한(수면 아래 -8m)
    if (h > -30) h = -30 + 22 * Math.tanh((h + 30) / 22);
    return h;
  }
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.2;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
  }

  // ---------- 지형 메시 ----------
  buildTerrain() {
    this.mat = makeRockMaterial({ vertexColors: true, roughness: 0.95, bump: 1.0 });
    const cols = Math.round((CFG.X_HALF * 2) / STEP) + 1;
    const rows = Math.round((CFG.Z_MAX - CFG.Z_MIN) / STEP) + 1;
    this.chunks = [];
    const tmpN = new THREE.Vector3();
    for (let r0 = 0; r0 < rows - 1; r0 += CHUNK_ROWS) {
      const r1 = Math.min(r0 + CHUNK_ROWS, rows - 1);
      const nr = r1 - r0 + 1;
      const pos = new Float32Array(nr * cols * 3);
      const nor = new Float32Array(nr * cols * 3);
      const col = new Float32Array(nr * cols * 3);
      let p = 0;
      for (let r = r0; r <= r1; r++) {
        const z = CFG.Z_MAX - r * STEP;
        for (let c = 0; c < cols; c++) {
          const x = -CFG.X_HALF + c * STEP;
          const h = this.heightAt(x, z);
          pos[p] = x; pos[p + 1] = h; pos[p + 2] = z;
          this.normalAt(x, z, tmpN);
          nor[p] = tmpN.x; nor[p + 1] = tmpN.y; nor[p + 2] = tmpN.z;
          // 정점 색: 평지는 퇴적물, 급사면은 어두운 암석, 오목한 곳은 어둡게
          const slope = 1 - tmpN.y;
          const avg = (this.heightAt(x + 7, z) + this.heightAt(x - 7, z) + this.heightAt(x, z + 7) + this.heightAt(x, z - 7)) * 0.25;
          const cav = clamp(0.5 + (h - avg) / 5, 0, 1);
          const ao = 0.5 + 0.5 * cav;
          const sand = smoothstep(0.35, 0.05, slope);
          const patch = noise2(x * 0.05, z * 0.05);
          const rr = lerp(0.20, 0.50, sand) * (0.8 + 0.4 * patch);
          const gg = lerp(0.23, 0.50, sand) * (0.8 + 0.4 * patch);
          const bb = lerp(0.27, 0.52, sand);
          col[p] = rr * ao; col[p + 1] = gg * ao; col[p + 2] = bb * ao;
          p += 3;
        }
      }
      const idx = [];
      for (let r = 0; r < nr - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
          idx.push(a, d, b, b, d, e);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, this.mat);
      m.receiveShadow = true;
      m.castShadow = true;
      this.group.add(m);
      this.chunks.push(m);
    }
  }

  // ---------- 바위/기둥/발광 생물 ----------
  buildDecor() {
    const rand = mulberry32(7731);
    const rockMat = makeRockMaterial({ roughness: 0.9, bump: 1.2 });
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // 바위 변형 3종
    const variants = [];
    for (let v = 0; v < 3; v++) {
      const g = new THREE.IcosahedronGeometry(1, 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = 1 + 0.42 * (noise2(x * 1.7 + v * 9, y * 1.7 + z * 1.3) - 0.5) + 0.2 * (noise2(x * 4.1, z * 4.1 + y * 3.0 + v) - 0.5);
        p.setXYZ(i, x * n * 1.15, y * n * 0.7, z * n);
      }
      g.computeVertexNormals();
      variants.push(g);
    }
    const perVariant = 420;
    variants.forEach((g, v) => {
      const mesh = new THREE.InstancedMesh(g, rockMat, perVariant);
      for (let i = 0; i < perVariant; i++) {
        const d = rand() * 1460;
        const z = -d;
        const cx = this.pathX(z), w = this.halfWidth(z);
        const side = (rand() - 0.5) * 2;
        const x = cx + side * (w + 40) * Math.pow(rand(), 0.8);
        const y = this.heightAt(x, z);
        const s = (0.8 + Math.pow(rand(), 2.2) * 6.5) * (rand() < 0.04 ? 2.2 : 1);
        dummy.position.set(x, y + s * 0.18, z);
        dummy.rotation.set(rand() * 0.5, rand() * 6.28, rand() * 0.5);
        dummy.scale.set(s * (0.8 + rand() * 0.6), s * (0.7 + rand() * 0.7), s * (0.8 + rand() * 0.6));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const t = 0.35 + rand() * 0.5;
        color.setRGB(0.55 * t + 0.15, 0.6 * t + 0.16, 0.68 * t + 0.18);
        mesh.setColorAt(i, color);
      }
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    });

    // 기둥(스파이어)
    const sg = new THREE.CylinderGeometry(0.9, 2.6, 1, 12, 10, true);
    {
      const p = sg.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = 1 + 0.35 * (noise2(x * 1.3 + y * 3, z * 1.3) - 0.5);
        p.setXYZ(i, x * n, y, z * n);
      }
      sg.computeVertexNormals();
    }
    const spireCount = 70;
    const spires = new THREE.InstancedMesh(sg, rockMat, spireCount);
    for (let i = 0; i < spireCount; i++) {
      const d = 120 + rand() * 1300;
      const z = -d;
      const cx = this.pathX(z), w = this.halfWidth(z);
      const x = cx + (rand() < 0.5 ? -1 : 1) * (w * (0.4 + rand() * 1.0));
      const y = this.heightAt(x, z);
      const hgt = 10 + rand() * 38;
      dummy.position.set(x, y + hgt * 0.5 - 1.5, z);
      dummy.rotation.set((rand() - 0.5) * 0.12, rand() * 6.28, (rand() - 0.5) * 0.12);
      const s = 1 + rand() * 1.6;
      dummy.scale.set(s, hgt, s);
      dummy.updateMatrix();
      spires.setMatrixAt(i, dummy.matrix);
    }
    spires.castShadow = true; spires.receiveShadow = true; spires.frustumCulled = false;
    this.group.add(spires);

    // 발광 관벌레(줄기 + 끝 발광)
    const stalkG = new THREE.CylinderGeometry(0.035, 0.09, 2.6, 6, 6, true);
    stalkG.translate(0, 1.3, 0);
    {
      const p = stalkG.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / 2.6;
        p.setX(i, p.getX(i) + y * y * 0.55);
      }
      stalkG.computeVertexNormals();
    }
    const tipG = new THREE.SphereGeometry(0.13, 8, 6);
    tipG.translate(0.55 + 0.0, 2.6, 0);
    const clusterCount = 90, perCluster = 9;
    const total = clusterCount * perCluster;
    const stalks = new THREE.InstancedMesh(stalkG, new THREE.MeshStandardMaterial({ color: 0x1b2a30, roughness: 0.7 }), total);
    const tips = new THREE.InstancedMesh(tipG, new THREE.MeshBasicMaterial({ color: 0xffffff }), total);
    const palette = [0x40e8ff, 0x9a6bff, 0xff7ad9, 0x6bffb0, 0xffb347];
    let k = 0;
    for (let c = 0; c < clusterCount; c++) {
      const d = 40 + rand() * 1400;
      const z = -d;
      const cx = this.pathX(z), w = this.halfWidth(z);
      const bx = cx + (rand() - 0.5) * 2 * w * 0.9;
      const bz = z + (rand() - 0.5) * 20;
      const hue = palette[Math.floor(rand() * palette.length)];
      for (let i = 0; i < perCluster; i++) {
        const x = bx + (rand() - 0.5) * 7;
        const zz = bz + (rand() - 0.5) * 7;
        const y = this.heightAt(x, zz) - 0.1;
        const s = 0.7 + rand() * 1.5;
        dummy.position.set(x, y, zz);
        dummy.rotation.set((rand() - 0.5) * 0.3, rand() * 6.28, (rand() - 0.5) * 0.3);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        stalks.setMatrixAt(k, dummy.matrix);
        tips.setMatrixAt(k, dummy.matrix);
        color.setHex(hue).multiplyScalar(1.5);
        tips.setColorAt(k, color);
        k++;
      }
    }
    stalks.frustumCulled = false; tips.frustumCulled = false;
    stalks.castShadow = true;
    this.group.add(stalks, tips);
  }

  // 열수 분출구 (깊은 곳 장식)
  buildVents() {
    const rand = mulberry32(991);
    const rockMat = makeRockMaterial({ roughness: 0.8, color: 0x2a2220, bump: 1.0 });
    const g = new THREE.CylinderGeometry(0.7, 2.2, 1, 10, 8, true);
    const glowTex = makeGlowTexture();
    this.vents = [];
    const sprites = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const d = 700 + rand() * 700;
      const z = -d;
      const x = this.pathX(z) + (rand() - 0.5) * this.halfWidth(z) * 1.4;
      const y = this.heightAt(x, z);
      const hgt = 6 + rand() * 12;
      const m = new THREE.Mesh(g, rockMat);
      m.position.set(x, y + hgt * 0.5 - 1, z);
      m.scale.set(1, hgt, 1);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff7a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
      sp.position.set(x, y + hgt + 0.4, z);
      sp.scale.setScalar(7);
      sprites.add(sp);
      this.vents.push({ x, y: y + hgt, z });
    }
    this.group.add(sprites);
  }

  // 수면 (아래에서 올려다본 모습)
  buildSurface() {
    this.surfaceMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: SHARED.uTime,
        uFogColor: { value: new THREE.Color(0x2a8fb0) },
        uDen: { value: 0.01 },
      },
      transparent: false,
      side: THREE.DoubleSide,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        varying vec3 vW; uniform float uTime; uniform vec3 uFogColor; uniform float uDen;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 p = vW.xz * 0.05;
          float w = n(p * 3.0 + uTime * 0.2) * 0.5 + n(p * 7.0 - uTime * 0.3) * 0.3 + n(p * 17.0 + uTime * 0.5) * 0.2;
          vec3 c = mix(vec3(0.35, 0.78, 0.9), vec3(0.95, 1.0, 1.0), smoothstep(0.35, 0.8, w));
          float dist = length(cameraPosition - vW);
          float f = exp(-pow(dist * uDen, 2.0));
          gl_FragColor = vec4(mix(uFogColor, c * 0.55, f), 1.0);
        }`,
    });
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), this.surfaceMat);
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.y = CFG.SURFACE_Y;
    this.scene.add(this.surface);
  }

  // ---------- 환경 ----------
  envAt(depth, out = {}) {
    const k = ENV_KEYS;
    let i = 0;
    while (i < k.length - 2 && depth > k[i + 1].d) i++;
    const a = k[i], b = k[i + 1];
    const t = clamp((depth - a.d) / (b.d - a.d), 0, 1);
    out.fog = out.fog || [0, 0, 0];
    for (let j = 0; j < 3; j++) out.fog[j] = lerp(a.fog[j], b.fog[j], t);
    out.den = lerp(a.den, b.den, t);
    out.amb = lerp(a.amb, b.amb, t);
    out.sun = lerp(a.sun, b.sun, t);
    return out;
  }

  update(dt, camera, depth) {
    const e = (this._env = this.envAt(Math.max(0, depth), this._env || {}));
    this._envColor.setRGB(e.fog[0], e.fog[1], e.fog[2]);
    this.scene.fog.color.copy(this._envColor);
    this.scene.fog.density = e.den;
    this.scene.background.copy(this._envColor);
    this.hemi.intensity = 0.1 + 0.9 * e.amb;
    this.sun.intensity = 1.7 * e.sun;
    SHARED.uSun.value = e.sun;
    this.surfaceMat.uniforms.uFogColor.value.copy(this._envColor);
    this.surfaceMat.uniforms.uDen.value = e.den;
    this.surface.position.x = camera.position.x;
    this.surface.position.z = camera.position.z;
  }
}

export function makeGlowTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
