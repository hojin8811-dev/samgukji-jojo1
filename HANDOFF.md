# 인수인계 — 《삼국지-꼬마영웅 난타전》 (`samgukji-jojo1`)

> 기준 **v6.9 · 2026-11-27 · 라이브 `?v=146`** (최신 커밋 해시는 `git log -1 --oneline`)
> 이 문서는 "바로 이어서 개발"용 요약본입니다. 버전별 상세 이력은 `README.md`, 예전(v5.75) 상세 인수인계서는 `HANDOFF_ARCHIVE_v575.md`, 복붙용 지시서는 `HANDOFF_PROMPT.md`에 있습니다.

---

## 1. 한눈에

| 항목 | 내용 |
| --- | --- |
| 무엇 | 후한 말~삼국 시대에 한국 영웅까지 섞인 **턴제 전략 웹게임**. 천하 지도에서 내정하고, 싸움은 18×18 격자 전장(《삼국지 조조전》식)으로 벌인다. 별도 모드로 원정 《삼국이분다》가 있다. |
| 화면 | 표지 → 천하 지도 → 성 내정 → 격자 전장 (모바일 **세로 390×844** 우선) |
| 기술 | **정적 HTML/CSS/JS만.** 빌드 도구·프레임워크·번들러 없음. 데이터는 `fetch()`로 `data/*.json` 로드 |
| 저장소·배포 | `https://github.com/hojin8811-dev/samgukji-jojo1` · 브랜치 `main` = GitHub Pages 루트. push하면 몇 초~수십 초 뒤 반영. CI·워크플로 없음 |
| 라이브 | `https://hojin8811-dev.github.io/samgukji-jojo1/` (캐시 버스터 `?v=146`) |
| 규모(실측) | 거점 80(`data/cities.json`) · 장수 701(명부 `data/generals.json` 596 + 시나리오·재야 인물) · 병과 18(`data/classes.json`, 군주 포함 19) · 보물 350(`data/treasures.json`) · 고유 특기 701(`data/unique_passives.json`) · 시나리오 4 · 18×18 격자 전장 · **특전 영웅 10(1탄, 출시 전 비공개)** |

---

## 2. 지금 상태 — 실제로 확인한 값 (2026-11-27 기준)

- **최신 커밋**: `v6.9 이세계 특전 영웅 DLC 1탄 — 특전 상점·Billing 연결·1~10번 (?v=146)` — 2026-11-27 `main` HEAD
- **`index.html`**: `css/game.css?v=146`, `js/*.js?v=146`(17개 — `js/dlc.js` 추가), `manifest start_url "./index.html?v=146"`, 서비스워커 등록도 `sw.js?v=146`
- **초상 캐시는 따로 관리**: `js/data.js`의 `SK.ASSET_V = '140'`. 캐시 버스터 `?v=`와 별개이므로, **초상 파일을 실제로 덮어썼을 때만** `ASSET_V`를 올린다(그림을 안 바꿨으면 `?v=`만 올린다 — v6.8이 그 예).
- **`sw.js`**: 캐시를 쌓지 않는 **통과형(network)** 서비스워커. `CACHE` 상수 없음, 파일 주석에 배포별 이력만 남는다.
- **세이브**: `localStorage` 키 `samgukji-jojo-v4-save`, 저장 데이터는 `version: 5` 검사(`SK.load`). 화면상 슬롯 5칸 + 자동 저장 1.
- **오류 수집**: `index.html`이 `window.__errs`에 `error`·`unhandledrejection`을 모은다. 점검은 이 배열 길이 0으로 판정.

---

## 3. 파일 지도

### 루트

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 껍데기 · 스크립트 로드 순서(이 순서가 곧 의존성) · `window.__errs` 수집 · SW 등록 |
| `manifest.webmanifest` | PWA(standalone, portrait). `start_url`에 `?v=` 포함 |
| `sw.js` | 통과형 서비스워커(오프라인 캐시 없음) |
| `README.md` | **버전별 변경 이력의 정본** — 배포마다 맨 위에 새 섹션을 쓴다 |
| `HANDOFF_PROMPT.md` · `V5_ROADMAP.md` · `DESIGN.md` | 복붙 지시서 · 완료/남은 일 상세 · 초기 설계 |
| `HANDOFF_ARCHIVE_v575.md` | v5.75 시점의 옛 상세 인수인계서(내용 보존용) |
| `game.js`(112KB) · `style.css`(34KB) | **현재 `index.html`이 로드하지 않는 구버전 잔여 파일.** 참조 확인 전에 지우거나 고치지 말 것 |

