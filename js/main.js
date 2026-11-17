// ABYSS — 진입점/게임 루프
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, lerp, smoothstep } from './utils.js';
import { SHARED } from './materials.js';
import { Renderer } from './render.js';
import { World } from './world.js';
import { Sub } from './sub.js';
import { MarineSnow, GlowMotes } from './particles.js';
import { Jellyfish, FishSchools } from './creatures_ambient.js';
import { Lurkers, Leviathan } from './creatures_hostile.js';
import { Pickups, Beacon, Flares } from './objects.js';
import { AudioSys } from './audio.js';
import { Story } from './story.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

const R = new Renderer($('view'));
const scene = R.scene, camera = R.camera;
const world = new World(scene);
const sub = new Sub(scene);
const snow = new MarineSnow(scene);
const motes = new GlowMotes(scene, world);
const jelly = new Jellyfish(scene, world);
const fish = new FishSchools(scene, world);
const lurkers = new Lurkers(scene, world);
const pickups = new Pickups(scene, world);
const beacon = new Beacon(scene, world);
const flares = new Flares(scene);
const levi = new Leviathan(scene, world, beacon.base);
const audio = new AudioSys();
const story = new Story($('subtitle'));

const G = {
  state: 'menu',            // menu | play | paused | dead | won
  phase: 'descend',         // descend | escape
  time: 0,
  o2: 100, bat: 100, hull: 100, flareCount: 3,
  hit: 0, panic: 0, shake: 0,
  pingT: 4, alarmT: 0, pinned: false,
};
const keys = {};
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camInit = false;

// ---------- 감도 ----------
let sens = 1.0;
try { const sv = parseFloat(localStorage.getItem('abyss_sens')); if (sv > 0) sens = sv; } catch (e) {}
$('sens').value = sens; $('sensVal').textContent = sens.toFixed(1);
$('sens').addEventListener('input', (e) => {
  sens = parseFloat(e.target.value); $('sensVal').textContent = sens.toFixed(1);
  try { localStorage.setItem('abyss_sens', String(sens)); } catch (err) {}
});

// ---------- 입력 ----------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (G.state !== 'play') return;
  if (e.code === 'KeyF') { sub.lampOn = !sub.lampOn; audio.lampClick(); }
  if (e.code === 'KeyE' && G.flareCount > 0 && flares.fire(sub)) { G.flareCount--; audio.flare(); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('mousemove', (e) => {
  if (G.state !== 'play') return;
  if (document.pointerLockElement === $('view')) sub.steer(e.movementX, e.movementY, 0.0022 * sens);
  else if (e.buttons & 1) sub.steer(e.movementX, e.movementY, 0.0022 * sens);
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== $('view') && G.state === 'play' && !DEBUG) pause();
});

function pause() {
  G.state = 'paused';
  $('menu').classList.remove('hidden');
  $('start').textContent = '재개';
}

function lock() {
  try { const p = $('view').requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 헤드리스 등 */ }
}

// ---------- 시작/재시작 ----------
function resetRun() {
  G.state = 'play'; G.phase = 'descend'; G.time = 0;
  G.o2 = 100; G.bat = 100; G.hull = 100; G.flareCount = 3; G.hit = 0; G.panic = 0; G.shake = 0; G.pingT = 4;
  sub.pos.set(0, -9, 14); sub.vel.set(0, 0, 0);
  sub.yaw = sub.yawT = 0; sub.pitch = 0; sub.pitchT = -0.1; sub.pitch = -0.1; sub.roll = 0;
  sub.lampOn = true; sub.canSurface = false;
  story.reset();
  camInit = false;
  pickups.items.forEach(i => { i.taken = false; i.grp.visible = true; });
  location.hash = '';
}

function startGame() {
  audio.init();
  $('menu').classList.add('hidden');
  $('end').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (G.state === 'paused') { G.state = 'play'; lock(); return; }
  if (G.state === 'dead' || G.state === 'won') { location.reload(); return; }
  resetRun();
  lock();
}
$('start').addEventListener('click', startGame);
$('retry').addEventListener('click', () => location.reload());
if (params.has('autostart')) startGame();

// ---------- 종료 ----------
function finish(win, title, text) {
  G.state = win ? 'won' : 'dead';
  if (document.pointerLockElement) document.exitPointerLock();
  $('endTitle').textContent = title;
  $('endText').textContent = text;
  $('end').classList.remove('hidden');
  $('hud').classList.add('hidden');
  win ? audio.win() : audio.lose();
}

