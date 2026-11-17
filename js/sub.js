// 잠수정: 모델, 물리, 조명, 볼륨 라이트 콘, 기포
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, lerp } from './utils.js';
import { makeGlowTexture } from './world.js';

const FWD = new THREE.Vector3(0, 0, -1);
const RIGHT = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

export class Sub {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.pos = new THREE.Vector3(0, -9, 14);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.yawT = 0; this.pitchT = 0;
    this.speed = 0;
    this.quat = new THREE.Quaternion();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.lampOn = true;
    this.lampLevel = 1;
    this.prop = 0;
    this.boosting = false;
    this.glowTex = makeGlowTexture();

    this.buildModel();
    this.buildLamp();
    this.buildBubbles();
    this.syncTransform();
  }

  buildModel() {
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xd8dedf, metalness: 0.12, roughness: 0.42 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xee6a18, metalness: 0.3, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b2226, metalness: 0.4, roughness: 0.55 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a2830, metalness: 0.0, roughness: 0.04, transparent: true, opacity: 0.62, clearcoat: 1, emissive: 0x0b3a44, emissiveIntensity: 0.9 });

    // 선체 (Lathe)
    const prof = new THREE.SplineCurve([
      new THREE.Vector2(0.01, -3.3), new THREE.Vector2(0.5, -3.2), new THREE.Vector2(1.0, -2.7), new THREE.Vector2(1.35, -1.8),
      new THREE.Vector2(1.5, -0.4), new THREE.Vector2(1.5, 1.0), new THREE.Vector2(1.4, 2.0), new THREE.Vector2(1.1, 2.8),
      new THREE.Vector2(0.6, 3.2), new THREE.Vector2(0.01, 3.35),
    ]).getPoints(48);
    const hullG = new THREE.LatheGeometry(prof, 40);
    hullG.rotateX(-Math.PI / 2);
    const hull = new THREE.Mesh(hullG, hullMat);
    hull.castShadow = true; hull.receiveShadow = true;
    this.group.add(hull);

    // 오렌지 띠
    for (const z of [-0.9, 0.5]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.52, 0.22, 40, 1, true), accent);
      b.rotation.x = Math.PI / 2; b.position.z = z;
      this.group.add(b);
    }
    // 조종석 돔
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), glass);
    dome.scale.set(1.0, 0.72, 1.55);
    dome.position.set(0, 0.62, -1.7);
    this.group.add(dome);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.045, 8, 32), dark);
    frame.scale.set(1, 1, 1);
    frame.rotation.y = Math.PI / 2; frame.position.set(0, 0.62, -1.7);
    frame.scale.set(1.55, 0.72, 1);
    this.group.add(frame);

    // 꼬리 지느러미
    const finH = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 1.05), accent);
    finH.position.set(0, 0, 2.5);
    const finV = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 1.05), accent);
    finV.position.set(0, 0, 2.5);
    this.group.add(finH, finV);

    // 측면 추진기
    this.props = [];
    for (const s of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.6, 16), dark);
      pod.rotation.x = Math.PI / 2; pod.position.set(s * 1.75, -0.2, 1.2);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), dark);
      strut.position.set(s * 1.3, -0.2, 1.2);
      const pg = new THREE.Group();
      pg.position.set(s * 1.75, -0.2, 2.05);
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.02), dark);
        blade.rotation.z = (i / 3) * Math.PI * 2;
        blade.position.set(0, 0, 0);
        const holder = new THREE.Group(); holder.rotation.z = (i / 3) * Math.PI * 2; blade.rotation.z = 0; blade.position.y = 0.3; holder.add(blade);
        pg.add(holder);
      }
      this.group.add(pod, strut, pg);
      this.props.push(pg);
    }
    // 후미 프로펠러
    const rp = new THREE.Group(); rp.position.set(0, 0, 3.45);
    for (let i = 0; i < 4; i++) {
      const holder = new THREE.Group(); holder.rotation.z = (i / 4) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.03), dark);
      blade.position.y = 0.5; blade.rotation.y = 0.5; holder.add(blade); rp.add(holder);
    }
    this.group.add(rp); this.props.push(rp);

    // 하부 스키드
    for (const s of [-1, 1]) {
      const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 8), dark);
      sk.rotation.x = Math.PI / 2; sk.position.set(s * 0.8, -1.45, 0);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), dark);
      st.position.set(s * 0.8, -1.2, -1.0);
      const st2 = st.clone(); st2.position.z = 1.0;
      this.group.add(sk, st, st2);
    }
    // 램프 하우징 + 발광면
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xeaffff });
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.4, 16), dark);
      h.rotation.x = Math.PI / 2; h.position.set(s * 0.85, -0.45, -2.75);
      const f = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), this.lampMat);
      f.position.set(s * 0.85, -0.45, -2.96);
      this.group.add(h, f);
    }
    // ---- 디테일: 매니퓰레이터 암, 샘플 바구니, 카메라 포드, 안테나, 밸러스트 탱크, 측면 패널 ----
    const steel = new THREE.MeshStandardMaterial({ color: 0x8e979b, metalness: 0.3, roughness: 0.5 });
    const armBase = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), dark);
    armBase.position.set(0.62, -1.18, -1.7);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.2, 8), steel);
    upper.position.set(0.62, -1.32, -2.25); upper.rotation.x = Math.PI / 2 - 0.35;
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), dark);
    elbow.position.set(0.62, -1.5, -2.85);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 8), steel);
    fore.position.set(0.62, -1.38, -3.35); fore.rotation.x = Math.PI / 2 + 0.25;
    this.group.add(armBase, upper, elbow, fore);
    for (const s of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.5), steel);
      claw.position.set(0.62 + s * 0.1, -1.25, -3.85); claw.rotation.y = s * 0.3;
      this.group.add(claw);
    }
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 1.0), dark);
    basket.position.set(-0.62, -1.45, -1.9);
    this.group.add(basket);
    for (const [px, pz] of [[-1.1, -2.35], [-0.12, -2.35], [-1.1, -1.45], [-0.12, -1.45]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), steel);
      post.position.set(px, -1.2, pz); this.group.add(post);
    }
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.55, 16), dark);
    pod.rotation.x = Math.PI / 2; pod.position.set(0, 1.42, -0.5);
    const podLens = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: 0x1b4a58 }));
    podLens.position.set(0, 1.42, -0.79);
    this.group.add(pod, podLens);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.7, 6), steel);
    ant.position.set(0.55, 2.0, 1.5);
    this.antTip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a40 }));
    this.antTip.position.set(0.55, 2.9, 1.5);
    this.group.add(ant, this.antTip);
    for (const s of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.6, 12), accent);
      tank.rotation.x = Math.PI / 2; tank.position.set(s * 1.12, -1.1, 0.9);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 1.9), steel);
      plate.position.set(s * 1.46, 0.15, 0.55);
      this.group.add(tank, plate);
      for (let i = 0; i < 4; i++) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 6), dark);
        bolt.rotation.z = Math.PI / 2; bolt.position.set(s * 1.54, 0.15 + (i % 2 ? 0.22 : -0.22), 0.0 + Math.floor(i / 2) * 1.1);
        this.group.add(bolt);
      }
    }

    // 항법등
    this.navRed = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff2a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.navRed.scale.setScalar(1.3); this.navRed.position.set(0, 1.5, 0.2);
    const navG = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x30ff90, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    navG.scale.setScalar(0.7); navG.position.set(1.95, 0.0, 2.3);
    const navP = navG.clone(); navP.material = navG.material.clone(); navP.material.color.set(0xff3050); navP.position.x = -1.95;
    this.group.add(this.navRed, navG, navP);
  }

  buildLamp() {
    const L = new THREE.SpotLight(0xdff8ff, 1900, 120, 0.5, 0.78, 1.5);
    L.position.set(0, -0.45, -2.9);
    L.castShadow = true;
    L.shadow.mapSize.set(1536, 1536);
    L.shadow.camera.near = 1.5; L.shadow.camera.far = 120;
    L.shadow.bias = -0.0004; L.shadow.normalBias = 0.35;
    this.lamp = L;
    // 선체 가시성을 위한 약한 보조광(실내등 느낌)
    this.fill = new THREE.PointLight(0x8fd0e4, 55, 16, 2);
    this.fill.position.set(0, 3.2, 5.5);
    this.group.add(this.fill);
    this.lampTarget = new THREE.Object3D();
    this.lampTarget.position.set(0, -2.5, -40);
    this.group.add(L, this.lampTarget);
    L.target = this.lampTarget;

    // 볼륨 라이트 콘
    const H = 78, R = 36;
    const g = new THREE.ConeGeometry(R, H, 56, 1, true);
    g.translate(0, -H / 2, 0);
    g.rotateX(Math.PI / 2);
    this.coneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uLevel: { value: 1 }, uTime: { value: 0 }, uH: { value: H }, uColor: { value: new THREE.Color(0.55, 0.9, 1.0) } },
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){
          vP = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        uniform float uLevel; uniform float uTime; uniform float uH; uniform vec3 uColor;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          float along = clamp(-vP.z / uH, 0.0, 1.0);
          float fr = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
          float ang = atan(vP.x, vP.y);
          float streak = 0.75 + 0.25 * sin(ang * 9.0 + uTime * 0.6 + along * 4.0) * sin(ang * 5.0 - uTime * 0.4);
          float a = fr * pow(1.0 - along, 1.7) * streak * uLevel * 0.24;
          a *= smoothstep(0.0, 0.16, along);
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    this.cone = new THREE.Mesh(g, this.coneMat);
    this.cone.position.set(0, -0.45, -2.9);
    this.cone.rotation.x = -0.035;
    this.cone.renderOrder = 5;
    this.group.add(this.cone);

    // 램프 앞 글로우
    this.lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xcfffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.lampGlow.scale.setScalar(3.0);
    this.lampGlow.position.set(0, -0.45, -3.2);
    this.group.add(this.lampGlow);
  }

  buildBubbles() {
    this.nB = 110;
    const pos = new Float32Array(this.nB * 3);
    const alpha = new Float32Array(this.nB);
    this.bData = [];
    for (let i = 0; i < this.nB; i++) { this.bData.push({ life: 0, vx: 0, vy: 0, vz: 0 }); pos[i * 3 + 1] = -9999; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    this.bubbles = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aAlpha; varying float vA;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 110.0 / max(1.0, -mv.z) * (0.5 + aAlpha); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
          float ring = smoothstep(0.5, 0.38, d) * (0.35 + 0.65 * smoothstep(0.25, 0.46, d));
          gl_FragColor = vec4(vec3(0.7, 0.95, 1.0) * ring * vA, ring * vA); }`,
    }));
    this.bubbles.frustumCulled = false;
    this.scene.add(this.bubbles);
    this.bCursor = 0;
  }

  spawnBubble(rate) {
    const b = this.bData[this.bCursor];
    const i = this.bCursor;
    this.bCursor = (this.bCursor + 1) % this.nB;
    const back = new THREE.Vector3(0, 0, 3.7).applyQuaternion(this.quat).add(this.pos);
    const p = this.bubbles.geometry.attributes.position;
    p.setXYZ(i, back.x + (Math.random() - 0.5) * 0.6, back.y + (Math.random() - 0.5) * 0.6, back.z + (Math.random() - 0.5) * 0.6);
    b.life = 1.2 + Math.random() * 1.4;
    b.vx = (Math.random() - 0.5) * 0.7; b.vy = 0.8 + Math.random() * 1.3; b.vz = (Math.random() - 0.5) * 0.7;
  }

  updateBubbles(dt, thrustAmt) {
    const p = this.bubbles.geometry.attributes.position;
    const a = this.bubbles.geometry.attributes.aAlpha;
    this._bAcc = (this._bAcc || 0) + dt * (4 + thrustAmt * 60);
    while (this._bAcc > 1) { this._bAcc -= 1; this.spawnBubble(); }
    for (let i = 0; i < this.nB; i++) {
      const b = this.bData[i];
      if (b.life > 0) {
        b.life -= dt;
        p.setXYZ(i, p.getX(i) + b.vx * dt, p.getY(i) + b.vy * dt, p.getZ(i) + b.vz * dt);
        a.setX(i, clamp(b.life, 0, 1) * 0.6);
      } else a.setX(i, 0);
    }
    p.needsUpdate = true; a.needsUpdate = true;
  }

  syncTransform() {
    const e = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    this.quat.setFromEuler(e);
    this.group.position.copy(this.pos);
    this.group.quaternion.copy(this.quat);
    this.forward.copy(FWD).applyQuaternion(this.quat);
  }

  // 마우스 조향
  steer(dx, dy, sens = 0.0022) {
    this.yawT -= dx * sens;
    this.pitchT = clamp(this.pitchT - dy * sens, -1.25, 1.25);
  }

  update(dt, input, world, battery, time) {
    // 방향 보간
    this.yaw = lerp(this.yaw, this.yawT, 1 - Math.exp(-dt * 14));
    this.pitch = lerp(this.pitch, this.pitchT, 1 - Math.exp(-dt * 14));
    const yawRate = (this.yawT - this.yaw) * 0.5;
    this.roll = lerp(this.roll, clamp(yawRate * 1.2 - input.strafe * 0.12, -0.5, 0.5), 1 - Math.exp(-dt * 4));
    this.quat.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    const fwd = FWD.clone().applyQuaternion(this.quat);
    const right = RIGHT.clone().applyQuaternion(this.quat);
    const boosting = input.boost && battery > 0 && input.thrust > 0;
    this.boosting = boosting;
    const mult = boosting ? CFG.BOOST_MULT : 1;
    const hasPower = battery > 0 ? 1 : 0.25;

    const acc = new THREE.Vector3();
    acc.addScaledVector(fwd, input.thrust * CFG.THRUST * mult * (input.thrust < 0 ? 0.55 : 1));
    acc.addScaledVector(right, input.strafe * CFG.STRAFE);
    acc.addScaledVector(UP, input.vert * CFG.VERT * (boosting ? 1.3 : 1));
    acc.multiplyScalar(hasPower);
    this.vel.addScaledVector(acc, dt);
    this.vel.multiplyScalar(Math.exp(-dt * CFG.DRAG));
    this.vel.addScaledVector(UP, -0.12 * dt); // 아주 약한 침강
    this.pos.addScaledVector(this.vel, dt);

    // 충돌(지형)
    let impact = 0;
    const r = 2.0;
    const samples = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]];
    let gy = -1e9;
    for (const s of samples) gy = Math.max(gy, world.heightAt(this.pos.x + s[0], this.pos.z + s[1]));
    const clearance = 2.0;
    if (this.pos.y < gy + clearance) {
      this.pos.y = gy + clearance;
      const n = world.normalAt(this.pos.x, this.pos.z);
      const vn = this.vel.dot(n);
      if (vn < 0) {
        impact = -vn;
        this.vel.addScaledVector(n, -vn * 1.35);
      }
    }
    // 암반 게이트/붕괴 암석 충돌(구)
    if (this.colliders) {
      const cs = this.colliders;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (!c.on) continue;
        const rr = c.r + 2.1;
        const dy = this.pos.y - c.y; if (dy > rr || dy < -rr) continue;
        const dx = this.pos.x - c.x; if (dx > rr || dx < -rr) continue;
        const dz = this.pos.z - c.z; if (dz > rr || dz < -rr) continue;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.001;
          const nx = dx / d, ny = dy / d, nz = dz / d, pen = rr - d;
          this.pos.x += nx * pen; this.pos.y += ny * pen; this.pos.z += nz * pen;
          const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
          if (vn < 0) {
            impact = Math.max(impact, -vn);
            this.vel.x -= nx * vn * 1.3; this.vel.y -= ny * vn * 1.3; this.vel.z -= nz * vn * 1.3;
          }
        }
      }
    }
    // 월드 경계
    if (Math.abs(this.pos.x) > CFG.X_HALF - 12) { this.pos.x = clamp(this.pos.x, -CFG.X_HALF + 12, CFG.X_HALF - 12); this.vel.x *= -0.3; }
    this.pos.z = clamp(this.pos.z, CFG.Z_MIN + 12, CFG.Z_MAX - 6);
    if (this.pos.y > CFG.SURFACE_Y - 1.8 && !this.canSurface) { this.pos.y = CFG.SURFACE_Y - 1.8; this.vel.y = Math.min(0, this.vel.y); }

    this.speed = this.vel.length();

    // 램프
    const target = this.lampOn && battery > 0 ? 1 : 0;
    let flick = 1;
    if (battery > 0 && battery < 10 && this.lampOn) flick = 0.65 + 0.35 * Math.sin(time * 37) * Math.sin(time * 11);
    this.lampLevel = lerp(this.lampLevel, target * flick, 1 - Math.exp(-dt * (target ? 14 : 6)));
    this.lamp.intensity = 1900 * this.lampLevel;
    this.coneMat.uniforms.uLevel.value = this.lampLevel;
    this.coneMat.uniforms.uTime.value = time;
    this.lampGlow.material.opacity = this.lampLevel * 0.5;
    this.lampMat.color.setScalar(0.15 + 0.85 * this.lampLevel).multiply(new THREE.Color(0.92, 1, 1));

    // 시각 요소
    this.prop += dt * (6 + Math.abs(input.thrust) * 40 * hasPower + this.speed * 1.2);
    for (const p of this.props) p.rotation.z = this.prop;
    this.navRed.material.opacity = (Math.sin(time * 3.2) > 0.6) ? 1 : 0.08;
    this.antTip.material.color.setRGB(Math.sin(time * 2.1) > 0.3 ? 1 : 0.15, 0.2, 0.1);
    this.updateBubbles(dt, Math.abs(input.thrust) * hasPower);

    this.group.position.copy(this.pos);
    this.group.quaternion.copy(this.quat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll));
    this.forward.copy(fwd);
    return { impact };
  }
}
