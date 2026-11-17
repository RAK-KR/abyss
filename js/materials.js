// 공용 셰이더 유니폼과 지형/바위 재질 (디테일 노멀 + 얕은 곳 코스틱)
import * as THREE from 'three';

export const SHARED = {
  uTime: { value: 0 },
  uSun: { value: 1 },        // 수면 빛 세기 (0~1)
};

const NOISE_GLSL = /* glsl */`
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 vnGrad(vec3 p){
  float e = 0.15; float n = vn(p);
  return vec3(vn(p + vec3(e,0,0)) - n, vn(p + vec3(0,e,0)) - n, vn(p + vec3(0,0,e)) - n) / e;
}
`;

export function makeRockMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: opts.vertexColors ?? false,
    roughness: opts.roughness ?? 0.92,
    metalness: 0.0,
  });
  if (opts.color !== undefined) mat.color.set(opts.color);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uSun = SHARED.uSun;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vWPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        #else
          vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform float uTime;
        uniform float uSun;
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dn = vn(vWPos * 0.55) * 0.6 + vn(vWPos * 2.3) * 0.4;
        diffuseColor.rgb *= mix(1.0, 0.72 + 0.55 * dn, ${(opts.detail ?? 1.0).toFixed(2)});`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 g = vnGrad(vWPos * 1.1) * 0.55 + vnGrad(vWPos * 3.7) * 0.28;
          vec3 gv = (viewMatrix * vec4(g, 0.0)).xyz;
          normal = normalize(normal + (gv - dot(gv, normal) * normal) * ${(opts.bump ?? 0.9).toFixed(2)});
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float c = vn(vec3(vWPos.xz * 0.33, uTime * 0.35));
          float c2 = vn(vec3(vWPos.xz * 0.61 + 7.0, uTime * 0.5 + 3.0));
          float lines = pow(1.0 - abs(c * 2.0 - 1.0), 5.0) * pow(1.0 - abs(c2 * 2.0 - 1.0), 3.0);
          totalEmissiveRadiance += vec3(0.55, 0.95, 1.0) * lines * uSun * 0.7 * smoothstep(-70.0, -4.0, vWPos.y);
        }`);
  };
  return mat;
}
