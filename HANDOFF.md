# 인수인계서 — 《꼬마영웅 천하통일》

> 이 문서 하나만 읽으면 바로 이어서 개발할 수 있게 정리했습니다.
> 기준: **v5.2** 통합 업데이트 + **v16** 시나리오 선택 화면(도안 A) · 2026-11-20 · 라이브 `?v=16`
> 함께 보면 좋은 문서: `HANDOFF_PROMPT.md`(복붙용 지시서) · `README.md`(버전별 변경 이력) · `V5_ROADMAP.md`(완료/남은 일 상세) · `DESIGN.md`(초기 설계)

---

## 0. 30초 요약

| 항목 | 내용 |
| --- | --- |
| 무엇 | 후한 말~삼국 시대를 무대로 한 **턴제 전략 웹게임**. 전국 지도에서 내정하고, 싸움만 《삼국지 조조전》식 18×18 격자 전장으로 벌인다. |
| 화면 | ① 타이틀 → ② 천하 지도 → ③ 성 내정 → ④ 격자 전장 (모바일 세로 **390×844** 우선) |
| 기술 | **정적 HTML/CSS/JS 뿐.** 빌드 도구·프레임워크·번들러 없음. 데이터는 `fetch()`로 JSON 로드. |
| 저장소 | `https://github.com/hojin8811-dev/samgukji-jojo1` (기본 브랜치 `main`, 최상위 폴더에 그대로 배포) |
| 라이브 | `https://hojin8811-dev.github.io/samgukji-jojo1/` (캐시 버스터 `?v=16`) |
| 규모 | 77거점 · 585장수 · 19병과(군주 포함) · 고유특기 100 · 보물 151 · 기술 24 · 시나리오 4(190/200/208/220) |
| 배포 | `main`에 push → GitHub Pages가 몇 초 뒤 자동 반영. 별도 CI·워크플로 없음. |
| 다음 목표 | **v5.1 나머지** — 8장 A(직교 공성전 맵)는 v5.1에서 완료. 다음은 8장 B(2~3턴 행군·요격전) |

---

## 0.5 v5.2에서 바뀐 것 (2026-11-20)

| 갈래 | 내용 | 코드 위치 |
| --- | --- | --- |
| 건물 외형 | 9종 × Lv.1~5 스프라이트(`assets/buildings/{key}_lv1~5.webp`), 현재 Lv 그림 표시·없으면 `{key}.webp` 폴백 | `app.js` `bldSrc()`·`bldFallback()`, `renderCitySlots`·`renderYard`·`openSlot` |
| 관아 | 동그라미 → `palace.webp`(레벨 배지 없음) | `renderYard` `.hotspot.office .hs-ico` |
| 시설 경험치 | `sl.exp`, `slotExpNeed(lv)=60+lv*45`, 증축은 경험 full + 금 필요. 월정산에서 담당 34~66 / 무담당 6 | `ensureSlots`·`runSlots`·`openSlot` |
| 치안 | `cs.order`(0~100)를 민심과 분리, 순찰소가 매달 +1.1×lv×mul(없으면 -0.5). 개발 바에 표시 | `newState`·`runSlots`·`renderCityDev` |
| 병력 상한 | `SK.troopCapOf()` — 군주 10,000 / 일반 5,000, 장군(또는 Lv.20+) 20,000/10,000 | `data.js` `SK.TROOP_CAP` |
| 출진 병력 입력 | 병력 숫자를 누르면 `#ti-num` 입력창, 500~상한/남은 병력 클램프 | `openDeploy` `openTroopInput` |
| 전투 밸런스 | `sizeScale`(방어 병력^0.65)·`atkScale`(공격 병력^0.4), 투석차 일반 0.55배 | `battle.js` `calcDamage` |
| 성문 HP | `B.gate{tiles,hp,maxHp}` — 내구도 바, 부서지기 전 근접 통행·공격 차단, 원거리·포격·책략은 통과 | `startBattle`·`gateIntact`·`wallBlocked`·`drawObjective`·`openGateAttack` |
| [자동] | 아군 턴 자동 진행 토글(`.act.auto`), 적 사거리→성문→접근 순 판단, 턴 넘김까지 이어감 | `toggleAuto`·`planAuto`·`autoStep` |
| 책략 범위 | 사거리 타일 보라 + 효과 반경 주황 하이라이트 | `drawHighlights` |
| 조각배 | 수전 물 타일 위 부대는 `assets/units/skiff.webp` | `unitImgFor` |
| 시나리오 | `유언군` 개명, 190년 `cityCaps`(동탁 5·유표 4·원소 3, 그 외 1), `padStartRosters`로 카드=인게임 장수 수 일치·최소 6명 | `historical_scenarios.json`·`resolveScenario`·`factionCard` |
| 초상화 | `top100` 100장 여백 크롭, 비어 있던 `5.webp`(하후연) 복구 | `assets/portraits/top100/` |