### `css/`

| 파일 | 역할 |
| --- | --- |
| `game.css` (572KB) | 전체 UI. 최근 디자인 변경은 관례상 **파일 끝에 추가형 오버라이드**로 덧붙인다(DOM·ID·이벤트·키프레임을 건드리지 않음) |

### `js/` (로드 순서대로)

| 파일 | 역할 |
| --- | --- |
| `mapgeo.js` (34KB) | Natural Earth 50m 기반 지도 좌표 — **자동 생성, 손으로 고치지 않는다** |
| `mapmask.js` (19KB) | 육지 마스크(자동 생성). `SK.roadIssues()`가 육로가 바다를 건너는지 볼 때 쓴다 |
| `city_geo.js` (6KB) | 80거점 이름·한자·지역(수기) + 좌표 |
| `data.js` (240KB) | 데이터 본체 — 지형·병과(`SK.CLASSES`)·장수·80거점·전장·세력색(`SK.FACTION_COLOR`)·초상 경로·`SK.ASSET_V` |
| `comedy_v64b.js` (32KB) | 코믹 개그 대사 풀(자료만 담고, 엔진이 각 풀에 병합) |
| `ult_v582.js` (13KB) | S급 필살기 효과·설명 오버라이드 (`data.js` 뒤에 읽어 `SK.ULTIMATES`를 덮어씀) |
| `patch_v584.js` (55KB) | v5.84 연출·대사 패치 |
| `bgm.js`(49KB) · `sfx.js`(7KB) | 16비트 FM 배경음 · 효과음(오디오 컨텍스트는 앱 전체 하나) |
| `app.js` (1.0MB) | **본체** — 상태·화면·내정·월 정산·외교·저장/불러오기 |
| `dlc.js` (24KB) | **이세계 특전 영웅 DLC** — `data/dlc_heroes.json`을 읽어 고유 직업·책략·필살기·초상·SD를 `SK`에 등록, 해금(`unlockedDlc`)·상점 UI·`SK.DlcBilling` 연결. 출시 전에는 `DLC_PUBLIC=false`로 상점이 닫혀 있다(아래 §6-1) |
| `map.js` (76KB) | 천하 지도 렌더(지형/세력 영토/길 3레이어) |
| `battle.js` (820KB) | 대형 격자 전장(24/28/32 팬·줌·미니맵) — 이동·공격·책략·AI·**일기토** |
| `tutorial.js` (21KB) | 3분 입문 튜토리얼(1:1 모드) |
| `expedition.js` (148KB) | 원정 《삼국이분다》 — 1~3막 30관문·랭킹전·장비·보스 토벌 |
| `backguard.js` (16KB) | 안드로이드 뒤로가기(popstate) 이탈 방지 |
| `admin.js` (75KB) | 관리자 모드 `?admin=1` |
| `patch_v585_map_editor.js` (78KB) | 관리자 전장 타일 맵 에디터 + 천하 전략 지도 편집기 |

### `data/` (런타임에 실제로 읽는 것)

`dlc_heroes.json`(특전 영웅 1탄 10인) · `generals.json`(596) · `cities.json`(80) · `classes.json`(18, **런타임에 `SK.CLASSES`를 덮어씀**) · `treasures.json`(350) · `unique_passives.json`(701) · `scenarios.json`(4) · `historical_scenarios.json` · `bonds.json` · `tech_tree.json` · `events.json` · `domestic_events.json` · `quotes_and_ranks.json` · `hero_gags.json` · `korea_v523_art.json` · `*_art_manifest.json`(초상 매니페스트)

### `assets/`

`portraits/`(v2·v579·v589a·v594·v64b·v64c·v650·v660·top100·a_rank·**dlc**) · `units/`(…·**dlc**) · `battle/` · `buildings/` · `townsfolk/` · `maps/` · `scenes/` · `scenarios/` · `icons/` · 지도 배경 4계절(`map_bg*.webp`)

---

## 4. 최근 주요 변경 (최근 8개 커밋)