// ---------- 목표 마커 ----------
const marker = document.createElement('div');
marker.style.cssText = 'position:fixed;pointer-events:none;color:#8fe9ff;font-size:11px;letter-spacing:.2em;text-shadow:0 0 8px rgba(80,200,220,.6);transform:translate(-50%,-50%);opacity:.0;transition:opacity .4s;text-align:center';
document.body.appendChild(marker);
const _mk = new THREE.Vector3();
function updateMarker() {
  if (G.state !== 'play' || G.phase !== 'descend') { marker.style.opacity = 0; return; }
  beacon.worldPos(_mk);
  const dist = _mk.distanceTo(sub.pos);
  _mk.project(camera);
  const behind = _mk.z > 1;
  let x = (_mk.x * 0.5 + 0.5) * innerWidth, y = (-_mk.y * 0.5 + 0.5) * innerHeight;
  if (behind) { x = innerWidth - x; y = innerHeight - y; }
  const m = 70;
  const off = behind || x < m || x > innerWidth - m || y < m || y > innerHeight - m;
  x = clamp(x, m, innerWidth - m); y = clamp(y, m, innerHeight - m);
  marker.style.left = x + 'px'; marker.style.top = y + 'px';
  marker.innerHTML = (off ? '◇' : '◇') + '<br>' + Math.round(dist) + 'm';
  marker.style.opacity = dist > 18 ? 0.55 : 0;
}

// ---------- HUD ----------
const hud = { depth: $('depth'), o2: $('o2'), bat: $('bat'), hull: $('hull'), obj: $('objective') };
function setBar(el, v) { el.style.width = clamp(v, 0, 100) + '%'; el.classList.toggle('low', v < 25); }
function updateHUD(depth) {
  hud.depth.textContent = Math.max(0, Math.round(depth));
  setBar(hud.o2, G.o2); setBar(hud.bat, G.bat); setBar(hud.hull, G.hull);
  hud.obj.textContent = (G.phase === 'descend' ? '신호의 근원을 찾는다' : '수면으로 상승한다') + '   조명탄 ' + G.flareCount;
}

// ---------- 카메라 ----------
const _off = new THREE.Vector3(), _want = new THREE.Vector3();
function updateCamera(dt, time) {
  _off.set(0, 6.2, 17).applyQuaternion(sub.quat);
  _want.copy(sub.pos).add(_off);
  const gy = world.heightAt(_want.x, _want.z) + 1.5;
  if (_want.y < gy) _want.y = gy;
  _want.y = Math.min(_want.y, -0.6);
  if (!camInit) { camPos.copy(_want); camInit = true; }
  camPos.lerp(_want, 1 - Math.exp(-dt * 7));
  camLook.copy(sub.pos).addScaledVector(sub.forward, 30); camLook.y += 0.5;
  camera.position.copy(camPos);
  const s = G.shake;
  if (s > 0.001) {
    camera.position.x += (Math.sin(time * 61) + Math.sin(time * 37)) * 0.18 * s;
    camera.position.y += (Math.sin(time * 53) + Math.cos(time * 43)) * 0.18 * s;
  }
  camera.lookAt(camLook);
  if (G.freeCam) { camera.position.copy(G.freeCam.pos); camera.lookAt(G.freeCam.look); }
  camera.fov = lerp(camera.fov, 66 + (sub.boosting ? 9 : 0) + sub.speed * 0.25, 1 - Math.exp(-dt * 4));
  camera.updateProjectionMatrix();
}