> 새 저장 필드: `cs.order`, `sl.exp` — `SK.load()`에서 없으면 채웁니다(구세이브 호환).

**지금 당장 할 일 하나만 고르라면**: 8장 **A. 공성전 맵 직교화**입니다. 사용자가 가장 크게 느끼는 불만이 "배경이 대각선이라 격자와 안 맞는다"입니다.

---

## 0.6 v16 — 시나리오 선택 화면 (2026-11-20)

`새로 시작`을 누르면 뜨던 시나리오 선택 모달을 없애고, 사용자가 고른 **도안 A** 그대로 전용 화면(`#screen-scenario`)을 만들었습니다.

| 갈래 | 내용 | 코드 위치 |
| --- | --- | --- |
| 화면 | `<section id="screen-scenario">` — 어두운 먹·나무결 바탕, 좌상단 `←`, 금빛 세리프 제목 `어느 난세를 살아갈까`, 아래 4장 배너 | `index.html`, `css/game.css` 끝 `v16` 블록 |
| 배너 카드 | 금테 가로 카드. 왼쪽은 `assets/scenarios/scen_{year}.webp`가 양피지로 마스크 페이드, 오른쪽은 타원 금테 연도 뱃지(`--ac`로 색 구분) · 제목 · `N개 세력 · 대표 세력 외` · `›` | `openScenarioPicker()` |
| 이동 | 카드 → 기존 세력 선택(`어느 세력으로 일어설까`) 모달 → `beginScenario`. 세력 선택의 `돌아가기`는 이 화면으로 복귀 | `openFactionPicker()` |
| 뒤로 | 게임 진행 중이면 지도로, 첫 화면이면 표지로 | `#btn-scenario-back` |
| 일러스트 | 190/200/208/220 4장, 760px WebP q86(56~74KB), 글·한자·숫자 없음, 오른쪽 35% 양피지 여백 | `assets/scenarios/` |

검증: `tools/v16_scenario.py` — 390×844에서 오류 0, 카드 4장 렌더·잘림 없음, 190 → 세력 20개 → 동탁군 시작 → 지도 진입까지 확인(`preview/v52/scenario_a_live.png`).

---

## 1. 지금 상태 (v5.0.3)

- 지도 도로망 77거점을 손으로 고정(`SK.ROAD_EDGES`)하고, 지형·영토·산맥·성 아이콘을 v5.0.2에서 다시 그렸습니다.
- 내정은 《삼국지 12》식 **성 마당 공터 건설**(시장·농원·병영·연병장·순찰소·주점·성벽·연구소·공방, Lv.1~5)까지 동작.
- 전장은 18×18 격자, 병과 19종, 책략·강화·약화(3턴)·경험치 바·병과 배지까지 동작.
- 최근 반영분: 군주=태수, 초상 100장 재프레이밍, 남성 군악대 초상, 병력 1단위 조절, 사거리 +1, 책공/책방, 다음 달 확인창.
- 상세 이력은 `README.md`의 v5.0.3 → v4.1 항목, 남은 일 목록은 `V5_ROADMAP.md` 137행 이후.

---

## 2. 실행 · 배포 · 캐시

```bash
# 로컬 (fetch로 JSON을 읽으므로 file:// 로 열면 데이터가 안 붙는다. 반드시 http 서버)
cd samgukji-jojo
python3 -m http.server 8080      # → http://localhost:8080
```

```bash
# 배포
git add -A && git commit -m "v5.0.4 — (요약)"
git push origin main              # GitHub Pages가 자동 갱신
```

