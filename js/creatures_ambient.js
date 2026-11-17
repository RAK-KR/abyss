// 평화로운 생물: 해파리(GPU 인스턴싱), 물고기 떼
import * as THREE from 'three';
import { SHARED, makeRockMaterial } from './materials.js';
import { mulberry32, clamp, smoothstep } from './utils.js';

const JELLY_COMMON = /* glsl */`
uniform float uTime; uniform vec3 uSub; uniform float uDen;
vec3 drift(vec3 o, float ph){
  return o + vec3(sin(uTime * 0.11 + ph * 7.0) * 4.0, sin(uTime * 0.17 + ph * 5.0) * 3.0, cos(uTime * 0.09 + ph * 3.0) * 4.0);
}
`;

export class Jellyfish {
  constructor(scene, world, count = 110) {
    const rand = mulberry32(2024);
    const offs = new Float32Array(count * 3);
    const scl = new Float32Array(count);
    const ph = new Float32Array(count);
    const col = new Float32Array(count * 3);
    const palettes = [[0.25, 0.85, 1.0], [0.55, 0.45, 1.0], [1.0, 0.45, 0.8], [0.4, 1.0, 0.75], [1.0, 0.7, 0.35]];
    for (let i = 0; i < count; i++) {
      const d = 50 + rand() * 1420;
      const z = -d;
      const x = world.pathX(z) + (rand() - 0.5) * world.halfWidth(z) * 1.9;
      const floor = world.heightAt(x, z);
      const y = floor + 6 + rand() * 55;
      offs[i * 3] = x; offs[i * 3 + 1] = Math.min(y, -14); offs[i * 3 + 2] = z;
      scl[i] = (0.8 + rand() * 1.8) * (rand() < 0.07 ? 3.2 : 1);
      ph[i] = rand();
      const c = palettes[Math.floor(rand() * palettes.length)];
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }

    const sharedU = {
      uTime: SHARED.uTime,
      uSub: { value: new THREE.Vector3() },
      uDen: { value: 0.02 },
    };

    // 갓
    const bell = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const bg = new THREE.InstancedBufferGeometry();
    bg.index = bell.index;
    bg.setAttribute('position', bell.attributes.position);
    bg.setAttribute('normal', bell.attributes.normal);
    bg.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 3));
    bg.setAttribute('aScale', new THREE.InstancedBufferAttribute(scl, 1));
    bg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
    bg.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
    bg.instanceCount = count;
    const bellMat = new THREE.ShaderMaterial({
      uniforms: sharedU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute vec3 aOff; attribute float aScale; attribute float aPhase; attribute vec3 aCol;
        ${JELLY_COMMON}
        varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vDist; varying float vH;
        void main(){
          float pulse = sin(uTime * 1.25 + aPhase * 6.2831);
          vec3 p = position;
          p.xz *= 1.0 + 0.16 * pulse;
          p.y *= 1.0 - 0.14 * pulse;
          vec3 w = drift(aOff, aPhase) + p * aScale;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vN = normalize((viewMatrix * vec4(normalize(position), 0.0)).xyz);
          vV = normalize(-mv.xyz);
          vC = aCol; vH = position.y;
          vDist = length(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uDen; uniform vec3 uSub;
        varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vDist; varying float vH;
        void main(){
          float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          float inner = 0.25 + 0.35 * smoothstep(0.2, 1.0, vH);
          float fogF = exp(-pow(vDist * uDen * 0.42, 2.0));
          float a = (0.10 + rim * 0.75 + inner * 0.25) * fogF;
          gl_FragColor = vec4(vC * (0.35 + rim * 1.3 + inner * 0.8) * a, a);
        }`,
    });
    this.bell = new THREE.Mesh(bg, bellMat);
    this.bell.frustumCulled = false;
    this.bell.renderOrder = 3;
    scene.add(this.bell);

    // 촉수 (인스턴싱 라인)
    const T = 14, S = 9;
    const verts = [];
    const aT = [], aAng = [];
    for (let t = 0; t < T; t++) {
      const ang = (t / T) * Math.PI * 2 + (t % 2) * 0.2;
      for (let s = 0; s < S; s++) {
        for (const k of [s, s + 1]) { verts.push(0, 0, 0); aT.push(k / S); aAng.push(ang); }
      }
    }
    const tg = new THREE.InstancedBufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    tg.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
    tg.setAttribute('aAng', new THREE.Float32BufferAttribute(aAng, 1));
    tg.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 3));
    tg.setAttribute('aScale', new THREE.InstancedBufferAttribute(scl, 1));
    tg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
    tg.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
    tg.instanceCount = count;
    const tentMat = new THREE.ShaderMaterial({
      uniforms: sharedU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aT; attribute float aAng; attribute vec3 aOff; attribute float aScale; attribute float aPhase; attribute vec3 aCol;
        ${JELLY_COMMON}
        varying vec3 vC; varying float vA; varying float vDist;
        void main(){
          float pulse = sin(uTime * 1.25 + aPhase * 6.2831);
          float rad = (0.85 + 0.12 * pulse) * (0.7 + 0.3 * sin(aAng * 3.0 + aPhase * 9.0));
          float len = 3.2 + 2.2 * fract(aAng * 3.17 + aPhase);
          vec3 p = vec3(cos(aAng) * rad, 0.05, sin(aAng) * rad);
          p += vec3(sin(uTime * 0.9 + aT * 6.0 + aAng * 3.0 + aPhase * 6.28) * 0.28 * aT,
                    -aT * len * (1.0 - 0.1 * pulse),
                    cos(uTime * 0.75 + aT * 5.0 + aAng + aPhase * 4.0) * 0.28 * aT);
          vec3 w = drift(aOff, aPhase) + p * aScale;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vC = aCol; vA = (1.0 - aT * 0.75); vDist = length(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uDen; varying vec3 vC; varying float vA; varying float vDist;
        void main(){ float f = exp(-pow(vDist * uDen * 0.42, 2.0)); float a = vA * f * 0.7; gl_FragColor = vec4(vC * a * 1.2, a); }`,
    });
    this.tent = new THREE.LineSegments(tg, tentMat);
    this.tent.frustumCulled = false;
    this.tent.renderOrder = 3;
    scene.add(this.tent);
    this.uniforms = sharedU;
  }
  update(sub, scene) {
    this.uniforms.uSub.value.copy(sub.pos);
    this.uniforms.uDen.value = scene.fog.density;
  }
}