// ---------- 메인 루프 ----------
let last = performance.now();
const _tmpHit = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  tick(now, true);
}
function tick(now, render) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  const playing = G.state === 'play';
  if (playing) G.time += dt;
  const time = G.time + 1000 * 0; // 세계 시간
  SHARED.uTime.value = (now / 1000) % 1000;

  const depth = Math.max(0, -sub.pos.y);
  const d01 = clamp(depth / 460, 0, 1);

  if (playing) {
    const input = {
      thrust: (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0),
      strafe: (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0),
      vert: (keys.Space ? 1 : 0) - (keys.KeyC ? 1 : 0),
      boost: !!(keys.ShiftLeft || keys.ShiftRight),
    };
    // 자원 소모
    G.o2 -= CFG.O2_DRAIN * dt * (1 + 0.6 * clamp(sub.speed / 15, 0, 1));
    if (sub.lampOn) G.bat -= CFG.LAMP_DRAIN * dt;
    G.bat -= (Math.abs(input.thrust) + Math.abs(input.strafe) * 0.5) * CFG.ENGINE_DRAIN * dt;
    if (sub.boosting) G.bat -= CFG.BOOST_BATT * dt;
    G.bat = Math.max(0, G.bat);

    const r = sub.update(dt, input, world, G.bat, now / 1000);
    if (r.impact > 4) {
      const dmg = (r.impact - 4) * 2.2;
      G.hull -= dmg; G.hit = 0.6; G.shake = Math.max(G.shake, 0.5); audio.hit();
      $('vignette').classList.remove('hit'); void $('vignette').offsetWidth; $('vignette').classList.add('hit');
    } else if (r.impact > 1.6) audio.scrape();

    fish.update(dt, now / 1000, sub);
    // 위협
    const events = lurkers.update(dt, now / 1000, sub, flares.list, null, audio);
    for (const ev of events) {
      if (ev.type === 'hit') {
        G.hull -= ev.damage; G.hit = 1; G.shake = 1; audio.hit();
        sub.vel.addScaledVector(ev.dir, 12);
        $('vignette').classList.remove('hit'); void $('vignette').offsetWidth; $('vignette').classList.add('hit');
      }
    }
    pickups.update(dt, now / 1000, sub, (type) => {
      audio.pickup();
      if (type === 'o2') { G.o2 = Math.min(100, G.o2 + 28); story.say('산소 보급 +28', 2.2); }
      else { G.bat = Math.min(100, G.bat + 32); G.flareCount = Math.min(5, G.flareCount + 1); story.say('배터리 +32  조명탄 +1', 2.2); }
    });
    beacon.update(dt, now / 1000, sub, () => {
      G.phase = 'escape';
      sub.canSurface = true;
      levi.wake();
      G.bat = Math.min(100, G.bat + 20);
      audio.roar(); audio.pickup();
      G.shake = 1.4;
      story.say('코어를 회수했다. 코어가 잠수정에 전력을 공급하고 있다.', 3.5);
      story.say('…바닥이 움직인다. 올라가야 한다. 지금.', 4.5);
      story.say('수면까지 쉬지 말고 상승하라. 배터리를 아끼지 마라.', 5);
    });
    flares.update(dt, now / 1000, world);

    // 레비아탄
    let chase = 0;
    if (levi.state !== 'sleep') {
      const kill = levi.update(dt, now / 1000, sub);
      chase = clamp(1 - (levi.gap || 200) / 220, 0, 1);
      if (kill) finish(false, '삼켜졌다', '신호의 근원은 깨어나서는 안 되는 것이었다.');
      if (levi.state === 'rising') G.shake = Math.max(G.shake, 0.8);
    } else {
      levi.update(dt, now / 1000, sub);
    }
    G.panic = lerp(G.panic, Math.max(chase, lurkers.danger * 0.7), 1 - Math.exp(-dt * 3));

    // 스토리/경보
    story.depthTriggers(depth, { battery: G.bat });
    story.update(dt);
    if ((G.o2 < 22 || G.hull < 25) && G.time > G.alarmT) { audio.alarm(); G.alarmT = G.time + (G.o2 < 10 ? 1.1 : 2.2); }
    G.pingT -= dt;
    if (G.pingT <= 0 && G.phase === 'descend') { audio.ping(); G.pingT = 7; }

    // 종료 판정
    if (G.hull <= 0) finish(false, '선체 파손', '수압을 견디지 못했다.');
    else if (G.o2 <= 0) finish(false, '산소 고갈', '어둠 속에서 호흡이 멎었다.');
    else if (G.phase === 'escape' && sub.pos.y > -3.2) finish(true, '귀환', '수면에 도달했다. 손에는 아직 신호가 울리는 코어가 남아 있다.');

    G.hit = Math.max(0, G.hit - dt * 1.4);
    G.shake = Math.max(0, G.shake - dt * 0.9);
    audio.update(dt, { depth01: d01, speed01: clamp(sub.speed / 16, 0, 1), thrust: Math.abs(input.thrust), danger: lurkers.danger || 0, chase });
    updateHUD(depth);
  } else {
    // 메뉴/정지 중에도 배경이 살아 있게
    sub.update(dt, { thrust: 0, strafe: 0, vert: 0, boost: false }, world, 100, now / 1000);
    sub.pos.x += Math.sin(now / 4000) * dt * 0.5;
    fish.update(dt, now / 1000, sub);
    if (G.state === 'menu') { sub.yawT = Math.sin(now / 9000) * 0.6; sub.pitchT = 0.12; }
  }

  world.update(dt, camera, depth);
  jelly.update(sub, scene);
  motes.update(scene);
  snow.update(camera, sub, world._env, scene);
  updateCamera(dt, now / 1000);
  updateMarker();
  if (render) R.render(dt, now / 1000, d01, G.hit, G.panic);
}
requestAnimationFrame(frame);

if (DEBUG) {
  window.THREE = THREE;
  window.__g = {
    G, sub, world, levi, lurkers, beacon, camera, scene, R, keys,
    // 진행 거리 d(m), 바닥에서의 높이로 순간이동
    tp(d, above = 12, xOff = 0) {
      const z = -d;
      const x = world.pathX(z) + xOff;
      sub.pos.set(x, world.heightAt(x, z) + above, z);
      sub.vel.set(0, 0, 0);
      camInit = false;
    },
    // 렌더 없이 게임 로직만 빠르게 진행 (테스트용)
    sim(sec, step = 1 / 30) { let n = performance.now(); for (let t = 0; t < sec; t += step) { n += step * 1000; last = n - step * 1000; tick(n, false); } last = performance.now(); },
    yaw(v) { sub.yaw = sub.yawT = v; },
    pitch(v) { sub.pitch = sub.pitchT = v; },
  };
}