| 커밋 | 날짜 | 내용 |
| --- | --- | --- |
| **v6.9** | 11-27 | **이세계 특전 영웅 DLC 1탄**(출시 전 비공개) — `data/dlc_heroes.json` 10인(고유 직업·고유 책략 3종·고유 필살기·S급 동급 스탯·`dlc_hero_01~10`·2,900원) · `js/dlc.js` 로더/해금(`unlockedDlc`)/`SK.DlcBilling`(AndroidBilling 브리지)/상점 모달(목판·비단) · `?dlc=1` 또는 `dlcTestMode`에서만 보이는 게이트 · 전용 초상 `assets/portraits/dlc/`·전용 전장 SD `assets/units/dlc/` 10종 + 영웅별 오라(`drawDlcChibi`) · 율도국 의적 전리품 금 +25% |
| **v6.8a** | 11-27 | 본편 유저 입장 TOP 5 UX — ① 출진 편성 전력 비교(적 성 수비+전장 증원 vs 우리 출진)·2배 이상 [전멸 위험] 배지·1.5배 이상 확인창 ② 성하 야전 승리 뒤 [성문 앞 전력] 비교 + [이번 달 물러난다(회군)] ③ 생포 처리(등용·석방·억류) 한 줄 설명 ④ 3분 입문 성문 앞 1~3칸 근거리 스폰 + 안내 전환을 `allyHits > 0`(실제 타격)으로 수정 ⑤ 이동 가능 칸 밝은 파랑 판·바깥 윤곽, 부대 스프라이트 히트박스 ⑥ 월정산 '이 달 실제 병력' 줄·스크롤 힌트 ⑦ 공·사기 변동 사유(지형·진형·사기·책략) 표기 ⑧ 일기토 결과 [확인 — 전장으로] 버튼(수동은 자동 닫힘 없음) ⑨ 공터 건설 Lv.1 기대 효과 수치 ⑩ 출진 대상 성 카드 목록 |
| `d225c2a` **v6.8** | 11-26 | S/A급 네임드 일기토는 자동 행군 중에도 플레이어가 직접 지휘(등급 태그 + [⏭ 자동 진행]) · 거점 점령 특전 배지(성 함락·수성·지도 시트·성 요약) · 결산창 명성 표기 실제 가산(함락 350~500·수성 160)로 정정 |
| `02bffcc8`·`5a622cf7`·`cba3fb61` **v6.7 docs** | 11-26 | `SK.ASSET_V` 표기 140 정정 · sw 주석 캐시 번호 정리 · 초상 정리 설명 정정(v594 26장은 투명화 재작업본·미연결) |
| `dd232db6`·`c14b11db` **v6.7a** | 11-26 | 원정 대기실 등급 테두리의 네온 글로우 제거 → 그림자(등급색 값은 본편 그대로) |
| `6cf17ce7` **v6.7** | 11-26 | 원정 《삼국이분다》 UI를 본편 결(목판·금테·비단)로 통일 · 안 쓰는 구버전 초상 436장(9.51MB) 정리(20.57MB→11.06MB) · 도감 '한국' 필터를 세력이 아닌 지역(`SK.generalGroup`) 기준으로 · 390×844 터치 영역 확대 |
| `77891b91` **v6.6c** | 11-26 | 성내 내정 UI 왕조 목판·비단 적용 |
| `51703f57` **v6.6a** | 11-26 | 초상 17장 화풍 통일 재제작 |
| `dba10c8d` **v6.6b** | 11-26 | 필살기·화계 피격도를 시전자 방향으로 넉백 |

---

## 5. 절대 지켜야 할 개발 규칙

1. **모바일 390×844 기준 가로 넘침 0 · 콘솔 오류 0건.** `window.__errs`가 빈 배열이어야 한다.
2. **배포할 때 캐시 버스터를 함께 올린다.**
   - `index.html`의 `?v=` (css·js·`manifest start_url`), 그리고 **서비스워커 등록 쿼리 `sw.js?v=`**
   - 초상 그림을 실제로 덮어썼으면 `js/data.js`의 `SK.ASSET_V`도 +1
   - push 후 GitHub Pages 반영(수십 초)까지 기다렸다가 라이브 URL에서 확인한다.