// ---------- 물고기 떼 ----------
function makeFishGeometry() {
  const g = new THREE.SphereGeometry(1, 10, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const tail = Math.max(0, z);
    const taper = 1 - 0.72 * tail;
    x *= taper * 0.8; y *= taper;
    if (z > 0.78) { y *= 2.4; x *= 0.25; }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

export class FishSchools {
  constructor(scene, world, schools = 9, perSchool = 38) {
    this.world = world;
    this.rand = mulberry32(555);
    this.schools = [];
    const total = schools * perSchool;
    this.mesh = new THREE.InstancedMesh(makeFishGeometry(), new THREE.MeshStandardMaterial({ color: 0x9fb8c4, metalness: 0.55, roughness: 0.3 }), total);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    const c = new THREE.Color();
    let k = 0;
    for (let s = 0; s < schools; s++) {
      const d = 60 + s * 95 + this.rand() * 40;
      const z = -d;
      const x = world.pathX(z) + (this.rand() - 0.5) * world.halfWidth(z);
      const y = world.heightAt(x, z) + 12 + this.rand() * 22;
      const fish = [];
      for (let i = 0; i < perSchool; i++) {
        fish.push({
          w1: 0.35 + this.rand() * 0.25, w2: 0.2 + this.rand() * 0.2,
          p1: this.rand() * 6.28, p2: this.rand() * 6.28, p3: this.rand() * 6.28,
          R: 5 + this.rand() * 9, size: 0.45 + this.rand() * 0.35,
        });
        c.setHSL(0.55 + this.rand() * 0.06, 0.25, 0.55 + this.rand() * 0.3);
        this.mesh.setColorAt(k++, c);
      }
      this.schools.push({ center: new THREE.Vector3(x, y, z), home: new THREE.Vector3(x, y, z), fish, flee: new THREE.Vector3() });
    }
    this.dummy = new THREE.Object3D();
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
  }

  fishPos(s, f, t, out) {
    return out.set(
      s.center.x + f.R * Math.sin(t * f.w1 + f.p1),
      s.center.y + f.R * 0.35 * Math.sin(t * f.w2 + f.p2),
      s.center.z + f.R * Math.cos(t * f.w1 * 0.92 + f.p3)
    );
  }

  update(dt, time, sub) {
    let k = 0;
    const d = this.dummy;
    for (const s of this.schools) {
      // 접근하면 흩어져 도망
      const to = this.tmp.copy(s.center).sub(sub.pos);
      const dist = to.length();
      if (dist < 28) { to.normalize().multiplyScalar((28 - dist) * 2.2 * dt); s.center.add(to); }
      s.center.lerp(s.home, 1 - Math.exp(-dt * 0.15));
      for (const f of s.fish) {
        this.fishPos(s, f, time, this.tmp);
        this.fishPos(s, f, time + 0.12, this.tmp2);
        d.position.copy(this.tmp);
        const dirv = this.tmp2.sub(this.tmp);
        d.lookAt(this.tmp.x - dirv.x, this.tmp.y - dirv.y, this.tmp.z - dirv.z); // 머리가 -Z... 꼬리가 +Z라 진행방향 반대로 바라보게
        d.rotateZ(Math.sin(time * 9 + f.p1 * 5) * 0.25);
        d.scale.set(f.size * 0.38, f.size * 0.38, f.size * 1.55);
        d.updateMatrix();
        this.mesh.setMatrixAt(k++, d.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
