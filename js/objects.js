// 상호작용 오브젝트: 보급품, 신호원(코어), 조명탄
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeGlowTexture } from './world.js';
import { SHARED, makeRockMaterial } from './materials.js';
import { clamp, lerp, mulberry32 } from './utils.js';

// ================= 보급품 =================
export class Pickups {
  constructor(scene, world) {
    this.glowTex = makeGlowTexture();
    this.items = [];
    const rand = mulberry32(31337);
    const spots = [70, 140, 235, 330, 430, 540, 660, 790, 930, 1070, 1190, 1290, 1380];
    spots.forEach((d, i) => {
      const z = -d;
      const x = world.pathX(z) + (rand() - 0.5) * world.halfWidth(z) * 1.1;
      const y = world.heightAt(x, z) + 1.8;
      const type = i % 2 === 0 ? 'o2' : 'bat';
      const color = type === 'o2' ? 0x4dff9a : 0xffd84a;
      const grp = new THREE.Group();
      const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.2, 4, 10), new THREE.MeshStandardMaterial({ color: 0x222b2e, emissive: color, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.5 }));
      cap.rotation.z = 0.25;
      cap.castShadow = true;
      grp.add(cap);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sp.scale.setScalar(9);
      grp.add(sp);
      grp.position.set(x, y, z);
      scene.add(grp);
      this.items.push({ type, grp, sp, cap, taken: false, phase: rand() * 6 });
    });
  }
  update(dt, time, sub, onPick) {
    for (const it of this.items) {
      if (it.taken) continue;
      it.grp.position.y += Math.sin(time * 1.2 + it.phase) * 0.004;
      it.cap.rotation.y += dt * 0.6;
      const dist = it.grp.position.distanceTo(sub.pos);
      // 멀리서도 희미하게 보이게
      const a = clamp(1.15 - dist / 260, 0.18, 1);
      it.sp.material.opacity = a * (0.7 + 0.3 * Math.sin(time * 2 + it.phase));
      if (dist < 5.2) {
        it.taken = true;
        it.grp.visible = false;
        onPick(it.type);
      }
    }
  }
}