- **캐시 버스터**: `index.html` 안의 `?v=16` 9곳(`game.css`, `mapgeo.js`, `city_geo.js`, `data.js`, `bgm.js`, `sfx.js`, `app.js`, `map.js`, `battle.js`)을 배포마다 **+1** 합니다. 이걸 빼먹으면 폰에서 옛 파일이 계속 돌아 "고쳤는데 안 바뀐다"가 됩니다.
- 라이브 확인은 폰 브라우저에서 `.../samgukji-jojo1/?v=16`처럼 버전을 붙여 여는 게 확실합니다.
- 저장은 `localStorage` 키 **`samgukji-jojo-v4-save`** 하나입니다(`js/app.js` 상단 `SAVE_KEY`). 저장 구조를 바꾸면 이 키를 올리거나 마이그레이션을 넣으세요.

---

## 3. 파일 지도

```
index.html                # 4개 화면(#screen-title/map/city/battle) + 인라인 SVG 아이콘 스프라이트
css/game.css              # 전체 스타일 (약 100KB, 화면별 섹션 주석으로 구분)
js/mapgeo.js              # 자동 생성. Natural Earth 50m 육지 폴리곤·호수·강 좌표 (2000×1333). 손대지 말 것
js/city_geo.js            # 성 이름 → [id, 한자, u, v, 지역] 좌표표
js/data.js      (1,347줄) # 지형·병과·스킬·보물·전장 맵·도로·시나리오 로더 = 게임의 데이터 계약
js/bgm.js, js/sfx.js      # 배경음·효과음 (WebAudio, 외부 파일 없음)
js/app.js       (3,944줄) # 시작/저장/지도HUD/성 내정/인사/외교/기술/월정산 = 게임 본체
js/map.js       (1,376줄) # 지도 4레이어 캔버스 렌더러 (지형/영토/숲·산·강/길) + 팬·줌·탭
js/battle.js    (2,406줄) # 18×18 전장 (배치·이동·공격·책략·AI·연출·HUD)
data/*.json               # 아래 4장 표 참고
assets/portraits/top100/  # 상위 100명 전용 초상 100장 (webp, 투명 배경)
assets/units/top100/      # 상위 100명 전용 SD 100장 (webp)
assets/portraits/v2/      # 기본 초상 28장 (gen_* 병과별 + 주요 군주)
assets/units/, units/v2/  # 병과 공용 SD 18장(job_*.webp) + 옛 v2 SD 21장
assets/buildings/         # 내성 건물 9장 (market·farm·barracks·training·patrol·tavern·wall·lab·workshop)
assets/scenes/            # 성 일러스트 city_lv1·2·3·5 + 성 유형 배경 3장
assets/maps/v2/           # 전장 배경 4장(battle_siege|naval|mountain|fortress.webp) + terrain.webp
assets/icons/             # 지도용 아이콘 4장
```

**저장소에 없는 것** (`.gitignore`): `tools/`(개발·검증 파이썬 스크립트), `preview/`(스크린샷), `assets/_source/`(원본 이미지 64MB), `samgukji-jojo-standalone.html`(단일 파일 백업), `game.js`·`style.css`(v4 이전 레거시, **index.html에서 로드하지 않음**).
→ 즉 **GitHub만 보고 작업하는 AI는 이미지 생성 스크립트(`tools/gen_map_icons.py`, `tools/portraits_v501.py`, `tools/cutout.py` 등)를 볼 수 없습니다.** 그림을 다시 뽑아야 하면 새로 만들거나, 사용자 PC 작업 폴더에서 파일을 받아야 합니다.

---

## 4. 데이터 계약 (`data/*.json`)

