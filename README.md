# ABYSS

https://rak-kr.github.io/abyss/

해저 협곡을 따라 최심부의 신호원까지 내려갔다가 수면으로 돌아오는 한 판짜리 3D 탐사 게임.
Three.js (로컬 번들, 외부 CDN 없음). 빌드 과정 없이 정적 파일 그대로 GitHub Pages에서 동작합니다.

## 실행
- 로컬: 폴더에서 `python -m http.server` 후 `http://localhost:8000`
- GitHub Pages: 이 폴더 전체를 저장소 루트에 올리고 Pages 활성화

## 파일 구조
| 파일 | 역할 |
|---|---|
| `js/main.js` | 진입점, 게임 루프, 입력, HUD, 카메라, 종료 판정 |
| `js/config.js` | 수치 설정(속도, 소모량, 수심별 환경 키프레임) |
| `js/render.js` | 렌더러, 블룸, 수중 색보정/색수차/그레인 |
| `js/world.js` | 절차적 지형, 바위·기둥·관벌레, 열수구, 수면, 수심별 안개/조명 |
| `js/materials.js` | 지형 재질(디테일 노멀, 얕은 곳 코스틱) |
| `js/sub.js` | 잠수정 모델, 물리, 조명, 볼륨 라이트 콘, 기포 |
| `js/particles.js` | 해양설, 발광 플랑크톤 |
| `js/creatures_ambient.js` | 해파리(GPU 인스턴싱), 물고기 떼 |
| `js/creatures_hostile.js` | 루커(빛에 반응), 레비아탄(최심부) |
| `js/objects.js` | 보급품, 신호원(코어), 조명탄 |
| `js/audio.js` | 절차적 사운드(외부 음원 없음) |
| `js/story.js` | 자막/대사 |

## 조작
W/S 전진·후진, A/D 좌우 이동, Space/C 상승·하강, Shift 가속, F 조명, E 조명탄, 마우스 방향.

## 디버그
주소 뒤에 `?debug` 를 붙이면 `window.__g` 로 순간이동/시뮬레이션 훅을 쓸 수 있습니다. `&autostart` 는 메뉴 없이 바로 시작합니다.
