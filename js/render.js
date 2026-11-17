// 렌더러 + 후처리(블룸, 수중 색보정, 색수차, 필름 그레인)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDepth: { value: 0 },      // 0~1
    uHit: { value: 0 },        // 피격 연출
    uPanic: { value: 0 },      // 위험 연출(호흡/추격)
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uDepth; uniform float uHit; uniform float uPanic; uniform vec2 uRes;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      // 얕은 곳에서는 약한 굴절 흔들림
      float wob = (1.0 - uDepth) * 0.0016;
      uv += vec2(sin(uv.y * 38.0 + uTime * 1.4), cos(uv.x * 31.0 + uTime * 1.1)) * wob;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      float ca = 0.0016 + r2 * 0.012 + uHit * 0.012 + uPanic * 0.004;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      // 수심에 따라 채도 감소 + 청록 그림자
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.0 - 0.28 * uDepth);
      col += vec3(-0.004, 0.006, 0.012) * (1.0 - smoothstep(0.0, 0.25, l)) * (0.4 + uDepth);
      // 피격: 붉은 번쩍임
      col = mix(col, col * vec3(1.6, 0.35, 0.3), uHit * 0.6);
      // 필름 그레인
      float g = rnd(uv * uRes) - 0.5;
      col += g * (0.018 + 0.012 * uDepth);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.3, 1400);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.65, 0.78);
    this.grade = new ShaderPass(GradeShader);
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.output);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.grade.uniforms.uRes.value.set(w * pr, h * pr);
  }

  render(dt, time, depth01, hit, panic) {
    const u = this.grade.uniforms;
    u.uTime.value = time % 100;
    u.uDepth.value = depth01;
    u.uHit.value = hit;
    u.uPanic.value = panic;
    this.composer.render(dt);
  }
}