| 파일 | 개수 | 필드 | 비고 |
| --- | --- | --- | --- |
| `cities.json` | 77 | `id, name, type(대도시/소도시/관문/요새), faction(위/촉/오/군웅/한국), battleType, gold, food, troops, defense, governor` | 좌표는 `js/city_geo.js`에서 이름으로 연결 |
| `generals.json` | 585 | `id, name, faction, tier(S/A/B/C), job, leadership, war, intel, politics, charm, skill(고유특기명), birthYear, debutYear` | `debutYear` 전에는 등용·수비 배치에서 제외 |
| `historical_scenarios.json` | 4 | `id, year, title, historyNote, timelineEvents[], factions[]` | 190(20세력)·200(13)·208(12)·220(9) |
| `classes.json` | 18 | `job, promotions[4], moveRange, attackRange('1' 또는 '1~4'), terrainBonus{siege,naval,mountain,fortress}, skills[{name,mp,unlockLv,effect}]` | **런타임에 `SK.CLASSES`를 덮어쓴다** (7장 규칙 7) |
| `tech_tree.json` | 24 | `id, category(군사/내정/…), tier, name, costGold, turns, prereq, summary, bonus{atkPct,defPct,goldPct,foodPct,popPct,wallPct,recruitPct}` | `SK.techPct(key)`가 합산 |
| `unique_passives.json` | 100 | `name, title, trigger(on_attack/…), effect, valuePct, cooldown` | 장수 카드·전장 발동 |
| `treasures.json` | 151 | `id, name, type(무기/방어구/명마/병법서), grade(전설/…), statBonus{war,intel,leadership,charm,politics,move}, effect, dropHint` | v5.0.1에서 `쌍고검` 추가로 150→151 |
| `top100_art_manifest.json` | 100 | `이름: {id, rank, portrait, unit}` | 전용 일러스트 경로 |
| `events.json` | 30 | 도시·장수 매칭 시 전투 도입 연출 | |
| `domestic_events.json` | 24 | 월정산 중 내정 이벤트 | |
| `bonds.json` | 40 | 장수 숙적·인연 관계 | |
| `quotes_and_ranks.json` | 10관작 | 관작 단계(현령→황제)·봉급·병력 보너스·대사 | |
| `scenarios.json` | 4 | 옛 단순 시나리오(현재는 `historical_scenarios.json` 사용) | |

---

## 5. 코드 진입점 (읽는 순서)

1. **부팅** — `js/app.js` `startGame(fresh)`: `loadCities → loadScenarios → loadClasses → loadEvents → loadGenerals → loadBonds → loadDomesticEvents → loadQuotesAndRanks → loadTopArt → loadTechTree → loadPassives → loadTreasures` 순으로 `fetch`한 뒤 시나리오 선택창(`openScenarioPicker`) 또는 지도(`SK.showMap`)로.
2. **새 게임** — `beginScenario(sc, factionId)` → `newState()` → `enrichFactions()`(계열·초기 식구 제한) → `appointDefaults()` → `enforceLordGovernor()`(군주=태수) → `seedRoster()` → `giveStarters()`(전속 보물) → `assignGarrisons()` → `seedTalents()`(주점).
3. **지도** — `js/map.js` `SKMap`: 캔버스 4장 `#map-terrain`(지형) / `#map-territory`(세력 영토) / `#map-features`(숲·산·강) / `#map-routes`(길·해로). 성 좌표는 `SK.CITY[id].u,v` (0~1), 지도 논리 크기 2000×1333.
4. **내정** — `SK.openCity(id)` → 성 화면. 건물 슬롯은 `SLOT_MAX = {capital:8, town:5, pass:2, fortress:3}`(`js/app.js` 1623행), `slotCount(type)`. `다음 달` 확인창(3663행) → `advanceMonth()`(3714행)가 세수·군량·인구·기술 보정·자동 내정·사건을 처리하고 HUD와 성 화면을 다시 그립니다.
5. **전장** — `SK.startBattle(opts)`(js/battle.js 71행) → 맵 타일 문자열(`SK.MAPS[type]`) → 배치 → `loop()/draw()`. 격자 상수 `TILE = 64, N = 18, WORLD = N * TILE`.
6. **전투 수치** — `effAtk/effDef/magicAtk/magicDef`(약 1386~1410행), 강화·약화는 `u.buffs[k] = {v, t}`(t=턴, 만료 시 삭제), 병과 기술 효과는 `data/classes.json`의 `effect` 문장을 `applyClassData`가 `kind`(heal/healArea/buffAreaAllies/debuffDef/debuffAtk/magicArea/power)로 해석해 붙입니다.

---

## 6. 게임 규칙 요약

- **지도**: 77거점 = 대도시·소도시·관문·요새. 육로 102개 + 해로 9개. 한국(고구려·백제·신라 계열)·대만 포함, 일본 제외. 섬(탐라·대만)은 배로만.
- **전장 유형**: 도시=**공성전 고정**, 관문=산전, 요새=요새전. 수전은 바다를 건너는 행군·요격전에서 쓸 예정(`SK.battleTypeFor`).
- **내정**: 성마다 건물 슬롯, 담당 장수에 따라 생산 50~150%, 장수는 **월 1행동**. `다음 달` → 확인창(대기 장수 N명) → 월 배너 → 월정산.
- **인재**: 주점 등용(성 인근·길로 이어진 성), 탐색(금 0, 월 행동 소모)으로 보물·은거 인재·의용병·산적·맹수·일기토. 성당 장수 상한 **99명**.
- **경제**: 시작 금 1성 1,200~1,500 / 대세력 2,500~4,000, 월 세수 성당 금 +700~800. 병력 상한 = 인구의 **17%**(`cityCap`). 정찰 45 · 유언비어 80 · 이간계 100 · 화친 200.
- **명성·관작**: 명성 오르면 관작 승진 → 봉급·병력 보너스.
- **전투**: 18×18, 이동·공격·책략·아이템, 병과 배지, 사거리(궁수 4·궁기 4·연노 5·포차 5·발석차 7), 성문 2배 피해(공성 병기), 경험치·레벨업.

