// 해양설(Marine Snow) — 조명 콘 안에서 반짝이는 부유물, 발광 플랑크톤
import * as THREE from 'three';
import { SHARED } from './materials.js';
import { mulberry32 } from './utils.js';

export class MarineSnow {
  constructor(scene, count = 3200) {
    const rand = mulberry32(42);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand(); pos[i * 3 + 1] = rand(); pos[i * 3 + 2] = rand();
      seed[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: SHARED.uTime,
        uCam: { value: new THREE.Vector3() },
        uLampPos: { value: new THREE.Vector3() },
        uLampDir: { value: new THREE.Vector3(0, 0, -1) },
        uLamp: { value: 1 },
        uBox: { value: new THREE.Vector3(90, 50, 90) },
        uAmbient: { value: 0.3 },
        uFog: { value: new THREE.Color() },
        uDen: { value: 0.01 },
      },
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uLampPos; uniform vec3 uLampDir;
        uniform float uLamp; uniform float uAmbient; uniform float uDen;
        varying float vA;
        void main(){
          vec3 base = position * uBox;
          base += vec3(sin(uTime * 0.15 + aSeed * 40.0) * 1.2, -uTime * (0.25 + aSeed * 0.3), cos(uTime * 0.12 + aSeed * 20.0) * 1.2);
          vec3 p = mod(base - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
          vec3 toP = p - uLampPos;
          float along = dot(toP, uLampDir);
          float radial = length(toP - uLampDir * along);
          float cone = smoothstep(0.52, 0.05, radial / max(along, 0.001) * 1.0) * step(1.0, along) * smoothstep(80.0, 20.0, along);
          float edgeFade = 1.0 - smoothstep(0.38, 0.5, length((p - uCam) / uBox));
          float tw = 0.6 + 0.4 * sin(uTime * 2.0 + aSeed * 90.0);
          float dist = distance(p, uCam);
          float fogF = exp(-pow(dist * uDen * 0.8, 2.0));
          vA = (uAmbient * 0.35 + cone * uLamp * 1.5) * edgeFade * tw * fogF;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp((0.9 + aSeed * 1.6) * 90.0 / max(1.0, -mv.z), 1.0, 7.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying float vA; uniform vec3 uFog;
        void main(){
          vec2 c = gl_PointCoord - 0.5; float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          vec3 col = mix(vec3(0.75, 0.95, 1.0), vec3(1.0), 0.5);
          gl_FragColor = vec4(col * a * vA, a * vA);
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(camera, sub, env, scene) {
    const u = this.mat.uniforms;
    u.uCam.value.copy(camera.position);
    u.uLampPos.value.copy(sub.lamp.getWorldPosition(this._tmp || (this._tmp = new THREE.Vector3())));
    u.uLampDir.value.set(0, 0, -1).applyQuaternion(sub.group.quaternion);
    u.uLamp.value = sub.lampLevel;
    u.uAmbient.value = 0.25 + 0.35 * (1 - env.sun);
    u.uDen.value = scene.fog.density;
  }
}

// 고정 위치의 발광 플랑크톤 구름 (열수구/깊은 곳)
export class GlowMotes {
  constructor(scene, world, count = 1800) {
    const rand = mulberry32(8123);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const palette = [[0.2, 0.9, 1.0], [0.6, 0.4, 1.0], [1.0, 0.5, 0.85], [0.3, 1.0, 0.7]];
    const clusters = 70;
    let k = 0;
    for (let c = 0; c < clusters; c++) {
      const d = 120 + rand() * 1320;
      const z = -d;
      const cx = world.pathX(z) + (rand() - 0.5) * world.halfWidth(z) * 1.6;
      const cy = world.heightAt(cx, z) + 4 + rand() * 24;
      const pal = palette[Math.floor(rand() * palette.length)];
      const per = Math.floor(count / clusters);
      for (let i = 0; i < per && k < count; i++, k++) {
        const r = Math.pow(rand(), 0.6) * 14;
        const th = rand() * 6.283, ph = Math.acos(2 * rand() - 1);
        pos[k * 3] = cx + r * Math.sin(ph) * Math.cos(th);
        pos[k * 3 + 1] = cy + r * Math.cos(ph) * 0.7;
        pos[k * 3 + 2] = z + r * Math.sin(ph) * Math.sin(th);
        col[k * 3] = pal[0]; col[k * 3 + 1] = pal[1]; col[k * 3 + 2] = pal[2];
        seed[k] = rand();
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: SHARED.uTime, uDen: { value: 0.02 } },
      vertexShader: /* glsl */`
        attribute vec3 aCol; attribute float aSeed; uniform float uTime; uniform float uDen;
        varying vec3 vC; varying float vA;
        void main(){
          vec3 p = position + vec3(sin(uTime * 0.3 + aSeed * 30.0), cos(uTime * 0.25 + aSeed * 20.0) * 0.6, sin(uTime * 0.2 + aSeed * 50.0)) * 0.9;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float dist = -mv.z;
          vA = (0.5 + 0.5 * sin(uTime * (0.8 + aSeed * 2.0) + aSeed * 60.0)) * exp(-pow(dist * uDen * 0.45, 2.0));
          vC = aCol;
          gl_PointSize = clamp(60.0 / max(1.0, dist) * (0.8 + aSeed), 1.0, 9.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vC; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(vC * a * vA * 1.7, a * vA); }`,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(scene) { this.mat.uniforms.uDen.value = scene.fog.density; }
}