// ================= 신호원(코어) =================
export class Beacon {
  constructor(scene, world) {
    this.world = world;
    this.glowTex = makeGlowTexture();
    const z = -CFG.BASIN_D;
    const x = 0;
    const y = world.heightAt(x, z);
    this.base = new THREE.Vector3(x, y, z);
    this.taken = false;
    this.group = new THREE.Group();
    this.group.position.copy(this.base);
    scene.add(this.group);

    const stone = makeRockMaterial({ color: 0x20282c, roughness: 0.55, bump: 0.15, detail: 0.3 });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 2.4, 8), stone);
    ped.position.y = 1.2; ped.castShadow = true; ped.receiveShadow = true;
    this.group.add(ped);
    // 고리 구조물
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(5 + i * 1.9, 0.18, 8, 64), new THREE.MeshBasicMaterial({ color: 0x66f2ff }));
      ring.position.y = 6.5 + i * 0.6;
      ring.rotation.x = Math.PI / 2 + (i - 1) * 0.35;
      this.group.add(ring);
      this.rings.push(ring);
    }
    // 기둥 8개
    this.pylons = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const h = 14 + (i % 2) * 8;
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.8, h, 1.8), stone);
      p.position.set(Math.cos(a) * 15, h / 2 - 1, Math.sin(a) * 15);
      p.rotation.y = a;
      p.castShadow = true; p.receiveShadow = true;
      this.group.add(p);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, h * 0.9, 0.12), new THREE.MeshBasicMaterial({ color: 0x55e8ff }));
      strip.position.set(Math.cos(a) * 14.0, h / 2 - 1, Math.sin(a) * 14.0);
      this.group.add(strip);
      this.pylons.push(strip);
    }
    // 코어 구체
    this.orbMat = new THREE.MeshBasicMaterial({ color: 0xcffaff });
    this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 2), this.orbMat);
    this.orb.position.y = 6.6;
    this.group.add(this.orb);
    this.orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x66f0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.orbGlow.scale.setScalar(26);
    this.orb.add(this.orbGlow);
    this.light = new THREE.PointLight(0x66f0ff, 1400, 130, 1.5);
    this.light.position.y = 8;
    this.group.add(this.light);

    // 수면까지 뻗는 신호 광주(부드러운 원통형 빛, 안개 무시, 지형에 가려짐)
    const H = 520;
    const bg = new THREE.CylinderGeometry(7, 13, H, 40, 1, true);
    bg.translate(0, H / 2, 0);
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: {
        uTime: SHARED.uTime, uColor: { value: new THREE.Color(0.30, 0.85, 1.0) }, uPow: { value: 1 }, uH: { value: H },
        uAxis: { value: new THREE.Vector2(x, z) },
      },
      vertexShader: /* glsl */`varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        varying float vY; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform vec3 uColor; uniform float uPow; uniform float uH; uniform vec2 uAxis;
        void main(){
          float fr = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
          float t = vY / uH;
          float band = 0.5 + 0.5 * sin((t * 5.0 - uTime * 0.25) * 6.2831);
          float a = fr * (0.07 + 0.10 * band) * (1.0 - t * 0.6) * uPow;
          float camAxis = length(cameraPosition.xz - uAxis);
          a *= mix(0.25, 1.0, smoothstep(12.0, 70.0, camAxis));
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    this.beam = new THREE.Mesh(bg, this.beamMat);
    this.beam.renderOrder = 6;
    this.group.add(this.beam);
    this.beam.position.y = 6.6;
  }

  worldPos(out) { return out.copy(this.base).add(new THREE.Vector3(0, 6.6, 0)); }

  update(dt, time, sub, onTake) {
    const pulse = 0.85 + 0.15 * Math.sin(time * 2.1);
    if (!this.taken) {
      this.orb.rotation.y += dt * 0.7; this.orb.rotation.x += dt * 0.4;
      this.orb.scale.setScalar(1 + 0.06 * Math.sin(time * 2.1));
      this.rings.forEach((r, i) => { r.rotation.z += dt * (0.25 + i * 0.12) * (i % 2 ? -1 : 1); });
      this.light.intensity = 1400 * pulse;
      this.beamMat.uniforms.uPow.value = pulse;
      const p = this.worldPos(new THREE.Vector3());
      if (p.distanceTo(sub.pos) < 7) {
        this.taken = true;
        this.orb.visible = false;
        onTake();
      }
    } else {
      // 코어를 가져간 뒤: 붉게 경고
      this.takenT = (this.takenT || 0) + dt;
      const k = clamp(this.takenT / 2.5, 0, 1);
      this.light.color.setRGB(lerp(0.4, 1, k), lerp(0.94, 0.2, k), lerp(1, 0.12, k));
      this.light.intensity = (900 + 500 * Math.sin(time * 6)) * (1 - 0.4 * k);
      this.beamMat.uniforms.uColor.value.setRGB(lerp(0.35, 1, k), lerp(0.9, 0.18, k), lerp(1, 0.1, k));
      this.beamMat.uniforms.uPow.value = 0.6 + 0.4 * Math.sin(time * 6);
      this.rings.forEach(r => r.material.color.setRGB(1, 0.25, 0.15));
      this.pylons.forEach(p => p.material.color.setRGB(1, 0.3, 0.18));
      this.orbGlow.material.opacity = 0;
    }
  }
}

// ================= 조명탄 =================
export class Flares {
  constructor(scene) {
    this.glowTex = makeGlowTexture();
    this.list = [];
    this.lights = [0, 1].map(() => {
      const l = new THREE.PointLight(0xff7a3a, 0, 60, 1.6);
      scene.add(l); return l;
    });
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff6a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.setScalar(10); sp.visible = false;
      scene.add(sp);
      this.list.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), alive: false, life: 0, sp });
    }
  }
  fire(sub) {
    const f = this.list.find(x => !x.alive);
    if (!f) return false;
    f.alive = true; f.life = 24;
    f.pos.copy(sub.pos).addScaledVector(sub.forward, 4);
    f.vel.copy(sub.vel).addScaledVector(sub.forward, 9);
    f.sp.visible = true;
    return true;
  }
  update(dt, time, world) {
    let li = 0;
    for (const f of this.list) {
      if (!f.alive) continue;
      f.life -= dt;
      f.vel.multiplyScalar(Math.exp(-dt * 0.9));
      f.vel.y -= 0.5 * dt;
      f.pos.addScaledVector(f.vel, dt);
      const gy = world.heightAt(f.pos.x, f.pos.z) + 0.6;
      if (f.pos.y < gy) { f.pos.y = gy; f.vel.set(0, 0, 0); }
      f.sp.position.copy(f.pos);
      const flick = 0.75 + 0.25 * Math.sin(time * 31 + f.life * 5) * Math.sin(time * 13);
      const fade = clamp(f.life / 4, 0, 1);
      f.sp.material.opacity = flick * fade;
      f.sp.scale.setScalar(9 + 3 * flick);
      if (li < this.lights.length) {
        this.lights[li].position.copy(f.pos);
        this.lights[li].intensity = 520 * flick * fade;
        li++;
      }
      if (f.life <= 0) { f.alive = false; f.sp.visible = false; }
    }
    for (; li < this.lights.length; li++) this.lights[li].intensity = 0;
  }
}