---

## 7. 절대 깨면 안 되는 규칙 (사용자가 직접 정한 것)

1. **모바일 세로 390×844 우선.** 사용자는 **PC가 없고 폰만** 씁니다. 데스크톱 레이아웃을 먼저 만들면 안 되고, 엄지가 닿는 하단에 주요 버튼을 둡니다(내정 화면 오른쪽 아래 `지도` 버튼 등).
2. **UI에 한자를 쓰지 않는다.** 코드에 `hanja` 필드가 남아 있지만 `js/data.js` 끝부분에서 병과·스킬·인물·전장 유형의 `hanja`를 전부 `''`로 비웁니다. 새 데이터를 넣을 때도 한자를 화면에 내보내지 마세요.
3. **날짜는 아라비아 숫자 월.** `190년 1월` 형식(`SK.dateLabel`). `정월`·`건안 5년` 같은 표기 금지.
4. **군주는 언제나 자기가 있는 성의 태수.** `enforceLordGovernor()`가 강제하고, `appointDefaults()`는 군주를 태수·군사 자동 임명에서 뺍니다. 관아 문구도 `대기 장수 N명` 기준.
5. **계열(위·촉·오·군웅·한국)을 섞지 않는다.** `SK.EARLY_RETAINERS`(30세력·255명) 밖 인물을 `enrichFactions`가 끌어오면 고증 오류로 취급됩니다. 예: 190 유비 평원 = 유비·관우·장비·간옹·손건·미축·미방·유염·진도 9명.
6. **길은 자동 생성하지 않는다.** `SK.ROAD_EDGES`(손으로 고친 102개)가 진실이고, 자동 최소신장트리는 금지입니다. 바다를 건너는 육로 금지(`SK.SEA_ONLY_PAIRS`), 섬은 같은 섬끼리만(`SK.ISLAND_GROUP`), 해안 우회는 `SK.ROAD_VIA` 꺾은점. 수정 후 **`SK.roadIssues()`가 `[]`인지 확인**하세요.
7. **병과 수치는 두 곳에 있다.** `js/data.js`의 `SK.CLASSES`(atk/def/mp 등)와 `data/classes.json`(이동·사거리·지형보정·승급 이름·스킬). 런타임에 `SK.applyClassData()`가 후자로 전자를 덮어쓰므로, **한쪽만 고치면 화면과 실제가 어긋납니다.**
8. **SD 그림 경로는 `SK.CLASS_UNIT` → `SK.JOB_UNIT` → `assets/units/job_*.webp`.** 상위 100명은 `assets/units/top100/{id}.webp` 전용 경로가 우선입니다.
9. **여성 초상은 `SK.FEMALE_GENERALS`(24명)만.** 남성 장수에게 `gen_muhui`를 주면 안 됩니다(v5.0.3에서 고친 버그).
10. **화풍**: 따뜻한 황토·올리브 **수채화 + 먹선**, 2등신 치비 SD. 코에이 원화를 베끼지 않고 오리지널로 그립니다(저작권 선).

---

## 8. 다음 작업 ① — v5.1 전장 개편 (A 완료 · B~E 남음)

사용자 요청 원문: *"일단은 공성전도 맵부터 조조전처럼 바뀌어야 더 알 수 있을 거 같아."*

### A. 공성전 맵을 직교(정면/쿼터뷰)로 — ✅ v5.1에서 완료(`0ed569e`, `?v=12`)

> 완료 내용: `siegeMap()` 재작성(성문 2칸·해자·관아 `H`), `buildSiegeLayer()` 코드 드로잉 레이어, `passable/moveCost`에 `H` 반영, 아군·적 배치 좌표 재조정. 검증 `tools/v51_siege_verify.py`·`v51_tap_check.py`·`v51_perf.py`.
> 남은 것: 성문에 내구도가 없어 부수는 개념이 아직 없습니다(성문 타일은 통행 가능). 3~4턴 성문 파괴를 원하면 별도 작업.

