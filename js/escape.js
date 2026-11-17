// 탈출 구간: 크레이터 안의 암반 게이트(구멍이 뚫린 암반층)와 입구를 막는 붕괴 암석
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeRockMaterial } from './materials.js';
import { makeGlowTexture } from './world.js';
import { mulberry32, noise2, clamp, lerp } from './utils.js';

function makeBoulderGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.30 * (noise2(x * 1.6 + seed * 7, y * 1.6 + z * 1.2) - 0.5) + 0.16 * (noise2(x * 4.0, z * 4.0 + y * 3.0 + seed) - 0.5);
    p.setXYZ(i, x * n, y * n * 0.86, z * n);
  }
  g.computeVertexNormals();
  return g;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export class EscapeCourse {
  constructor(scene, world) {
    this.world = world;
    this.cx = 0;
    this.cz = -CFG.BASIN_D;
    this.floor = world.floorY(this.cz);
    this.colliders = [];     // {x,y,z,r,on}
    this.holes = [];         // {x,y,z}
    this.collapsed = false;
    this.collapseT = 0;
    this.glowTex = makeGlowTexture();
    this.alarm = 0;

    const rand = mulberry32(90210);
    const mat = makeRockMaterial({ color: 0xb8c0c8, roughness: 0.95, bump: 1.1 });
    const geoms = [makeBoulderGeometry(1), makeBoulderGeometry(2)];
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // ----- 게이트 -----
    const N = CFG.GATE_COUNT;
    const spacing = 21;
    const R = CFG.CRATER_R + 8;
    const items = [];
    for (let i = 0; i < N; i++) {
      const y = this.floor + CFG.GATE_FIRST + i * CFG.GATE_GAP;
      const a = Math.PI / 2 + i * 1.15;
      const rr = 34 + 12 * Math.sin(i * 1.3);
      const hx = this.cx + Math.cos(a) * rr;
      const hz = this.cz + Math.sin(a) * rr;
      this.holes.push({ x: hx, y, z: hz });
      const rowH = spacing * 0.866;
      for (let row = -Math.ceil(R / rowH); row <= Math.ceil(R / rowH); row++) {
        for (let col = -Math.ceil(R / spacing); col <= Math.ceil(R / spacing); col++) {
          const bx = this.cx + col * spacing + (row & 1 ? spacing / 2 : 0) + (rand() - 0.5) * 3;
          const bz = this.cz + row * rowH + (rand() - 0.5) * 3;
          if (Math.hypot(bx - this.cx, bz - this.cz) > R) continue;
          const r = 12 + rand() * 3;
          if (Math.hypot(bx - hx, bz - hz) < CFG.GATE_HOLE + r * 0.88 + 0.5) continue;
          items.push({ x: bx, y: y + (rand() - 0.5) * 5, z: bz, r });
        }
      }
    }
    const half = Math.ceil(items.length / 2);
    const meshes = geoms.map((g, k) => new THREE.InstancedMesh(g, mat, k === 0 ? half : items.length - half));
    items.forEach((it, idx) => {
      const k = idx < half ? 0 : 1;
      const m = meshes[k];
      const j = k === 0 ? idx : idx - half;
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(rand() * 6, rand() * 6, rand() * 6);
      dummy.scale.setScalar(it.r);
      dummy.updateMatrix();
      m.setMatrixAt(j, dummy.matrix);
      const t = 0.7 + rand() * 0.5;
      color.setRGB(0.40 * t, 0.43 * t, 0.48 * t);
      m.setColorAt(j, color);
      this.colliders.push({ x: it.x, y: it.y, z: it.z, r: it.r * 0.86, on: true });
    });
    meshes.forEach(m => { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; scene.add(m); });

    // 구멍 가장자리 발광체 + 중앙 글로우
    this.rimMat = new THREE.MeshBasicMaterial({ color: 0x66f0ff });
    const rimG = new THREE.SphereGeometry(0.7, 8, 6);
    const rim = new THREE.InstancedMesh(rimG, this.rimMat, N * 12);
    let k = 0;
    this.glows = [];
    for (const h of this.holes) {
      for (let j = 0; j < 12; j++) {
        const t = (j / 12) * Math.PI * 2;
        dummy.position.set(h.x + Math.cos(t) * (CFG.GATE_HOLE + 1.5), h.y + (rand() - 0.5) * 6, h.z + Math.sin(t) * (CFG.GATE_HOLE + 1.5));
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.8 + rand() * 0.9);
        dummy.updateMatrix(); rim.setMatrixAt(k++, dummy.matrix);
      }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x66f0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
      sp.position.set(h.x, h.y, h.z);
      sp.scale.setScalar(48);
      scene.add(sp);
      this.glows.push(sp);
    }
    rim.frustumCulled = false;
    scene.add(rim);

    // ----- 입구 막는 암석(붕괴 시 벽에서 밀려 나온다) -----
    const zp = this.cz + 150;
    const cxp = world.pathX(zp);
    this.plugGeom = makeBoulderGeometry(3);
    this.plugItems = [];
    const top = -6;
    const cols = 13;
    for (let c = 0; c < cols; c++) {
      for (let y = this.floor - 6, row = 0; y < top; y += 15, row++) {
        for (let rowZ = 0; rowZ < 2; rowZ++) {
          const fx = cxp + (c - (cols - 1) / 2) * 17 + (rand() - 0.5) * 3 + (rowZ ? 8 : 0);
          const side = fx - cxp < 0 ? -1 : 1;
          const r = 11 + rand() * 3;
          this.plugItems.push({
            fx, fy: y + (rand() - 0.5) * 3, fz: zp + rowZ * 12 + (rand() - 0.5) * 3,
            sx: fx + side * 150, delay: rand() * 2.4, r,
            rx: rand() * 6, ry: rand() * 6, rz: rand() * 6,
            col: { x: fx, y: y, z: zp, r: r * 0.86, on: false },
          });
        }
      }
    }
    this.plug = new THREE.InstancedMesh(this.plugGeom, mat, this.plugItems.length);
    this.plugItems.forEach((it, i) => {
      const t = 0.7 + rand() * 0.5;
      color.setRGB(0.40 * t, 0.43 * t, 0.48 * t);
      this.plug.setColorAt(i, color);
      this.colliders.push(it.col);
    });
    this.plug.frustumCulled = false;
    this.plug.visible = false;
    this.plug.receiveShadow = true;
    scene.add(this.plug);
    this.plugZ = zp;
  }

  collapse() {
    if (this.collapsed) return;
    this.collapsed = true; this.collapseT = 0;
    this.plug.visible = true;
    this.rimMat.color.setRGB(1, 0.25, 0.15);
    this.glows.forEach(g => g.material.color.setRGB(1, 0.25, 0.15));
  }

  update(dt, time) {
    const d = new THREE.Object3D();
    if (this.collapsed && this.collapseT < 5) {
      this.collapseT += dt;
      this.plugItems.forEach((it, i) => {
        const t = clamp((this.collapseT - it.delay) / 1.7, 0, 1);
        const e = easeOut(t);
        const x = lerp(it.sx, it.fx, e);
        d.position.set(x, it.fy, it.fz);
        d.rotation.set(it.rx + t * 2, it.ry, it.rz);
        d.scale.setScalar(it.r);
        d.updateMatrix();
        this.plug.setMatrixAt(i, d.matrix);
        it.col.x = x; it.col.on = t > 0.7;
      });
      this.plug.instanceMatrix.needsUpdate = true;
    }
    // 게이트 글로우 맥동
    const p = 0.6 + 0.4 * Math.sin(time * (this.collapsed ? 6 : 1.6));
    this.glows.forEach((g, i) => { g.material.opacity = (0.28 + 0.3 * p) * (this.collapsed ? 1 : 0.85); });
  }

  // 플레이어에게 가장 가까운 위쪽 구멍 (오토파일럿/힌트용)
  nextHole(y) {
    for (const h of this.holes) if (h.y > y - 6) return h;
    return null;
  }
}
