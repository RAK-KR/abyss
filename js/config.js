// 게임 전역 설정

export const CFG = {
  // 월드 (진행 방향은 -Z)
  X_HALF: 250,
  Z_MAX: 60,
  Z_MIN: -1560,
  BASIN_D: 1480,          // 분지(최심부) 중심까지의 거리
  SURFACE_Y: 0,

  // 잠수정
  THRUST: 11,
  STRAFE: 6,
  VERT: 6.5,
  DRAG: 0.9,
  BOOST_MULT: 1.65,
  BOOST_BATT: 2.6,        // 초당 배터리 소모(%)
  O2_DRAIN: 0.07,         // 초당 산소 소모(%)
  LAMP_DRAIN: 0.10,       // 초당 조명 소모(%)
  ENGINE_DRAIN: 0.025,

  // 상승 추격
  LEVI_SPEED_START: 9.8,
  LEVI_SPEED_END: 14.5,
  LEVI_RAMP: 38,          // 초
};

// 수심에 따른 환경 키프레임
export const ENV_KEYS = [
  { d: 0,   fog: [0.07, 0.36, 0.50], den: 0.0095, amb: 0.8,  sun: 0.8 },
  { d: 40,  fog: [0.035, 0.24, 0.38], den: 0.0130, amb: 0.6, sun: 0.4 },
  { d: 110, fog: [0.025, 0.21, 0.37], den: 0.0165, amb: 0.42, sun: 0.12 },
  { d: 220, fog: [0.008, 0.09, 0.18], den: 0.0195, amb: 0.2,  sun: 0.0 },
  { d: 340, fog: [0.003, 0.04, 0.085], den: 0.0215, amb: 0.1,  sun: 0.0 },
  { d: 480, fog: [0.001, 0.015, 0.035], den: 0.023, amb: 0.05, sun: 0.0 },
];