- **문제**: 지금 공성전은 ① 타일 자체가 사선입니다 — `siegeMap()`(js/data.js 1201행)이 성벽 x를 `wx = 12 + Math.floor(y*3/17)`로 밀어 대각선 벽을 만들고, ② 배경도 원근 사선 그림(`assets/maps/v2/battle_siege.webp`)을 `draw()`(battle.js 518행)에서 그대로 깔아 격자와 그림이 따로 놉니다.
- **목표**: 《조조전》 공성전처럼 **정면에서 본 직교 맵**. 위쪽(원경)에 성, 아래쪽(근경)에 공격 진영.
  - 가로로 곧은 **외벽**(`C`) + 중앙 **성문 2칸**(`G`) + 문 앞 **길**(`R`)
  - 성 앞 **해자**(`W`, 건널 곳은 여울 `S`/다리 `B`)
  - 성 안 **마당**(`D`)과 안쪽 **궁궐/관아** 블록
  - 성 밖은 평지(`P`)·숲(`F`)·산(`M`)으로 공성 병기 자리와 우회로를 만든다
- **그리는 방법**: 배경 래스터를 없애고 `draw()`에서 **캔버스로 지형을 직접 그립니다**(지도 `js/map.js`의 레이어 드로잉 방식을 참고). 벽·기와·해자 물결·흙바닥 텍스처는 코드 드로잉으로. 필요하면 `assets/maps/`에 직교 타일셋을 새로 만들되, **격자와 1:1로 맞는** 이미지여야 합니다.
- **주의**: 타일 문자를 바꾸면 `SK.TERRAIN`(def·cost·icon), `passable()`, `moveCost()`, `drawTerrainTint()`, `drawTerrainBadge()`를 함께 갱신. `SK.enemySlots('siege')`·`SK.allySlots('siege')`도 새 배치에 맞춰 다시 잡아야 하고, 포차(mov 2, rng 5)·발석차(mov 1, rng 7)가 성문까지 닿는지 반드시 확인.
- **합격 기준**: 화면에서 격자선과 벽·성문·해자가 어긋나지 않고, 성문 앞 2칸이 길이며, 1턴에 아군이 해자까지, 3~4턴에 성문을 부술 수 있다.

### B. 2~3턴 행군 + 요격전 4~5종

- 지도에서 출진하면 곧바로 전투가 아니라 **2~3턴 행군**을 거치고, 도중 확률적으로 **요격전**이 걸립니다.
- 요격전은 이름 붙은 전장 4~5종(예: 관도·장판·적벽·오소·계교) 풀에서 고르고, 지형·적 편성·도입 대사가 달라야 합니다.
- 상태(`SK.state`)에 행군 큐(출발지·도착지·남은 턴)를 추가하고, `다음 달`/턴 진행과 연결. 저장 구조가 바뀌므로 `SAVE_KEY` 버전 업 또는 마이그레이션 필요.

### C. 수전 — 물 칸에서 `조각배`

- 지금은 `수적`만 물 위를 지나갑니다. **아무 부대나 물 칸(`W`)에 들어가면 자동으로 조각배를 타고 이동**하도록.
- 구현: 이동 경로에 물 타일이 있으면 `u.aboard = true`로 두고 `drawUnit()`에서 배 SD로 교체. 새 SD `assets/units/job_boat.webp`(2등신, 수채화) 필요. 물 위에서는 공격력·방어력 패널티, 상륙 시 해제.

### D. 책략 범위 미리보기

- `[책략]`을 누르면 지금은 사거리 안 대상 버튼 줄이 뜹니다(v5.0.1). 여기에 **바닥 하이라이트**를 더합니다 — `magicArea`(radius 1~2)는 영향 범위를, `healArea`는 아군 범위를, 단일기는 대상 칸만. `drawHighlights()`에 반경 강조를 추가.

### E. SD 스프라이트 수정 (사용자가 직접 지적)

1. **남성 군악대가 무희 SD를 씀** — `js/data.js` `SK.CLASS_UNIT`에 `gunakdae: 'muhui'`가 남아 있습니다. `gunakdae`(또는 `JOB_UNIT.gunakdae = 'drum'`)으로 바꾸면 간옹·유염 같은 남성 악사가 북병 SD를 씁니다. (초상은 v5.0.3에서 `gen_gunak_m`으로 이미 고침 — SD만 남음)
2. **기병·궁기병 SD를 말 탄 모습으로** — `assets/units/job_cavalry.webp`, `job_horse_archer.webp`를 관우처럼 **말 위에 앉은** 2등신으로 다시 그립니다(현재는 서 있는 그림). 같은 계열 다른 `job_*.webp`와 키·비율·광원을 맞출 것.