3. **기존 `localStorage` 세이브 호환 유지.** 키 `samgukji-jojo-v4-save`, `version: 5` 검사를 깨지 않는다. 저장 구조를 바꾸면 `SK.load`에 옛 세이브 보정을 넣고, 옛 세이브로 새 게임을 열어 확인한다.
4. **확정 명부·기존 기능 훼손 금지.** `SK.KOREA_S30`(스탯 조정에도 S로 남는 한국 30명) 등 확정 명부, 일기토·격자 전투·원정·도감의 기존 동작을 깨지 않는다. 병과 수치는 **`js/data.js`의 `SK.CLASSES`와 `data/classes.json` 두 곳 모두** 고친다(런타임에 후자가 덮어쓴다).
5. **작업을 마치면 이 `HANDOFF.md`의 버전·최근 변경 내역을 함께 갱신한다.** `README.md` 맨 위 변경 이력과 `V5_ROADMAP.md`도 같은 커밋에서 맞춘다.

---

## 6-1. 이세계 특전 영웅 DLC — **출시 전 비공개 대기 상태 (2026-11-27 지시: "작업 후 일단 닫아놔, 출시 이후에 열 거니까")**

- **일반 유저에게는 전혀 보이지 않는다.** 지도 [✨ 특전] 버튼·메뉴 항목·상점 모두 `js/dlc.js`의 `DLC_PUBLIC = false` + `isDlcOpen()` 게이트로 닫혀 있고, `SK.DLC.open()`을 직접 불러도 열리지 않는다(테스트에서 확인).
- **테스트 입장 두 가지**
  1. 주소에 **`?dlc=1`** — 예: `https://hojin8811-dev.github.io/samgukji-jojo1/?v=146&dlc=1` (지도에 들어가면 상점이 한 번 자동으로 열린다)
  2. `localStorage['dlcTestMode'] = '1'` — 기기 브라우저 콘솔에서 한 번 실행하면 그 기기에서 계속 보인다. (상점에서 [테스트 해금]을 한 번 쓰면 자동으로 켜진다)
- **해금 상태**는 `localStorage['unlockedDlc'] = ["dlc_hero_01", ...]` 배열. 해금하면 그 영웅이 본성 로스터에 합류하고, 지도에 들어올 때마다 빠진 영웅을 다시 합류시킨다(새 게임도 마찬가지).
- **상품·가격 정본은 `data/dlc_heroes.json`** — `productId`(`dlc_hero_01`~`dlc_hero_10`), `price`(2900), 이름·직업·필살기. 2탄·3탄도 같은 파일에 항목만 이어 붙이면 된다.
- **Google Play Billing 연결점**(네이티브 담당자용): `window.SK.DlcBilling`
  - `purchase(productId)` → `window.AndroidBilling.purchase(productId)` 호출(없으면 `'unavailable'`을 돌려주고 웹 안내창)
  - 결제 완료 시 앱이 **`SK.DlcBilling.onPurchaseSuccess(productId)`**, 취소·실패 시 **`SK.DlcBilling.onPurchaseFail(productId, reason)`** 를 부르면 해금·로스터 합류·토스트까지 끝난다.
- **출시할 때**: `js/dlc.js`의 `DLC_PUBLIC = false` → `true` 로 바꾸고 `?v=`를 올려 배포하면 전체 공개된다. 그 전까지 목록에 2·3탄을 채우는 것이 순서다.
- **검수**: `python3 tools/v690_browser.py`(57항목) · 스크린샷 `preview/v682/`. 일반 주소 비공개·`?dlc=1` 상점·해금→로스터→실제 출진→전장 고유 치비→필살기 10종→세이브까지 자동 확인한다.

## 6. 작업 마칠 때 체크리스트

- 390×844 headless로 **새 게임 → 내정 → 다음 달 → 출진 → 전투 승리**를 끝까지 돌린다.
- `window.__errs.length === 0`, 가로 스크롤 없음, 옛 세이브로 불러오기 1회.
- 바꾼 화면은 실제 플레이어 눈높이에서(버튼 잘림·글자 겹침·터치 크기) 확인한다.
- 커밋 메시지는 `v6.x — 핵심 한 줄 (?v=NNN)` 형식(한국어).
- 배포 후 라이브 URL(`?v=새 번호`)에서 한 번 더 열어 확인한다.
