// 게임 전역 설정

export const CFG = {
  // 월드 (진행 방향은 -Z)
  X_HALF: 250,
  Z_MAX: 60,
  Z_MIN: -1650,
  BASIN_D: 1480,          // 최심부(크레이터) 중심까지의 거리
  SURFACE_Y: 0,
  CRATER_R: 120,          // 크레이터(수직 구덩이) 반지름

  // 잠수정
  THRUST: 11,
  STRAFE: 6,
  VERT: 6.5,
  DRAG: 0.9,
  BOOST_MULT: 1.65,
  BOOST_BATT: 2.2,        // 초당 배터리 소모(%) — 가속은 짧게만 쓸 수 있다
  O2_DRAIN: 0.07,         // 초당 산소 소모(%)
  LAMP_DRAIN: 0.10,       // 초당 조명 소모(%)
  ENGINE_DRAIN: 0.025,

  // 탈출 구간: 암반 게이트
  GATE_COUNT: 15,
  GATE_GAP: 30,           // 게이트 사이 수직 간격(m)
  GATE_FIRST: 40,         // 바닥에서 첫 게이트까지(m)
  GATE_HOLE: 16,          // 구멍 반지름(m)

  // 레비아탄 (플레이어가 지나간 경로를 그대로 따라온다)
  LEVI_SPEED_START: 7.0,
  LEVI_SPEED_END: 11.5,
  LEVI_RAMP: 45,          // 초
  LEVI_FIRST_LUNGE: 12,   // 첫 돌진까지(초)
  LEVI_LUNGE_EVERY: 8.5,  // 돌진 주기(초)
};

// 수심에 따른 환경 키프레임
export const ENV_KEYS = [
  { d: 0,   fog: [0.07, 0.36, 0.50], den: 0.0095, amb: 0.8,  sun: 0.8 },
  { d: 40,  fog: [0.035, 0.24, 0.38], den: 0.0130, amb: 0.6, sun: 0.4 },
  { d: 110, fog: [0.012, 0.13, 0.25], den: 0.0165, amb: 0.45, sun: 0.12 },
  { d: 220, fog: [0.004, 0.05, 0.11], den: 0.0185, amb: 0.36,  sun: 0.0 },
  { d: 340, fog: [0.002, 0.028, 0.065], den: 0.0200, amb: 0.32,  sun: 0.0 },
  { d: 480, fog: [0.001, 0.014, 0.034], den: 0.0215, amb: 0.30,  sun: 0.0 },
];