---

## 9. 다음 작업 ② — v5 남은 기능 (v5.1 다음)

| 순위 | 항목 | 메모 |
| --- | --- | --- |
| 1 | **건물 Lv.1~5 외형 변화** | 지금은 같은 아이콘 + 별 표시. `assets/scenes/city_lv4.webp`가 **없어서** `SCENE_FILE`이 4→`city_lv3`를 대신 씀(app.js 2412행). lv4 아트부터 만들 것 |
| 2 | 행상인 상점 | 정기 방문, 보물·군량·병력 거래 |
| 3 | 신무장 생성 | 이름·병과·능력치 배분 |
| 4 | 일기토·설전 | 장수 1:1 연출 + 무력/지력 판정 |
| 5 | 설정·도감·연대기 | 볼륨·배속·턴 종료 확인, 장수/보물 도감, 내 세력 연표 |
| 6 | 1회성 상점 BM | 스토어 결제 구조(웹에선 잠금 해제형) |
| 7 | 전법·이명 병종 | 위 호표기 · 촉 백이병 · 오 금범적 등 + 내정 특기(신속 수송·대량 보급) |
| 8 | 중국 B·C급 장수 100명 추가 | 585 → 약 700명 |
| 9 | 2프레임 공격 모션 | SD에 공격 프레임 추가 |
| 10 | 지도 개요 모드 «전체 이름 보기» 토글 | 멀리서 감춘 이름을 길게 눌러 보기 |

**기술 트리는 이미 연결됐습니다** — `SK.TECHS`(24종) UI(`openTech`), 연구(선행·금), 효과 `SK.techPct('atkPct'|'defPct'|'goldPct'|'foodPct'|'popPct'|'wallPct'|'recruitPct')`가 내정·전투에 실제 반영됩니다(`js/battle.js` 149~150행, `js/app.js` 2670·2722·3723~3734행). 남은 일은 **트리 확장**(기술 추가·새 보정 키)이지 "연결"이 아닙니다.

---

## 10. 검증 체크리스트 (배포 전)

```js
// 콘솔에서 (앱이 수집하는 오류 배열)
window.__errs.length            // 0 이어야 함
SK.CITY_LIST.length             // 77
SK.ROAD_EDGES.length            // 102
SK.roadIssues()                 // [] 이어야 함 (끊긴 길·바다 관통·겹침 감사)
Object.keys(SK.CLASSES).length  // 19
```

1. **390×844** 뷰포트(headless 브라우저)로 새 게임 → 유비(평원) 시작.
2. 지도: 팬(드래그)·줌(+버튼)·내 성 탭(내정 진입)·적성 탭(미정찰 시트→정찰 45금) 동작, 이름·아이콘 겹침 0.
3. 내정: 공터 건설(금 차감 확인) → 담당 지정 → `다음 달` 확인창 → 월 배너 → 월정산 숫자 변화 → 같은 화면 유지.
4. 인사: 주점 등용, 장수 상세 5능력치·숙적 배지·보물 슬롯.
5. 전장: 출진 → 배치 → 이동·공격·책략 → 강화/약화 배지(3턴) → 승리.
6. 라이브에서 `?v=`를 올려 실제 폰으로 확인.

---

## 11. 함정 (시간 아끼는 메모)

- **fetch 때문에 무조건 http 서버.** `file://`로 열면 거점·장수 데이터가 비어 지도가 빕니다.
- **`js/mapgeo.js`는 자동 생성 파일**입니다. 손으로 고치면 다음 생성에서 날아갑니다.
- **`game.js`(112KB)·`style.css`(34KB)는 레거시**입니다. index.html이 로드하지 않으니 고쳐도 화면은 그대로입니다. 혼동 주의.
- **`data/classes.json`에 `발석차`가 없습니다**(18개, 군주 포함). 발석차는 `SK.CLASSES` 기본값을 씁니다. 그래서 화면 타이틀은 "18 병과", 코드에는 군주까지 19개(`SK.CLASSES`)입니다.
- **`assets/scenes/city_lv4.webp` 없음** → 4레벨이 3레벨 그림으로 보입니다(알려진 미완).
- **이미지 용량**: 저장소 14MB(322파일). Pages 1GB 한도 안이지만 폰 메모리를 위해 지도 캔버스는 1.35배 상한(`034c20a` 커밋)입니다. 큰 이미지를 넣을 때 webp·256px 규칙을 지키세요.
- **초상 크롭 규격**: 얼굴 높이 32%, 중심 (50%, 44%), 배경 투명 — 100장이 이 규격으로 맞춰져 있습니다. 새 초상도 같은 규격.

---

## 12. 작업 방식 (사용자 취향)

- 사용자는 **폰만** 씁니다. 결과는 "라이브 링크 + 스크린샷"으로 확인하는 걸 좋아합니다.
- 고증(계열·시대·지리)에 민감합니다. 새 장수를 넣으면 계열·등장연도를 반드시 맞추세요.
- 버전을 올릴 때 **`README.md` 맨 위에 변경 이력**을 같은 형식으로 추가하고, 완료/남은 일은 `V5_ROADMAP.md`에 반영합니다.
- 커밋 메시지는 `v5.0.4 — 핵심 한 줄, 세부 한 줄` 형식(한국어).

---

## 13. 복붙용 시작 프롬프트

```
너는 《꼬마영웅 천하통일》 웹게임을 이어서 개발하는 개발자다.
저장소: https://github.com/hojin8811-dev/samgukji-jojo1 (main)
라이브: https://hojin8811-dev.github.io/samgukji-jojo1/?v=11
먼저 저장소 최상위의 HANDOFF.md 를 끝까지 읽고, README.md 와 V5_ROADMAP.md 로 최신 상태를 확인해라.

[프로젝트] 모바일 세로 390×844 우선, 정적 HTML/CSS/JS(빌드 없음), 후한 말 삼국 배경 턴제 전략.
전국 지도 77거점 내정 + 《삼국지 조조전》식 18×18 격자 전장. 585장수·19병과·4시나리오.
GitHub Pages가 main 브랜치를 그대로 서빙한다. 배포는 push 후 index.html의 ?v= 숫자를 +1.

[절대 규칙] UI에 한자 금지 / 날짜는 "190년 1월" / 모바일 390×844 우선 / 군주는 자기가 있는 성의 태수
/ 위·촉·오·군웅·한국 계열 혼합 금지 / 도로는 SK.ROAD_EDGES 손수 고정(자동 생성 금지, SK.roadIssues() 0 유지)
/ 병과 수치는 js/data.js SK.CLASSES 와 data/classes.json 두 곳 모두 수정(런타임에 후자가 덮어씀)
/ 코에이 원화를 베끼지 말고 오리지널 수채화·먹선 2등신 화풍 유지.

[이번 작업 = v5.1 전장 개편, 우선순위 순서대로]
1) 공성전 맵 직교화: 지금은 siegeMap()이 성벽을 사선으로 밀고 배경도 원근 그림이라 격자와 어긋난다.
   위쪽에 가로로 곧은 외벽+성문2칸+문 앞 길, 성 앞 해자(여울/다리), 성 안 마당과 궁궐 블록으로 18×18 타일을 다시 설계하고,
   배경 래스터 대신 캔버스로 지형을 직접 그려라. SK.TERRAIN·passable()·moveCost()·enemySlots/allySlots도 함께 맞춰라.
2) 행군 2~3턴 + 요격전 4~5종(관도·장판·적벽·오소·계교 등), 출진→행군→요격/공성 흐름.
3) 수전: 물 칸에 들어가면 자동으로 조각배 탑승(새 SD job_boat 필요).
4) 책략 범위 바닥 하이라이트(magicArea·healArea).
5) SD 수정: SK.CLASS_UNIT.gunakdae가 'muhui'라 남성 군악대가 무희로 나온다 → 북병으로.
   기병·궁기병(job_cavalry·job_horse_archer)을 말 탄 모습으로 다시 그려라.

[검증] 390×844 headless로 새 게임→내정→건설→다음 달→출진→전투 승리까지 돌리고,
window.__errs 0, SK.CITY_LIST 77, SK.roadIssues() [] 를 확인해라. 끝나면 바뀐 파일·검증 결과·남은 일을 요약해라.
```

---

*이 문서는 v5.0.3 기준입니다. 큰 변경이 있으면 이 파일도 같이 갱신해 주세요.*
