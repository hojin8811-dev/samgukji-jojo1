# 인수인계서 — 《꼬마영웅 대난투》

> 이 문서 하나만 읽으면 바로 이어서 개발할 수 있게 정리했습니다.
> 기준: **v5.48** 관아(본부) 배속 · 군주·태수 5능력치 소폭 가산점 · 2026-11-22 · 라이브 `?v=65`
> 함께 보면 좋은 문서: `HANDOFF_PROMPT.md`(복붙용 지시서) · `README.md`(버전별 변경 이력) · `V5_ROADMAP.md`(완료/남은 일 상세) · `DESIGN.md`(초기 설계)

---

## 0. 30초 요약

| 항목 | 내용 |
| --- | --- |
| 무엇 | 후한 말~삼국 시대를 무대로 한 **턴제 전략 웹게임**. 전국 지도에서 내정하고, 싸움만 《삼국지 조조전》식 18×18 격자 전장으로 벌인다. |
| 화면 | ① 타이틀 → ② 천하 지도 → ③ 성 내정 → ④ 격자 전장 (모바일 세로 **390×844** 우선) |
| 기술 | **정적 HTML/CSS/JS 뿐.** 빌드 도구·프레임워크·번들러 없음. 데이터는 `fetch()`로 JSON 로드. |
| 저장소 | `https://github.com/hojin8811-dev/samgukji-jojo1` (기본 브랜치 `main`, 최상위 폴더에 그대로 배포) |
| 라이브 | `https://hojin8811-dev.github.io/samgukji-jojo1/` (캐시 버스터 `?v=65`) |
| 규모 | 80거점(대도시 12·중도시 20·소도시 37·관문 9·요새 2) · **701장수**(json 596 + 시나리오·재야 인물 105, 한국 181) · 19병과(군주 포함) · 고유특기 100 · **보물 250** · 기술 24 · 시나리오 4(190/200/208/220) · 요격전 8종 · **24/28/32 대형 전장·미니맵·1×1 본진/마을** |
| 배포 | `main`에 push → GitHub Pages가 몇 초 뒤 자동 반영. 별도 CI·워크플로 없음. |
| 다음 목표 | 8라운드까지 실플레이·실기기 제보를 반영(사기·상태이상 장기전 튜닝, 3턴 원정 야영/강행군, 미니맵 확대, 도감 전원 열전·획득 경로, 주점 누수 0, 훈련·일괄 탐색, 뒤로가기 종료 확인, 침공 요격 출진). 다음 후보는 실폰 재확인, 조각배 2프레임 SD, 도감 검색, 전투 중 실시간 EXP, 성 3단계 등급 |

---

## 0.0 v5.48 — 관아(본부) 배속 · 군주·태수 5능력치 소폭 가산점 (2026-11-22 · `?v=65`)

`관아`를 시설 칸을 쓰지 않는 **성의 본부**로 만들고, 본성은 군주·지성은 태수가 자동으로 머리에 앉아 능력치만큼 작은 가산점을 주게 했다. 밸런스가 무너지지 않게 상한을 정치 8%·나머지 6%로 못 박았다.

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 머리 배속 | `SK.officeHeadOf(cityId)` — 본성은 군주(`factions[PF()].lord`), 지성은 임명 태수(`cs.governor`). 없으면 `null` → `태수 미임명 — [태수 임명]으로 배속`. 시설 uid를 쓰지 않아 **이번 달 행동·출진을 잠그지 않음** | `js/app.js` `officeHeadOf` |
| 가산점 | `SK.officeBonusOf(cityId)` = `min(cap, max(0,(stat-40)×0.0012))`. `SK.OFFICE_CAPS = {pol:0.08, tong:0.06, wu:0.06, ji:0.06, cha:0.06}`. 표기 `SK.officeChips`/`officeChipHtml` | `js/app.js` |
| 적용처 | 정치 → 세수(`advanceMonth`·`econForecast`)·시장·공방·농원·**대수확(`harvestOf`)**·[징병] / 통솔 → 병영 징병·매달 자동 징집·연병장·[훈련]·[징병] / 무력 → 순찰소 치안·치안 하락 지연·**도적 억제(`runBandits`)** / 지력 → `schemeGuardOf`(+`SCHEME_CAP.office=0.06`, 합계 80% 캡)·`runSpyOffices`·`spyStrike`·`openEstrangeGen` / 매력 → `explore`·`recruitChance` | `js/app.js` |
| UI | `[시설]` 탭 맨 위 고정 카드 `#hq-card`(초상·직함 배지·5칩·`?`), 관아 창 맨 위 `.office-hq` 머리 카드. 미임명이면 카드가 태수 임명 창을 연다 | `js/app.js` `renderCitySlots`·`openOffice`, `css/game.css` `.hq-card`·`.office-hq`·`.oh-chip` |
| 도움말 | `HELP_TIPS.office` 신설(카드·창의 `?` 점), `📖 입문서 ② 건물`의 관아 항목 재작성 | `js/app.js` `HELP_TIPS`·`INTRO_BLD` |
| 검수 | 로컬 390×844 — 본성 `[군주] 유비`·지성 `[태수] 관우`·미임명 표기, 5칩, 정치 8%·나머지 6% 상한, 계략 방어 86%→**80%**, 세수 441→422·대수확 3,259→3,123·병영 +69→+63·순찰 +1.159→+1.100(머리 없을 때), 행동 미잠금, 콘솔·pageerror·4xx 0. 캡처 `preview/v548_local/` | `tools/qa_v548.py` |

**실례 주의** — 가산점은 `effStat`(보물 보정 포함)으로 계산한다. 정치 100이 +7.2%, 매력 90 이상이 +6.0%에서 멈추므로 S급 군주를 앉혀도 생산이 10%를 넘지 않는다.

---

## 0.0 v5.47 — 아군 공격 우선 · [성에서 기다리기] 1턴 지연 · 세력 위치 미리보기 · 앱 아이콘 (2026-11-22 · `?v=64`)

실기기 제보 세 개("내가 먼저 쳤는데 왜 얘네 먼저 전쟁이냐" · "요격을 안누르면 한턴 지연하는게 맞지 않아?" · "군주를 누르면 지도상 어느 위치인지 알면 좋겠어")와 앱 아이콘 1번안을 묶은 패치.

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| ① 도착 우선 | 같은 달 우리 원정 도착(공성전)이 적 침공(수성전)보다 먼저 열린다. `promoteMarchQueue`가 `pendingInvasion` 설정 여부와 무관하게 도착을 꺼내고, `armPendingWatch`·월정산 [계속]·AI 관전(`devObsStep`)의 순서를 도착 → 침공으로 통일 | `js/app.js` `promoteMarchQueue`·`armPendingWatch`·월정산 actions·`devObsStep` |
| ② 기다리기 | 침공 창 `[성에서 기다리기]` → 수성전 다음 달 지연. 침공이 `invasionQueue`로 돌아가 `due = turn+1`이 되고, 지도에 붉은 `⚔ 내달 성 아래` 표식. `promoteInvasionQueue`가 `due` 미래 항목을 보존 | `js/app.js` `deferSiege`·`promoteInvasionQueue`, `js/map.js` `syncMarchMarks`·`placeMarchMarks`, `css/game.css` `.siege-soon` |
| ③ 세력 미리보기 | 세력 카드 탭 → 미니 지도 모달(육지 폴리곤 + 세력색 영토 원 + 도로·해로 + 내 거점 반짝임·수도 링 + 이웃 라벨·이웃 세력 줄 + 군주 초상·시작 장수 칩) → `[이 세력으로 시작!]`로만 개전 | `js/app.js` `openFactionPreview`·`drawFactionMiniMap`, `css/game.css` `.fprev*` |
| ④ 앱 아이콘 | 유저 지정 1번안(1,254², 검은 라운드 코너)을 1.14배 줌 크롭으로 풀블리드화 → `icon-512`·`icon-192` 교체, `apple-touch-icon.png`(180) 신설, favicon·manifest `?v=64` | `assets/icons/`, `index.html`, `manifest.webmanifest` |
| ⑤ 도움말 | 내정 탭 인구·농업·상업 `?` 점 + `HELP_TIPS` `pop`·`agri`·`comm` | `js/app.js` `renderCityDev`·`HELP_TIPS` |
| ⑥ 검수 | 로컬 390×844 — 미리보기 모달(캔버스·반짝임·버튼·개전), 도착 우선(첫 창 = 도착), 기다리기(due=turn+1·표식·다음 달 재개), 도움말 점 3종. 콘솔·pageerror·4xx 0. 캡처 `preview/v547_local/` | `tools/qa_v547.py` |

---

## 0.0 v5.46 — 치안 계략방어(성벽 합산 80%) · 초보자 입문 가이드 · 탐색 단일 방식 (2026-11-22 · `?v=63`)

친구 실플레이 제보 반영. 성마다 새 창을 여는데 "삼국지를 처음 하는 사람이 뭓부터 해야 하는지 모른다"는 말과 "치안이 있는 이유를 모르겠다"는 말을 같이 풀었다.

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| ① 계략 방어 | `SK.schemeGuardOf(cityId)` = `min(0.80, wallBlock + orderBlock)`. 성벽 55%(Lv·담당 통솔) + 치안 25%(50→100 선형) = **최대 80%**, 100% 차단 없음. `SK.SCHEME_CAP`에 세 값을 둔다 | `js/app.js` `orderGuardOf`·`schemeGuardOf` |
| ② 적용처 | AI 첩보소 유언비어(`runSpyOffices`)가 `wallGuardOf` 대신 합산 방어를 쓰고, `wall[]` 항목에 `wallBlock·orderBlock·order`를 실어 보냄. 월정산 `[성벽 방어]` → **`[계략 방어]`** + `차단 N% = 성벽 N% + 치안 N%` | `js/app.js` `runSpyOffices`·`advanceMonth` |
| ③ 도적 | 치안 40 미만 성은 달마다 `3%+(40−o)×1.2%` 확률로 금(최대 280)·병력(≤0.9%) 손실 → 월정산 **`[도적 출몰]`**. 도움말이 오래전부터 적어 둔 '병력이 샌다'를 처음으로 실제화 | `js/app.js` `runBandits` |
| ④ 표기 | 시설 카드 칩 `방첩 N%`→**`계략방어 N%`**, 성벽 상세에 `성벽 → N% + 치안 → N% = N%` 내역·게이지·80% 상한 안내, `HELP_TIPS.order`·`HELP_TIPS.wall`·`showHelp` 문구 재작성(내정 탭 성벽·치안 ? 버튼) | `js/app.js`, `css/game.css` |
| ⑤ 입문 가이드 | `SK.openIntroGuide()` — 탭 ①자원·민심·치안 ②건물 9종 ③징병·출진. 표지·지도 날짜 띠·성 화면 그림·메뉴 네 곳에서 열림. 1년차 1월 첫 성 진입 시 `localStorage.sk_intro_seen` 없으면 한 번 자동 | `js/app.js` `openIntroGuide`·`maybeAutoIntro`·`openCity`, `index.html`, `css/game.css` |
| ⑥ 탐색 | `openExplore`의 `[한 명씩]`/`[여러 명 한번에]` 탭·`sendOne` 제거 → 체크 후 `[탐색 보내기]` 한 가지. 1명이면 사연 카드, 여러 명이면 결과 목록 | `js/app.js` |
| ⑦ 미방 능력치 | `data/generals.json` id 33 미방 — 통솔 58→**75**, 무력 64→**74**(지력 52·정치 60·매력 41 유지). `rebalanceTiers` 점수 63.4→**72.9**, 전체 순위 575/701 — 표시 등급 **B**(원본 A 보호선 `orig A→C`만 막으므로 B가 적절). 실전에서 수성 보급 창병으로 쓸 만해짐 | `data/generals.json` |
| ⑧ 검수 | 로컬 390×844 — `schemeGuard` 55+25=**0.80(>0.80 아님)**, 치안 100/62/50/40/30→25/6/0/0/0%, AI 첩자 차단 보고, 입문서 자동 1회 후 재진입 없음, 탐색 탭 0개·1명/2명 결과, 콘솔·pageerror·4xx 0. 캐냒 `preview/v546_local/` | `tools/v546_qa.py` |

**실례 주의** — 성벽 방첩 55%는 담당 통솔 185 이상이어야 포화된다(`0.25 + 0.05 + (통솔−60)×0.002`). 통솔 100이면 39%, 그래서 현실 조합은 39+25=64% 선이다. 상한 80%는 '불가능한 100%를 막는 안전장치'로 남겨 둔다.

---

## 0.0 v5.43 — 누락 장수 6명(안중근·김좌진·김구·홍범도·서서·한현) + SD 회색 주머니 정리 (2026-11-22 · `?v=59`)

v5.42(통합 전장 SD 353장·마을 개편, `?v=58`)의 뒤처리다. v5.42에서 **그림만 있고 장수가 없던 6명**을 세우고, 잘라 낸 SD 안에 남아 있던 **닫힌 회색 배경 주머니**를 지웠다.

| 갈래 | 내용 | 파일 |
| --- | --- | --- |
| ① 장수 6명 | `data/generals.json`에 id **591~596** 추가 — 안중근(한국·S·궁수 89/95/86/74/93, 등장 190) · 김좌진(한국·S·기병 96/94/82/71/88, 190) · 김구(한국·S·책사 76/40/90/94/96, 190) · 홍범도(한국·S·연노병 95/92/80/65/90, 190) · 서서(촉·S·책사 84/54/92/82/88, 등장 205·출생 168) · 한현(군웅·B·검병 66/68/55/60/58, 180). 총원 697 → **701** | `data/generals.json` |
| ② id 충돌 회피 | 상위 100 매니페스트의 id 372~375는 **최영·설총·임경업·김응하**의 것이라 그대로 두고, 안중근·김좌진·김구·홍범도의 초상·SD를 `assets/portraits|units/top100/591~594.webp`로 rename + 매니페스트 id·경로 갱신 | `data/top100_art_manifest.json` |
| ③ 서서·한현 승격 | `SK.EXTRA_GENERALS`(재야 보충)에서 빼고 generals.json으로. 초상·SD는 `assets/*/v520/seoseo|hanhyeon.webp` 그대로, `v58_art_manifest.json` id만 701·704 → 595·596 | `js/data.js`, `data/v58_art_manifest.json` |
| ④ 개그 한마디 | 6명 named 대사 추가 | `data/hero_gags.json` |
| ⑤ SD 회색 주머니 | 시트 배경색과 픽셀 차 ≤12인 닫힌 덩어리 중 **코어 평균 차 ≤2.5 · 넓이 ≥100px**만 알파 0 → export_v542와 같은 정규화로 재저장. **59장 / 39,668px**(하후연 2,601·황충 2,021·손상향 2,029·양만춘 1,878·문추 1,808). 353장 재측정 발끝 y=241 이탈 0 | `tools/pocket_v543.py`, `assets/units/**` |
| ⑥ 검수 | 로컬 `preview/v543_qa/`(before/after·마젠타) + 라이브 390×844에서 6명 등용·전장 SD·도감 검색 확인 | `preview/v543_qa/` |

**주의** — 등급은 `SK.rebalanceTiers`가 능력치 피라미드로 다시 매긴다. 그래서 데이터 등급 S인 **서서는 실제 표시가 A(75위)**, B인 **한현은 C(646위)**다. 화면에서도 S/B로 고정하려면 `SK.TIER_LOCK`에 넣거나 능력치를 올려야 한다(서서 S는 지력 96+, 한현 B는 무력·통솔 78+).

**다음에 SD를 다시 손볼 때** — `tools/pocket_v543.py`의 `VETO`에 `(이름, label)`을 넣으면 그 덩어리는 건드리지 않는다. 흰 소매·흰 수염처럼 배경색과 3 이상 차이 나는 '칠한 흰색'은 원래 제외되지만, 3.0 근처에서 애매한 것이 나오면 눈으로 보고 VETO에 넣는 것이 안전하다.

---

## 0.0 v5.41 — 2차 감사 10건 수정 (2026-11-22 · `?v=57`)

`preview/v541_audit/REPORT.md`의 10건을 고쳤다. **`assets/units/`는 손대지 않았다**(통합 병과 시트 교체 작업과 충돌 방지).

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| ① 세이브 삭제 확인 | `[data-del]` 핸들러가 곧바로 지우던 것을 `슬롯 N 삭제 / 이 슬롯의 저장 데이터를 삭제할까요? … / 되돌릴 수 없습니다` + `취소·지우기` 모달로. 자동 저장도 같음 | `js/app.js` `SK.openSaveSlots` |
| ② 징집 보고 = 실제 | `const draftGain = Math.round(160*base); st.troops = clamp(st.troops+draftGain,0,cityCap(st)); pop += st.troops - before` — 보고와 실제 충원이 같은 값 | `js/app.js` `advanceMonth` |
| ③ 첩보소 재야 대상 | `spyTargets`에서 `owner !== 'neutral'` 제거. 대상 0이면 카드 `이웃 적성 없음`(`.sc-craft.warn`) + 월정산 1회 안내(`sl.spyIdleNoted`), 경험치 절반 | `js/app.js` `spyTargets`·`runSpyOffices`·`runSlots`·`renderCitySlots` |
| ④ 일기토 조건 | `SK.pickEvent`가 제목·트리거에 나온 장수(`SK.eventGenNames()`)를 검사 — 내 군에 있으면 점수 0(제외), 수비 장수가 아니면 점수 ≤2(성 이름만으로 미채택) | `js/data.js` `SK.pickEvent` |
| ⑤ 지도 상단 띠 | `clampCam` pad 0, 지도 그림 로드 시 `#world-viewport`에 같은 그림 배경 + `has-bleed`(흐림 레이어). 축소 시 여백도 지도색 | `js/map.js` `clampCam`·`loadBg`, `css/game.css` `.world-viewport::before` |
| ⑥ 전투 시작 시야 | 시작 시 `본진 + 모든 부대`의 경계 상자로 `cam.s = clamp(min(fit, 0.8), 0.42, 0.8)` 후 중심 정렬 | `js/battle.js` `initCanvas` |
| ⑦ 미니맵 기본 접힘 | 폭 450px 미만이면 `mmOpen = false`로 시작(토글 26px), 접힘 상태는 `.mm-collapsed` | `js/battle.js` `bindMinimap`, `css/game.css` `.mm-toggle` |
| ⑧ 시설 카드 | `.sc-owner` flex-wrap + `em` ellipsis, 담당 없는 카드는 `부장 없음` 생략 | `js/app.js` `renderCitySlots`, `css/game.css` |
| ⑨ 도움말 수치 | `SK.SLOT_MAX`·`SK.CAP_RATE`·`SK.ESTRANGE_COST`·`SK.SCOUT_SPAN`에서 문구 생성(도움말·정보 시트) | `js/app.js` `showHelp`·`openCitySheet` |
| ⑩ 출진 병력 표기 | `SK.DEPLOY_MIN(1,000)`·`SK.DEPLOY_BASE(2,000)` 상수화, 장수 상세 `출진 최소 1,000 · 기본 2,000 / 상한 10,000`, `openDeploy`도 같은 상수 사용 | `js/data.js`, `js/app.js` `showHeroInfo`·`openDeploy` |
| 검수 | 로컬 `preview/v541_audit/`·라이브 `preview/v541_live/` 390×844 — 10건 확인, 콘솔/pageerror/4xx 0. 라이브 `?v=57` 수성전 자동전투 **9턴** 정상 진행(양 진영 HP 감소·페이즈 교대, 적군 페이즈 프리즈 없음) | `preview/v541_audit/`·`preview/v541_live/` |

**참고** — 헤드리스 Chromium(이 샌드박스)에서는 소리를 켜고 DPR 2로 자동전투를 돌리면 60~100초쯤 페이지가 응답하지 않는 경우가 있었고, 같은 조건이 **수정 전 v5.40 라이브에서도 동일하게** 나타났다(게임 로직 정지가 아니라 렌더·오디오 부하). 소리를 끄고 DPR 0.5로 돌린 검수에서 9턴까지 정상 통과했다.

---

## 0.0 v5.40 — 감사 10건 수정 · 보물 250 · 공방 제작 · 성벽 방첩 · 정책 수치 (2026-11-22 · `?v=56`)

`samgukji-jojo/preview/v540_audit/REPORT.md`의 실플레이 지적 10건을 모두 고치고, 보물 250종·공방·성벽·정책을 완성했다.

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| ① 요격전 복구 | 요격전 도중 새로고침·앱 종료 → 행군이 살아 있으면 **병력을 성으로 돌려보내지 않고** `marchQueuePush(s,'intercept',marchId)`로 요격 사건을 다시 예약한다. 안내 `전투 중 이탈 · 요격전부터 다시 시작합니다` 뒤 같은 요격전(요격대·지형 유지)이 다시 열린다. 같은 블록에서 일반 전투 복구가 `PF()`(아직 이전 판)를 써 세력을 못 찾던 문제도 `s.playerFaction` 직접 판정으로 고쳤다 | `js/app.js` `SK.load`(battleInProgress 블록)·`startGame`(battleRecover.resume), `js/battle.js` `startBattle`(battleInProgress에 `marchId·intercept·raiders`) |
| ② 상단 총병력 | 지도 상단 병력을 `totalTroops() + marchTroopsOf(s)`로. 행군 중이면 `#map-troops-march`에 `+4k`, `#map-troops-cell` title에 `총병력 … — 주둔 … · 행군 …` | `js/app.js` `refreshHud`, `index.html` `#map-troops-march` |
| ③ 병과 배지 | `drawUnit`의 병과 배지를 HP 알약 **위 줄**(`by2 = pillY - bh2 - 2`)에 따로 그린다. 밀집(dense/veryDense)·축소(tinyView)에는 한 글자로 축약 — 옆 칸과 부딪혀 생략되던 경로를 없앴다 | `js/battle.js` `drawUnit` |
| ④ `.sc-need` | `.sc-up`과 같은 알약 규칙(`margin-left:auto; white-space:nowrap; border-radius:6px`). `[담당이 빈 건물]` 안내(`.slot-hint`)도 9.5px로 (본문 크기로 커져 화면을 덮던 문제) | `css/game.css` |
| ⑤ 탐색 버튼 | '한 명씩' 모드에서 주 버튼 `display:none`, 목록 위 안내 `보낼 장수의 카드를 누르면 바로 출발합니다`. '여러 명'에서만 `N명 탐색 보내기` | `js/app.js` `openExplore` |
| ⑥ 건설 머리말 | `대부분의 건물은 담당이 없어도 50%… 첩보소는 담당이 있어야만 돌고, 공방은 담당이 있어야 보물을 만듭니다` | `js/app.js` `openSlot` |
| ⑦ 첫 안내 | `아래 [시설 관리](왼쪽 첫 칸)` | `js/app.js` `GUIDE_LINES[1]` |
| ⑧ 수도로 버튼 | 세력 글자 대신 `#ic-capital` 성·깃발 SVG, 세력 색은 버튼 테두리, title/aria `수도로 — {본성명}` | `index.html`, `js/app.js` `refreshHud`, `css/game.css` |
| ⑨ 중복 건설 | 이미 지은 건물은 `{건물}을 한 채 더 지을까` 확인 창(효과 합산 설명·금액·금고). 확인 전 결제 없음. 카드에 `· 2채째` 표기 | `js/app.js` `openSlot` |
| ⑩ 빈 부대 카드 | 선택 없음이면 `.unit-card.empty` — 초상·Lv·EXP·병력/스탯 줄 숨김, `부대를 고르면 병과·병력·사거리가 보입니다`. 아래 상태줄도 `부대를 눌러 선택하세요` | `js/battle.js` `refreshUI`, `css/game.css` |
| 보물 250 | `data/treasures.json` 250종(152~250 99종: 일반 35·희귀 34·영웅 20·전설 10). `statBonus.int` → `intel` 정규화, 갈래 `문물·비보·병법서`는 manual 칸, `GRADE_COLOR.일반`, 도감 등급/갈래 필터(갈래 칩은 두 줄로 접음) | `data/treasures.json`, `js/data.js`, `js/app.js` `openCodex` |
| 보물 효과 훅 | 새 훅 `food·spy·loyalty·recruit·train`을 `TREASURE_FX_KEYS/LABEL`에 추가하고, 수전·화계·화공·성곽/성 방어전·산악 이동·적 약화·등용/동맹·도시 세금/무역/문화 수입·정찰 성공률·사거리·일기토·부상 확률 규칙을 보강. 비용 문구는 `note`(미적용)로 정직하게 남김. 신규 153절 중 123절 판정 연결, 30절 미적용 | `js/data.js` `TREASURE_FX_RULES`·`parseTreasureFx`, 적용: `js/app.js` `harvestOf`·`econForecast`·`runSlots`·`runSpyOffices`·`spyStrike`·`advanceMonth` |
| 공방 제작 | 담당이 앉은 공방은 매달 `sl.craft + 1`, 3개월째 보물 1개. 등급 확률 = 공방 Lv·담당 (정치+지력)/2 가중(일반/희귀/영웅/전설), 전설 0.5~3%. `SK.TREASURES` 중 미보유·일반 경로 보물에서 고르고 `s.treasures`·도감에 넣는다. 카드 `제작 1/3`, 상세 창 진행 바, 월정산 `[공방 제작]` | `js/app.js` `CRAFT_MONTHS`·`workshopCraft`·`runSlots`·`renderCitySlots`·`openSlot`·`advanceMonth` |
| 성벽 방첩 | `wallGuardOf(cityId)` = `Lv×5%`(+담당이면 +5% + 통솔 보정), 최대 55%. AI 첩보소 유언비어 판정에 `Math.random() < block`이면 차단하고 월정산 `[성벽 방어]`에 `…의 첩자를 성벽 순라가 막았습니다 (차단 30% · 담당)`. 카드 `방첩 28%`, 상세 창 설명 | `js/app.js` `wallGuardOf`·`runSpyOffices`·`advanceMonth`, `css/game.css` `.ws-craft` |
| 정책 수치 | `policyFxOf(cs)` — 균형 `{gold,food,harvest,recruit,train,wall:0.05}`, 상업 `{gold:0.25,recruit:-0.15}`, 농업 `{gold:-0.10,harvest:0.30,food:0.10,loyalty:2}`, 전시 `{gold:-0.15,recruit:0.30,train:0.30,wall:0.10,loyalty:-1}`, 수송 `{supply:1}`. 세수·시장·공방·농원·수확·병영·연병장·성벽 보수·징병 명령·월 민심에 실제 적용, **본성 포함**. 관아 방침 버튼에 `fxShort` 수치, 아래 `지금 적용 — …` 요약 | `js/app.js` `POLICIES`·`policyFxOf`·`econForecast`·`harvestOf`·`runSlots`·`CMDS`·`advanceMonth`·`openOffice`·`openTransport`·`runAutoDomestic` |
| 검수 | 로컬 390×844 `preview/v540_local/` — 요격 복구(병력 중복 0·큐 중복 0), 일반 복구 병력 +3,000 반환, 상단 총병력, 5부대 밀집 배지(군·기·도·기·궁기), 공방 2/3→완성(영웅), 성벽 Lv4 차단 30%·28%, 정책 5종 수치 비교, 도감 250·일반 35, 12개월 무인(보물 3개월마다 1개·콘솔 0) | `tools/v540_*.py` |

**남은 판단** — ① 신규 보물 중 비용·예측·명성 계열 30절은 판정이 없어 '미적용'으로 남는다(기술 연구 비용·건설 비용을 실제로 깎으려면 별도 작업). ② 정책은 성마다 따로라, 여러 성을 가진 중반에는 성마다 방침을 맞춰야 효과가 크다(본성 포함 적용). ③ 성벽 방첩은 AI 첩보소(성에 lab이 남은 경우)에만 걸린다 — AI가 첩보소를 새로 짓지는 않는다.

---

## 0.0 v5.39 — 첩보소(옛 연구소) + 전투 조작 4건 (2026-11-22 · `?v=55`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 시설 개편 | 내성 시설 `lab`의 이름·능력치를 **`첩보소`(지력 `ji`)** 로 바꿨다. `desc` = `담당 배속 시 매달 주변 적성 자동 첩보·이간·유언비어`, 담당이 없을 때 카드에 뜨는 문구는 `담당 없음 · 자동 첩보 정지`(다른 시설의 '효과 50%'와 달리 아무 일도 하지 않는다는 뜻). 건물 그림 자산(`assets/buildings/lab*.webp`)은 그대로 쓴다 | `js/app.js` `SLOT_DEFS.lab`·`SLOT_HALF.lab` |
| 기술 연구 유지 | 기술 연구는 **시설과 무관**하다. 상단 [기술 연구]는 예전처럼 금만 내고 24종을 연구하며, `lab`이 뽑던 `st.rp`(쓰이지 않던 연구 포인트)는 없앴다. 도움말에 '연구는 성 안 시설과 상관없이 할 수 있다'를 명시 | `js/app.js` `runSlots`·`openTech`·`SK.showHelp` |
| 자동 첩보 | 담당(지력) 장수를 앉힌 성은 달이 바뀔 때 이웃 적성 **한 곳**을 **금 없이** 정찰한다. ①아직 정찰 안 한 성 ② `scoutedUntil - turn <= 1`(만료 임박) 성을 우선하며, `scoutedUntil = turn + 3`(3개월)과 `scoutedFrom`·`scoutedBy`를 채운다 | `js/app.js` `runSpyOffices`·`spyOfficeAt` |
| 자동 계략 | 이미 정찰한 이웃 적성 하나에 확률 `clamp(0.30 + 0.07·Lv + (지력−60)·0.006, 0.15, 0.9)`로 계략을 편다. 적장이 있으면 55% 확률로 **이간계**(충성 가장 낮은 장수 `충성 −(8 + 2·Lv + 0~3)`), 아니면 **유언비어**(`민심 −(5 + Lv + 0~2)`, 하한 10). 성공 시 담당 공훈 +2, 실패는 '들통'으로만 센다. 부장을 앉히면 지력 ×0.4만큼 확률이 오른다. 같은 성은 `spyHitTurn`으로 **2달 쉬어 가므로** 한 성만 매달 파고들지 않는다 | `js/app.js` `runSpyOffices`, `js/app.js` `setEnemyLoyal` |
| 월정산 보고 | 월정산에 **`[첩보소 첩보]`** 칸을 넣어 성마다 한 줄로 보고한다 — 예: `낙양 첩보소 · 이유 — 완 정찰 (3개월) · 완 이간계 성공 — 장훈 충성 62→52`, `… · 유언비어 성공 (민심 −7)`. 실패만 있으면 `첩보 N건은 들통` | `js/app.js` `advanceMonth` |
| AI 첩보소 | AI는 시설을 짓지 않으므로 평소엔 돌지 않는다. 단, 플레이어 성을 빼앗아 **첩보소가 남은 성**은 달마다 12% 확률로 이웃 우리 성에 소문을 뿌린다(`민심 −2`) — 천하 소식에 한 줄 | `js/app.js` `runSpyOffices` |
| 무한 이동 차단 | 부대에 `movedThisTurn`을 두고, 이동하면 세운다. **이미 이동한 부대는 선택을 풀었다 다시 골라도** `mode='act'`, `reachCache=null`이라 파란 이동 범위가 열리지 않는다(예전엔 재선택마다 이동 범위가 되살아나 한 턴에 계속 걸었다). 턴이 바뀌면 `acted=false`·`movedThisTurn=false`·`turnStartX/Y`를 다시 잡고, `nextUnitOrWait`는 아직 걷지 않은 부대를 먼저 고른다 | `js/battle.js` `selectUnit`·`moveUnit`·`enemyPhase`·`nextUnitOrWait` |
| 공격 사거리 표시 | **[공격]을 눌렀을 때 적이 사거리 안에 있든 없든** 사거리(`minRng~effRng`) 타일을 붉은 주황으로 칠하고 테두리(마름모 윤곽)를 긋는다. 공격 모드에서는 파란 이동 범위를 깔지 않아 사거리만 보이고, 하단 안내도 `사거리 3칸 안에 적이 없습니다 — 한 칸 더 붙으세요`로 칸 수를 적는다 | `js/battle.js` `drawHighlights`·`renderTargetBar` |
| 뒤로가기 = 이동 취소 | 이동만 하고 아직 행동하지 않은 부대가 있으면 기기 뒤로가기(popstate)가 후퇴 확인 대신 **턴 시작 좌표로 되돌린다** — `movedThisTurn=false`, `movedTiles=0`, 파란 이동 범위 복원, 토스트 `이동을 취소하고 제자리로 돌아왔습니다`. 공격·책략 대상을 고르는 중이면 그 선택만 먼저 물리고, 되돌릴 이동이 없으면 예전처럼 후퇴 확인 창 | `js/battle.js` `undoMove`·`SK.battleUndoMove`, `js/backguard.js` `backAction` |
| 행동 완료 표시 | `u.acted`인 부대는 SD를 `brightness(0.62) grayscale(0.5)`로 어둡게 그리고 발치에 **✓ 배지**(어두운 원 + 금색 체크)를 단다. 턴이 돌아와 `acted=false`가 되면 그대로 밝아진다. 적군 부대에도 같은 규칙 | `js/battle.js` `drawUnit` |

**검수(390×844 로컬 `preview/v539_local/` → 라이브 `preview/v539_live/`)** — (1) 공터 → [첩보소] 건설 금 220, 카드 `첩보소 Lv.1 담당 없음 · 자동 첩보 정지`, 담당에 지력 91 이유를 앉히자 `효과 117% · 담당 이유`, (2) 다음 달에 `완`(미정찰)이 `scoutedUntil 5`=3개월 정찰 + `이간계 성공 — 장훈 충성 62→52`, 월정산 `첩보소 첩보` 줄 표시, (3) 이동 → 다른 부대 → 재선택에서 `mode='act'`·`reach=null`·제자리 탭에도 좌표 불변, (4) `SK.battleUndoMove()` → 턴 시작 좌표 복귀·`movedThisTurn=false`·이동 범위 51칸 복원·토스트, 곧바로 재이동 성공, (5) 도사(사거리 3)로 [공격] → 적 0명인데 사거리 마름모 표시 + `사거리 3칸 안에 적이 없습니다`, 적을 붙이자 그 타일이 붉게 + `적 선택 마등 1,500`, (6) [대기] 후 스프라이트가 어두워지고 발치에 ✓, (7) 콘솔·pageerror·404 0.

**라이브 추가 검수(`?v=55`, `preview/v539_live/back_*.png`)** — 진짜 뒤로가기(`history.back()` → popstate → `backguard.backAction`)로 확인: 이동 전 `[7,23]`·`movedThisTurn=true`·`reach=null` → 뒤로가기 → `[10,22]`(턴 시작)·`movedThisTurn=false`·`mode='move'`·이동 범위 51칸 복원·모달 없음·토스트 `이동을 취소하고 제자리로 돌아왔습니다` → 같은 부대를 다시 굴러 재이동 성공. 12개월 무인 진행(`tools/v539_soak.py`)에서 매달 0~1건의 첩보·계략 보고, 콘솔·pageerror 0.

> 남은 판단: ①첩보소는 담당이 없으면 아무 일도 하지 않는다(다른 시설의 50%와 다름) — 카드 문구로만 알리고 있어, 필요하면 '담당 없이도 절반 확률로 정찰'로 완화할 수 있다. ②이동 취소를 반복하면 마을 점령(`sitePhase`)은 되돌아오지 않는다(마을은 한 번만 점령되므로 이득이 쌓이진 않는다). ③공격 모드에서 나가는 길은 뒤로가기뿐이다 — 필요하면 [공격] 재탭으로 토글.

---

## 0.0 v5.38 — 전투 턴 표시 강화 + 본진 점령 사기 역전 (2026-11-22 · `?v=54`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 턴 표시 | 상단 `1턴`(13px 얇은 글씨)을 **`2턴째` 20px·900 굵기 금빛**으로 키우고, 어두운 금테 상자 안에 `아군`/`적군` 페이즈 배지를 함께 넣었다. 적군 페이즈에는 상자·글씨가 붉게 물든다. 390px에서 제목 줄임 없음(60×48px, 제목 130px) | `index.html` `.battle-turnbox`·`#battle-turn`, `css/game.css` `.battle-turnbox`(gap 8→6), `js/battle.js` `refreshUI` |
| 본진 점령 = 사기 역전 | 적 본진을 밟으면 **즉시 승리 대신** 1회 점령 처리 → 아군 전군 `사기 +25`(상한 110)·적군 전군 `사기 −25`(하한 0). 아군 본진을 적이 밟으면 반대(적 +25·아군 −25). 전투는 계속되고 **승패는 전멸로만** 갈린다 | `js/battle.js` `captureHQ`·`hqMoraleShift`(상수 `HQ_MORALE = 25`), `finishCheck` |
| 점령 연출 | 턴 배너(`적 본진 점령!` / `본진 점령당했다!`) + 피드/토스트 `적 본진 점령! 아군 사기 +25 · 적군 사기 −25` + 타일 위 `본진 점령!` 글자·파문·화면 진동(drum). 부대마다 `사기↑/↓ 25` 숫자가 뜬다 | `js/battle.js` `captureHQ` |
| 점령 표시 | 점령된 본진 타일은 **점령한 진영 색**(아군=파랑, 적=빨강)으로 테두리·바탕이 바뀌고, 라벨이 `적 본진 · 점령`으로, 타일 오른쪽 위에 같은 색 **깃발**이 꽂힌다. 미니맵 점 색도 같다 | `js/battle.js` `drawSites`·`drawMinimap` |
| 목표·문구 정리 | `B.objective` = `적 전멸`(수성전은 `성을 지켜라 — 적을 전멸시켜라`), `BATTLE_TYPES.objective` 10종에서 '적 본진을 점령하라' 삭제, 도움말에 [본진과 사기] 항목 추가 + [승리] 문구 교체 | `js/battle.js` `B.objective`·`finishCheck`, `js/data.js` `BATTLE_TYPES`, `js/app.js` `SK.showHelp` |
| 지도 조작 버튼 (같이 수정) | v5.26의 가로 1줄(`169×34`)이 성 정보 시트의 `[출진·공격]`·`[정찰 보내기]`·`[닫기]` 위를 덮었다(실기기 스샷) → **우측 세로 1열**(34/34/27/27/27 · 간격 4 · 165px)로 복귀. 시트가 열린 동안(`#screen-map.sheet-open`, `:has(#city-sheet:not([hidden]))`)에는 조작 버튼과 범례를 `display:none`. 시트 `hidden` 변경은 `MutationObserver`로 잡아 클래스를 맞춘다 | `css/game.css` `.map-controls`·`sheet-open`, `js/map.js` `syncSheetOpen` |

**검수** — 390×844 로컬(`preview/v538_local/`·`preview/v538_map/`)·라이브(`preview/v538_live/`): (1) 턴 표시 `1턴째` 20px/900·상자 60×48·제목 줄임 없음, 적군 페이즈에 `.battle-turnbox.enemy` 적용, (2) 평야전에서 아군 1부대를 적 본진에 올리고 `finishCheck` → `captured:'ally'`, `over:false`, 아군 100→**110**(상한), 적군 100→**75**(−25), 목표 `적 전멸`, 배너·피드·토스트 문구 일치, (3) 두 번째 `checkFinish`에서 사기 불변(1회 처리), (4) 아군 본진을 적이 밟으면 적 110·아군 75·배너 `본진 점령당했다!`, (5) 타일 색·깃발·`· 점령` 라벨·미니맵 색 확인, (6) 지도 조작 버튼 세로 1열 34×165·하단 바·경제 줄·AI 관전 바와 겹침 0(각 8px 간격 유지), 시트 열면 `display:none`(시트 버튼과 겹침 0) → 닫으면 복귀, 범례도 같이 숨김, 고르기 모드에서는 우측 상단, (7) 콘솔·pageerror·404 0.

> 남은 판단: 턴 한도(24칸 30턴·28칸↑ 40턴)에 걸리면 여전히 패배 처리다. 본진 점령으로 끝나지 않게 바뀌었으니 장기전에서 30턴을 넘겨 패하는 판이 나올 수 있다 — 필요하면 한도 상향을 다음 패치에서 검토.
>
> 배포 메모: 같은 날 세 번(v5.38 본수정 `?v=52` → 지도 조작 버튼 수정 → CSS 폴백 분리) 커밋해 캐시버스터를 `?v=54`로 올렸다. 앞선 번호로 CSS·JS를 한 번 받은 폰은 10분(max-age)씩 묵은 파일을 볼 수 있어, 마지막 번호로 끊는다.

---

## 0.0 v5.37 — 개발자 전용 AI 관전 모드 (2026-11-22 · `?v=51`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 진입 조건 | 주소에 `dev=hojin`이 있을 때만 관전 바를 만든다. 일반 주소(`?v=51`)에서는 이 블록이 DOM을 하나도 만들지 않는다(요소·문구 검사 0) | `js/app.js` `DEV_OBS_ON`·`devObsInit`, `css/game.css` `.dev-obs` |
| 관전 바 | 지도 [내 본성]·[다음 달] 위에 `▶ AI 관전`/`⏸ 정지`, `×1/×3/×10`, `연월 · 생존 세력 수 · 1위 세력(성 수)`, 최근 전투·함락 1줄 로그. `data-on/months/battles/captures`도 단다 | `js/app.js` `obsPaint`·`obsLog` |
| 자동 내정 | 관전 중 매달 성마다 공터 건설 → 건물 배속(`autoAssignDuty`) → 개간·상업·징병·보수·훈련·민심(위임 판단 `chooseDelegatedAction` 재사용) → 증축(`pickAutoUpgrade`) → 이웃 성 수송 | `js/app.js` `devObsPrepare`·`devObsBuild`·`devObsDelegate`·`devObsUpgrade`·`devObsTransport` |
| 자동 출진 | 성 전력 대비 1.25배 이상 우세한 이웃 성만, 병력 6,000 이상·원정대가 없을 때 55%까지 편성(장수 최대 6 + 창병대), 출진 보급 군량 확인 후 `startMarch` | `js/app.js` `devObsSortie` |
| 전투 | 인트로 카드 자동 넘김 → `toggleAuto(true)` · 배속 ×4 · `setTimeScale(4)`. 끝난 전투(`B.over`)는 결과 창 처리로 넘긴다 | `js/app.js` `devObsBattle` |
| 모달 자동 | 요격=싸운다, 성 앞 도착=시작, 침공=수성전, 후퇴 확인=계속 싸운다, 그 밖엔 primary → 없으면 마지막 버튼 → 선택지(`.cc-opt`)·포로(`.prison-opt`). 시작/불러오기/덮어쓰기 창은 취소. 천하통일·패망에서 정지 | `js/app.js` `devObsModal` |
| 흐름 | 한 달 = 이벤트(행군 도착·요격·침공) 처리 → 내정 → `SK.advanceMonth()`. 창이 뜨는 900ms를 `settleUntil`로 덮어 두 번 넘어가지 않는다 | `js/app.js` `devObsStep`·`devObsAdvance` |
| 정체 감시 | 같은 턴·페이즈에 연출 변화 없이 20초가 지나면 `finish()`로 한 번 재촉하고, 8초 더 멈추면 그 전투만 닫고 다음 달로 넘어간다(로그 ⚠). 전투 상태를 한 번에 보는 QA 훅 `SKBattle.debug.state()` 추가 | `js/app.js` `devObsStallWatch`, `js/battle.js` `debug.state` |
| 관전 바 갱신 | 관전을 켜기 전에도 지도 화면에서 1.5초마다 연월·세력·1위를 다시 칠한다(처음엔 '판 없음'으로 남아 있었다) | `js/app.js` `devObsInit` |

**검수** — 390×844 로컬/라이브(`preview/v537_live/`)에서 (1) 일반 주소 `?v=51`에는 관전 바·`SK.devObs`·'AI 관전' 문구가 모두 0, (2) `?v=51&dev=hojin` 동탁군으로 관전 시작 → **1년차 7월(6개월)까지 무정지**, 전투 2회·점령 1회·모달 19개 자동 처리, 바에 `세력 28 · 1위 조조군 3/80 · ◈ 함락 …` 표시, (3) 함곡관 산전에서 `×4 배속`+[자동] 켜진 채 진행, (4) 강제 침공 → 침공 창 → 수성전 배치 → `낙양 수성전` 자동 ×4 → '낙양을 지켰습니다' → 지도 복귀, (5) [⏸ 정지]에서 달이 더 흐르지 않고 [▶]로 재개. 콘솔·pageerror·404 0.

> 참고: 이번 라이브 검수 첫 판(6개월 조건을 채우기 전)에서 **적군 페이즈가 5턴에 40초 넘게 멈춘 채 풀리지 않는 전투**를 한 번 관찰했다(수성전, 성문 손상 전). 재현은 되지 않았고(로컬 280초·280초 두 판 무정지), 위 정체 감시가 그 경우에도 관전을 이어 가게 한다. 전투 AI 자체의 원인은 아직 규명 전이다.

## 0.0 v5.36 — 지도 타겟 선택 + 공성 마무리 (2026-11-22 · `?v=50`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 지도 타겟 선택 | 목록 창 대신 지도를 열고, 고를 수 있는 성만 금빛으로 두드린다. `[출진]`(적성)·`[정찰]`·`[이간계]`·`[계략/유언비어]`·`[항복 권고]`·`[장수 전출]`·`[수송]`·`[수송 중시 목적지]`가 모두 지도에서 목적지를 고른다. 고를 수 없는 성은 흐리게 + 토스트, 출발 성은 파란 점선 `출발` 배지 | `js/app.js` `pickCityOnMap`·`endMapPick`·`cancelMapPick`, `js/map.js` `setPick`·`paintPick`·`focusPicker`, `index.html` `#map-pick-bar`, `css/game.css` `#screen-map.picking` |
| 지도 선택 UI | 하단 `지도에서 고르기` 바(제목·안내·`고를 수 있는 성 N곳`·[취소]), 아이콘 위 배지(수비병·미정찰·장수 수·빈자리·주둔 수), 고르는 동안 하단 [내 본성]·[다음 달]과 경제 줄을 숨기고 조작 버튼을 위로 | 위와 같음 |
| 뒤로가기 | 지도 선택 중 안드로이드 뒤로가기 = 취소(출발 성 화면으로 복귀), `SK.mapPickActive()`·`SK.cancelMapPick()` | `js/backguard.js` |
| 군량 잔여 횟수 | 전투 하단 `[군량]` → `군량 (2)`처럼 부대의 남은 횟수 표시, 0이면 `군량 (0)` + 잠금·흐림 | `js/battle.js` `paintItemButton`·`useItem`, `css/game.css` `.act.item` |
| 공성 마지막 적 우선 | 생존 적이 2부대 이하일 때 적이 이번 턴에 닿거나 성문 안쪽이 아니면 성문 타격 후보를 버리고 적 섬멸·접근을 고른다 (허창 공성전 11턴 `적 368 포차`를 두고 허저가 안쪽 성문을 치던 제보) | `js/battle.js` `planAuto`(`fewFoes`·`foeBehindGate`·`foeHitPossible`·`skipGate`) |
| 외교(휴전·동맹) | 세력은 땅이 아니라 지도 탭으로 고르기 어려워(27세력이 전국에 흩어짐) **목록 유지** — 성 대상 명령만 지도 선택 | `js/app.js` `openPeace` |

**검수** — 390×844 로컬/라이브에서 진류(조조군) 시작으로 출진·정찰·이간계·유언비어·항복 권고·전출·수송·수송 중시 목적지의 지도 선택, 취소(바 버튼·뒤로가기), 고를 수 없는 성 안내, 보물창(개발자 문구 없음·전설 전용 무기 차단), 증축 경험 `120/200/300/420`, 전투 `군량 (2)→(1)→(0)`, 공성 AI 세 경우(적이 옆=공격 / 같은 편 멀리=접근 / 성문 안쪽=성문)를 스샷으로 확인. 콘솔·pageerror·404 0.

## 0.0 v5.35 — 내정편 마감 (2026-11-22 · `?v=49`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 건설·증축 비용 | 공터 `300→220`, 증축 `550/1,200/2,600/5,200 → 350/700/1,300/2,200`. 시장 Lv.1→2가 5달이면 회수 | `js/app.js` `ECON.buildNew`·`ECON.buildUp` (`buildCost`·`upgradeAll`·`pickAutoUpgrade`가 같은 표를 본다) |
| 침공 템포 | 배율 1.20→1.35, 경고 1곳(성 6곳↑ 2곳), 막으면 두 달 천하 조용(`invasionCalmUntil`)·성은 석 달 쉼(`lastRepelledTurn`), 침공군 상한 = 성 전력 ×2.4 | `js/app.js` `planPlayerInvasion`·`runAiCampaigns`·`markInvasionRepelled`, `js/battle.js` `defenseVictory`·`invasionInterceptVictory` |
| 창 하단 바 | `.modal`을 flex로 바꾸고 본문만 `.modal-body`에서 굴린다. [확인]·[닫기]는 늘 화면 아래 (예전 390×844에서 y=1,371) | `js/app.js` `SK.modal`, `css/game.css` `.modal`·`.modal-body` |
| 시설 안내 | 카드의 `수입 50%`를 건물별 실제 효과로, 담당·부장 고르기 머리글, 증축까지 걸리는 달 수를 실제 월 증가량(`slotExpMonthly`)으로 | `js/app.js` `SLOT_HALF`·`slotExpMonthly`·`openSlot` |
| 관아·목록 UI | 본성 자동 내정 스위치 → 안내문, 탐색 `파견 가능` 작게, 한 명 모드 버튼 문구, 정찰 조사, 위임 보고 줄 정렬, 말풍선/지도 버튼 겹침, 토스트 위치 | `js/app.js`·`css/game.css` |

**검수** — 390×844 로컬/라이브에서 성 3탭, 시설(건설·증축·모두 증축·배속), 관아(일괄 내정·포상·관직·태수·군사), 주점 등용, 탐색, 전출, 외교, 기술, 군사(징병·훈련·출진 편성), 월정산, 저장 슬롯을 열어 스샷 검수. 콘솔·pageerror·404 0.

## 0.0 v5.33 — 9라운드 + 실기기 제보 13건 (2026-11-22 · `?v=47`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 190 조선·맹획군 0명 | `assignGarrisons`가 `startGenerals`(확정 명부)를 등장 연도로 다시 걸러 조선 10·맹획군 11이 통째로 빠졌다 → 명부는 연도 검사를 건너뛴다. `SK.rosterAudit()`로 28세력 전수(0명 0·빈 성 0·명부=주둔) | `js/app.js` `assignGarrisons`·`rosterAudit` |
| 도감 검색 | 인물·보물 탭 위 검색창(모은 것 우선, 미수집은 이름+`미수집`), 보물은 이름·효과·경로로도 검색. 결과 수 표시 | `js/app.js` `codexSearchBar`·`codexGenCells`·`codexTreRows`·`codexRefresh`, `css/game.css` `.cdx-search` |
| 보물 지역 경로 | 151종 전부 `전투/탐색 — 지역(성)` 표기, 지역 가중치(전투·탐색 4~8배) 실제 적용. 지역 힌트 없는 46종은 '전국 어디서나' | `js/data.js` `TREASURE_REGIONS`·`treasureWhere`·`treasurePathText`, `js/app.js` `explore`·`rollTreasure` |
| 전투 중 실시간 EXP | 명중 9·처치 42·치유 8을 즉시 `SK.gainExp`, 레벨업 시 부대 공·방·MP·기술 재계산 + `Lv.N!`. 전투 종료 정산은 참전·승리 보너스만 | `js/battle.js` `battleExp`·`recalcAlly`·`growMul`·`debug.exp()` |
| 자동 턴 종료 | 아군 전원 `acted`면 400ms 뒤 `endTurn()`. 모달·연출 중 재예약(최대 8회), 턴 시작 전원 행동불가도 같은 경로 | `js/battle.js` `scheduleAutoEndTurn`·`canActAlly`·`nextUnitOrWait` |
| 공성 수비대 위치 | `enemySlots`(siege)가 맨 바깥 성문 밖 밴드를 수비 자리로 써서 6부대가 들판에 스폰 → 그 밴드 제거 + `y >= outermostGate` 컷 | `js/data.js` `SK.enemySlots` |
| 장수 복수 전출 | 전체/대기만/해제·인원수·목적지 선택, 담당/태수/군사 자동 해제, 행군 중 잠금, 정원 99 | `js/app.js` `openTransferPick`·`openTransferDest`·`doTransferMany` |
| 본성 = 군주 자리 | `syncPlayerCapital`을 저장·불러오기·전출·월말 정산에서 호출. 행군·포로 중이면 유지 | `js/app.js` `syncPlayerCapital`·`SK.save`·`SK.load` |
| 요격전 이름/재요격 | 요격 객체에 `faction`·`from`·`genIds` 전달, `faction` 계산에서 `intercept.faction` 우선. 패배 시 `inv.intercepted` 후 곧바로 수성전 배치 | `js/battle.js` `startBattle`·`invasionInterceptDefeat`, `js/app.js` `openInterceptSortie`·`openPendingInvasion` |
| 요격→수성 편성 유지 | 살아남은 적 부대(병종·장수·HP·레벨)를 `survivingEnemies`로 넘겨 수성전에서 그대로 재편성, 격파분 제외 | `js/battle.js` `invasionInterceptDefeat`·`startBattle`(surv), `js/app.js` `startDefense` |
| 적 침공 장수 | 침공 건에 출발 성 장수 최대 6명, 요격전 `intercept.genIds` 전원, 수성전 `defGens` 1명 제한 제거 | `js/app.js` `runAiCampaigns`·`startDefense`, `js/battle.js` `defGens` |
| 보조 병과 후방 | 일반 전장에서도 풍수사·도사·군악대·무희·책사는 아군 전투 부대 뒤·적과 3~4칸 유지(`foeThreatAt`). 군주는 적극 전진(본진 위급 시만 수비), 전투 병과는 문관에 붙은 적 우선·길목 차단 | `js/battle.js` `planAuto`·`planSupportSkill`·`aiGoalOf`·`enemyAct` |
| 책략 사거리 +1 | 책사·풍수사·도사 `skRange` +1(3→4), `supportReach`도 +1, 스킬 창 `사거리 N` | `js/battle.js` `CASTER_RANGE_BONUS`·`skRange` |
| 수성전 교착 | 적 2부대 이하·아군 2배·성 밖 원거리만 남으면 문을 열고 출격(`defenseSortieNeeded`), 문 밖 아군은 계속 교전 | `js/battle.js` `defenseAllowed`·`defenseSortieNeeded`·`planAuto` |
| 미니맵 확대 | 32×32에서 148px 상한 + 확대 시 카메라 왼쪽 비키기 → 본성·성문 가림 0(벽 237칸 중 4칸) | `js/battle.js` `mmPx`·`shiftCamForMinimap` |
| 일기토 가드 | 같은 편·죽은 부대끼리 컷인 금지(`a.side === d.side → return`) | `js/battle.js` `duelCutin` |
| 내정 화면 사람 | 3px 점(`.sb-crowd`) 제거, 캔버스 도트 꼬마 인물(2등신·옷색 8종·모자 5종·걸음·그림자), 성 등급·시설 Lv·민심으로 인원 증가 | `js/app.js` `CityLife`(`ROLES`·`draw`·`spawn`·`renderSceneLevel`) |

**검증 메모** — 190 주둔 28세력 239/239·0명 0 / 도감 `이순신`→1명·`청룡`→2종·`기절`→1종 / 보물 경로 151·구체 지역 105 / EXP 명중 9·처치 42·치유 8·Lv.2에서 공 35→36 / 자동 턴 종료 6번째 [대기] 뒤 `phase=enemy` / 1·2·3중성 수비대 성 밖 0 / 전출 2명 이동·담당 해제 / 요격 패배→수성전 배치 자동 / 요격 생존 4부대 병종·HP 그대로 / 침공 장수 5명(수성)·4명(요격) / 보조 최소거리 3·3(순유·곽가) / 사거리 3→4 / 발석 1부대 교착 5턴 `적군 전멸` / 22성 14개월·전투 146회 오류 0.

**검증 훅** — `SK.rosterAudit()`·`SK.garrisonLeaks()`·`SK.syncPlayerCapital(s)`·`SK.doTransferMany(from,to,uids)`·`SK.skRange(u,sk)`·`SK.defenseSortieNeeded(home)`·`SK.treasureWhere(t)`·`SK.treasurePathText(t)`·`SKBattle.debug.exp()`·`SKBattle.debug.allActed`·`SKBattle.debug.autoEndPending`.

---

## 0.0 v5.32 — 8라운드 + 실기기 제보 9건 (2026-11-22 · `?v=46`)

390×844에서 24~31턴 장기전(수성전·32×32 공성)과 22성·24개월을 돌리고, 사용자가 안드로이드 실기기에서 보낸 제보를 함께 고쳤습니다.

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 사기·상태이상 장기전 | 사기 하한 25(항복하지 않음) · 턴 회복 1→2(사기 50 미만 3) · 기절에서 깬 뒤 2턴 기절 면역 · 같은 상태이상 반복 시 저항 누적(1/(1+0.4n)). 실측 사기 40→56(6턴), 기절 4회 시도 중 2회만 성공, 하한 25 | `js/battle.js` `initStatus`·`moraleShift`·`ailApply`·`ailPhase`, `debug.status`에 `stunCd`·`ailRes` |
| 3턴 원정 중도 야영 | 3일 행군 2일차에 `중도 야영지` — 야영·보급(군량 1,000명당 20, 병력 +2%, 사기 +12) / 강행군(병력 −4%, 사기 −4, 하루 당김, 적 사기 −8) / 그대로. 도착 창에 결과 한 줄 | `js/app.js` `stepMarches`·`openMarchCamp`·`marchCampCost`·`openPendingMarch`, `js/battle.js` `moraleBonus`·`surprise` |
| 미니맵 확대 | `⤢ 확대` 104→164px(화면 폭 42%, 최대 168), 점·범례·목표 띠 회피, 더블탭, 크기 기억(localStorage) | `js/battle.js` `mmPx`·`mmSetBig`·`buildMinimap`·`drawMinimap`·`bindMinimap`, `index.html` `#mm-size`, `css/game.css` `.mm-size`·`.mm-stage.mm-big` |
| 도감 | 인물 상세에 697명 전원 한 줄 열전(`gagOf`)·생년/나이/등장·주둔, 보물 목록에 획득 경로, 보물 상세 창(효과·능력치·부위·경로) | `js/app.js` `openCodexGen`·`openCodexTre`·`codexTreRows`, `css/game.css` `.cdx-hint`·`.cdx-tre-*` |
| 뒤로가기 | 첫 `pointerdown`/`touchstart`/`keydown` 때 히스토리 가드 재설치(안드로이드 크롬 skip 대응), 지도·타이틀에서 `게임을 종료하시겠습니까?`(계속하기/종료), 종료는 가드 항목을 최대 12칸 물러나 이탈 | `js/backguard.js` `ensureGuard`·`askExit`·`leave`·`backAction` |
| 주점 누수 (중요) | `assignGarrisons`가 성마다 3~4명만 앉히고 버리던 것을 전원 배치로(1성 세력 전원), `garrisonedIds()`로 주점·탐색·선택지·재충전에서 AI 세력 명부까지 차단. 성도 8명·진등=하비·요화=여남·주점 누수 0 | `js/app.js` `garrisonedIds`·`assignGarrisons`·`seedTalents`·`refillTalents`·`explore`·`choiceTalentPool`, QA `SK.garrisonLeaks()` |
| 훈련 | `cs.train` +7~11(예전 +2~4), 결과 창에 `병사 훈련도 50 → 59 (+9)` 배너·막대 | `js/app.js` `CMDS.train`, `css/game.css` `.train-banner`·`.tb-*` |
| 탐색 | 지휘관 정렬 `actorPoolBy`(대기 우선), `한 명씩 / 여러 명 한번에` 탭·전체 선택·N명 보내기·결과 요약 | `js/app.js` `openExplore`, `css/game.css` `.ex-tabs`·`.ex-*`·`.exr-*` |
| 대상인 칩 | 성 상단 `대상인 체류 N개월 ▸` 버튼 → `openRiceTrader`. 커서·눌림·aria | `index.html` `#city-merchant`, `js/app.js` renderCityHeader, `css/game.css` `.merchant-chip` |
| 침공 요격 출진 | 침공 창 `[요격 출진]` — 길목 8종 지형, 장수 선택·병력 분배(성 30% 잔류), 승리 시 성벽 피해 0·침공 격퇴·적 잔여 출발 성행·포로/보물, 패배 시 생존 병력 복귀·줄어든 적으로 수성전 재개 | `js/app.js` `openInterceptSortie`·`openPendingInvasion`, `js/battle.js` `invasionInterceptVictory`·`invasionInterceptDefeat`, `css/game.css` `.is-sum`·`.modal-actions` wrap |
| 타이베이 좌표 | `SK.CITY_COORD_FIX`에 `[0.738, 0.8327]`(1476, 1110) — 대만 섬 북부 내륙, 타이난과 52px | `js/city_geo.js` |
| 병력 배지 | 줌·밀집도 무관 `shortNum` 고정(2.7k/10k/729), 하단 카드는 정확 수치 | `js/battle.js` `drawUnit` |
| 전투 종료 규칙 (중요) | 총대장 격파 즉시 승패 제거 — 승패는 **전멸**만. v5.38부터 본진 점령도 즉시 승패가 아니라 **사기 ±25 역전**(1회)이다. 목표 `적 전멸`, 패배 창에 `패배 사유:` 표시(수성전·공성·요격·패망 공통). 수성전에서 선봉 1명 퇴각으로 13,935명 남기고 패배하던 사고 제거 | `js/battle.js` `finishCheck`·`captureHQ`·`B.objective`·`defeat`·`defenseDefeat`·`invasionInterceptDefeat`, `js/data.js` `BATTLE_TYPES.objective`, `js/app.js` `SK.gameOver` |

**검증 메모** — ① 사기 피해 611/548/486/470, 하한 25. ② 기절 4턴 시도 성공 1·중단 2·성공 1, `ailRes` 누적. ③ 야영 군량 5,000→4,880·병력 6,000→6,120·전장 사기 112, 강행군 병력 5,760·적 사기 92·하루 당김. ④ 미니맵 104→164px·목표 띠 겹침 0·탭 이동·기억. ⑤ 뒤로가기: 타이틀/지도 확인 창, 계속하기 유지, 종료 시 이전 페이지, 성→지도·창 닫기 유지. ⑥ 주점 116명 중 타 세력 0, 80성 재충전 후 0, `SK.garrisonLeaks()` 0. ⑦ 훈련 50→59→68. ⑧ 일괄 탐색 10명 acted·EXP +22/+10·결과 10줄. ⑨ 요격 승리 성벽 70 유지·pendingInvasion 정리·4,000 합류, 패배 시 7,812로 재개. ⑩ 22성 24개월 콘솔/pageerror/HTTP 0, 저장 67KB.

**검증 훅(다음 라운드)** — `SK.backGuard.info()`·`SK.garrisonedIds()`·`SK.garrisonLeaks()`·`SK.openInterceptSortie(inv)`·`SK.mmSetBig(bool)`·`SKBattle.debug.status(name).stunCd/ailRes`.

---

## 0.0 v5.31 — 7라운드 실플레이에서 잡은 수정 (2026-11-22 · `?v=45`)

390×844 실제 브라우저에서 진류(조조군)로 보물을 장착해 수전·도하전을 돌리고, 성 12곳·24개월과 다전선 원정을 진행한 결과입니다.

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 보물 사기·상태이상 | **사기**를 새 시스템으로 넣었습니다(0~110, 100 기준, 공격 ±16/18%, 큰 타격·아군 붕괴로 감소·턴 회복). **상태이상** 6종(기절·혼란·위축·중독·화상·둔화)을 넣고 보물의 부여·면역·저항·해제 확률을 붙였습니다. 병과 책략의 `기절 확률 N%`·`혼란`·`위축`·`사기 +N`도 같은 판정을 씁니다. **미적용 70절 → 0절**(보물 150종에 전장·내정 수치). | `js/data.js` `TREASURE_FX_KEYS`·`TREASURE_FX_RULES`·`FX_DEFAULT`, `js/battle.js` `AIL`·`initStatus`·`moraleMul`·`moraleShift`·`ailApply`·`ailPhase`·`onHitAil`·`skillAilOf`·`skillAilApply`·`skillMoraleOf`·`pursuitStrike`·`confusedStrike` |
| 사기·상태이상 UI | 병력 바 아래 사기 바(초록/노랑/빨강), 부대 위 상태이상 배지(기·혼·위·독·화·둔), 부대 카드에 `사기 N`·`혼란 2`·`조각배` 알약 | `js/battle.js` `drawUnit`·`refreshUI` |
| 수전 조각배 | 수전·도하전에서 **수적이 아닌 부대도 물에 들면 조각배**를 탑니다(물 1칸 2, 승선 첫 칸 2). 승선/하선에 물보라·글자·소식, 물결에 흔들림·V자 물길, 물 칸 잔물결 애니메이션. 물 위 공 −18%·방 −12%(수적 제외). 해자는 그대로 막힘 | `js/battle.js` `unitImgFor`·`moveCostBase`·`syncBoat`·`waterTileAt`·`drawWaterWaves`·`drawUnit`, `B.boatable` |
| 추격·전장 유틸 | 근접 처치 뒤 추격 확률로 65% 추가 공격, 근접 받는 피해·성문 피해·사거리 +1·책략 범위 +1·고유특기 재발동·패전 병력 손실 감소·이동 후 사격 −12% | `js/battle.js` `pursuitStrike`·`calcDamage`·`calcGateDamage`·`triggerPassive`·`maxLossCut`, `js/data.js` |
| 보물 내정·외교 | `내정 수입`은 그 성 세수·시장, `군량 유지비`는 그 성 병력 군량, `외교·등용 성공률`은 사자·주점 등용률, `일기토`는 [탐색] 일기토, `정찰 범위`는 첩자 기간. 상한 수입 +60%·유지비 −40% | `js/app.js` `heroTfx`·`cityTfx`·`econForecast`·`upkeepOf`·`advanceMonth`·`recruitChance`·`openPeaceTerms`·`explore`·`scoutMonths` |
| 원정 3턴·회군 | 기준 거리 2.6배 이상은 **3턴 행군**. 행군 중 출발 성이 함락되면 회군·요격 패배·전투 중 이탈 병력이 적 성에 합쳐지던 버그를 고쳐 **가장 가까운 아군 성**으로 복귀. 도착·요격 창에 함락 경고 | `js/app.js` `marchTurns`·`fieldHome`·`recallMarch`·`SK.load`·`openPendingMarch`, `js/battle.js` `homeOf`·`interceptDefeat`·`defeat` |

**검증 메모** — ① 사기 100/40/회복에서 40회 평균 피해 323/248/345. ② 중독 3%·화상 4% 턴 감소, 위축 −20%, 기절은 `acted=true`로 턴을 넘김. ③ 팔모금강봉 60회 중 기절 12%, 흑철모 적중 1회에 적 사기 −10. ④ 실이동으로 `승선`→물 위 공 52→37, 뭍으로 `하선`. ⑤ 진류→장안(3턴)·소패(2턴) 동시 출진 → 요격 2회 → 공성 2승 → 같은 달 수성전 2곳 연쇄. ⑥ 출발 성 함락 후 회군 시 병력 2,000이 최근접 성 복귀, 적 성 병력 증가 0. ⑦ 12성 24개월·전투 11회 콘솔 오류 0, 저장 68KB.

**검증 훅(다음 라운드에서 그대로 사용)** — `SKBattle.debug.status(name)`·`statuses()`·`giveAil(name,kind,turns)`·`giveMorale(name,d)`·`onHit(a,d)`·`place(name,x,y)`·`boatable()`·`ailPhase(side)`·`attackNow(a,d)`·`hits()`·`forceDefeat()`.

---

## 0.0 v5.30 — 6라운드 실플레이에서 잡은 수정 (2026-11-22 · `?v=44`)

390×844 실제 브라우저에서 진류(조조군)로 보물을 장착해 8종 전장(수전·도하·산전·밀림·협곡·야영·요새·평야)을 돌리고, 자동 ×4로 공성전을 끝까지 치른 결과입니다.

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 보물 전투 규칙 | 새 훅 13가지(`combo` 연격·`volley` 연속 사격·`doubleAct` 한 턴 2회·`pierce` 연격 방어 무시·`splash` 주변·`line` 관통·`water`/`mountain`/`night` 지형·`nightTaken` 야간 감소·`reflect` 반사·`charge` 돌격·`flank` 측면). 전장 적용 97→**107종**, 미적용 81→70절. 숫자 없는 문구는 `SK.TREASURE_FX_DEFAULT`로 옮기고 카드에 `(숫자 없는 N절은 기본값)` 표시 | `js/data.js` `TREASURE_FX_KEYS`·`TREASURE_FX_RULES`·`parseTreasureFx`·`fxSumLine`·`treasureFxDefaults`, `js/battle.js` `terrFxPct`·`calcDamage`·`extraKindOf`·`extraStrike`·`areaStrike`·`counter`·`doAttack` |
| 일기토 컷인 | 이름 있는 장수 근접 교전에서 좌우 초상이 들어오고 `일기토`가 찍히는 컷인. 숙적이면 붉은 표시. 한 판 3회·상대별 1회, ×4에서 180ms 안쪽. 컷인 중 목표 알약·미니맵 숨김. 무명 수비대장 제외 | `js/battle.js` `duelCutin`·`attackUnit`(`opts.duel`)·`doAttack`, `index.html` `.duel-cutin`, `css/game.css` `.dc-*`·`.battle-stage.dueling` |
| 타격감 | `spark` 불티 이펙트, 베기 두 갈래, 타격마다 짧은 진동, 크리티컬 금빛 화면 번쩍임(`#crit-flash`)과 큰 진동, 전투 예고에 연격·광역·관통·한 턴 2회·야간 감소 표시 | `js/battle.js` `impactAt`·`applyDamage`·`critFlash`·`drawFx`·`openAttackPreview`, `index.html` `#crit-flash`, `css/game.css` `.crit-flash` |
| 야간 전장 | 야영 기습전을 `B.night`로 정의. 화면 전체 밤색 multiply + 횃불 빛, 제목에 `야간 ·`. 흑갑(야간 피해 −15%)·해동병법(수전·산악 +10%)이 실제로 붙음 | `js/battle.js` `drawNight`·`terrFxPct`·`calcDamage`, `B.night` |
| 영토 칠하기 캐시 | 칸마다 80거점 거리 재계산(3,400만 회)을 없애고, 칸별 최근접 2거점·반경·경계 잡음을 한 번만 계산. 잡음은 4칸 간격 계산 후 보간. 달 넘김 중앙값 112→43.5ms, 영토 다시 칠하기 15.2ms | `js/map.js` `buildTerritoryGeo`·`drawTerritory`·`SKMap.debug().terrRedraw/terrBuild` |

**검증 메모** — ① 연격: 조조(장팔사모·방천화극) 1회 공격에 본타 878 + 연격 420 + 주변 2명 105씩, 확률 50%에서 10회 중 5회 발동. ② 연속 사격: 하후연(연노천궁) 10회 중 8회 2발. ③ 한 턴 2회(하후돈 일월쌍도): 공격 뒤 `acted=false`·`dblCd=3`·`dblUsed=true`, 두 번째 공격 정상. ④ 반사(현무방패): 적 공격 → 반격 629 → 반사 315. ⑤ 일기토: `{n:2, seen:{고순|조조, 고순|하후돈}}`로 상대별 1회 제한 확인, ×4 자동 공성전 21.9초 승리·콘솔 0. ⑥ 8종 전장: 배경 9종 로드, 통행 불가 타일 위 부대 0, 수전 강물 140칸·다리 28칸·조각배 표시 정상. ⑦ 성능: 21성에서 `SKMap.debug().terrRedraw()` 20회 중앙값 15.2ms, `SK.advanceMonth()` 10회 중앙값 43.5ms, 콘솔 0.

## 0.0 v5.29 — 5라운드 실플레이에서 잡은 수정 (2026-11-22 · `?v=43`)

390×844 실제 브라우저에서 진류(조조군)로 보물 12종을 장착해 전투·수성전을 돌리고, 성 21~24곳 세이브를 만들어 후반 다성 상황을 확인한 결과입니다.

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 보물 효과 실제화 | 151종 `effect` 문구를 절 단위로 파싱해 18가지 전장 훅(공격력·방어력·성벽 위 방어력·주는 피해·받는 피해·책략 위력·받는 책략 피해·치명타 확률/피해/저항·회피·반격 피해·회복량·첫 공격·턴당 기력·책략 기력 소모·경험치·험지 이동)으로 바꿔 계산에 넣는다. 97종·117절 적용. 숫자가 없는 문구는 값을 지어내지 않고 UI에 `미적용`으로 표시 | `js/data.js` `SK.parseTreasureFx`·`SK.treasureFx`·`SK.heroTreasureFx`·`SK.fxSumLine`, `js/battle.js` `fxPct`·`mpCostOf`·`calcDamage`·`effAtk`·`effDef`·`counterMulOf`·`attackUnit`·`healAmount`·`moveCost`, `js/app.js` `gainExp`·`equipLines`·`openTreasures` |
| 보물 UI | 보물 카드마다 `전장 적용 — … / 미적용: …`, 장수 보물 화면에 장착 합계 줄과 환산 규칙 설명, 장수 정보에 `전장 적용` 줄 | `js/app.js`, `css/game.css` `.ts-fx`·`.tr-fx`·`.tr-sum`·`.hi-fx` |
| 동시 침공 큐 | `invasionWarns`(한 달 2곳까지) + `invasionQueue`. 수성전·철수·패배 어느 쪽으로 닫혀도 같은 달 안에서 다음 침공 창이 이어짐. 창에 `뒤이을 침공 N곳` 표시. 옛 저장의 단일 `invasionWarn`은 로드 때 배열로 이관 | `js/app.js` `planPlayerInvasion`·`runAiCampaigns`·`pushInvasion`·`promoteInvasionQueue`·`chainPendingEvents`·`openPendingInvasion`·`surrenderCity`·`SK.load`, `js/battle.js`(수성전 결산 뒤 `chainPendingEvents`) |
| 전직 최종 이름 | classes.json 승급 이름 4개 중 앞 3개만 쓰던 것을 3단계(Lv.10/20/30)로 정리하고 **Lv.30이 최종 이름**(천하제왕·철갑기병·신궁기병·천둥포차 등)에 닿게 매핑 | `data/classes.json`, `js/data.js` `applyClassData` |
| 멸망 세력 잔여 | 0성 세력의 `pacts`·`truce`뿐 아니라 `s.captured` 잔여 기록(풀려난 장수·사라진 세력·기록 없는 표식)까지 달마다 정리. 포로 화면에 `○○군에 억류` 카드 | `js/app.js` `pruneLandlessFactions`·`openPrison` |
| 포로 교환 | 제안자가 실제로 붙잡고 있는 아군만 교환 조건으로 삼고(예전엔 `s.captured[0]`), 수락 직전 소속 재검증 | `js/app.js` `prisonTick`·`openPrison` |
| 후반 다성 UX | 거점 목록에 총계·`[전체/전방/손볼 곳]` 필터·`전방` 배지·`장수 없음/태수 없음/부상병/병력·군량 부족`, 수송 목적지에 `육로/해로/멀리`·충원율(%)과 가까운 성 우선 정렬 | `js/app.js` `openCityPicker`·`openTransport`, `css/game.css` `.cp-*`·`.tp-via` |

**검증 메모** — ① 보물: 같은 부대·적 400회 평균 `기본 441.9 → 주는 피해+15% 511.6 → 받는 피해−18% 365.6 → 선제(firstStrike)+50% 664.9(비선제 441.7)`, 전장 float에 `회피!`·`회심!` 확인. ② 침공: `SK.pushInvasion` 두 건 + 행군 도착 1건을 같은 달에 두고 첫 수성전 승리 직후 두 번째 침공 창이 같은 턴에 열림(나머지 행군은 이후에도 잔존). 실제 경고는 성 2곳 전선에서 2건 생성 확인. ③ 포로: 여포군 포로(유비)+여포군에 잡힌 하후연으로 교환 제안 → 수락 시 `s.captured` 0·하후연 진류 복귀. 0성 세력 정리에서 `pacts` 삭제·captured 해제·몸값 취소 확인. ④ 후반: 21~24성에서 월정산 `세수−봉급 +11,187`·`병력 유지 −2,256`(112,239명)·저장 58KB·HUD 0.6ms·지도 5.4ms, 콘솔 오류 0.

## 0.0 v5.28 — 4라운드 실플레이에서 잡은 수정 (2026-11-21 · `?v=42`)

390×844 실제 브라우저로 진류(조조군)에서 두 부대를 동시에 출진시키고, 1·2·3중성 수성전·전직 Lv.10/20/30·보물 장착·100개월 세계 진행을 돌린 결과입니다.

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 연쇄 도착 | 같은 달 두 부대가 도착하면 `pendingMarch` 하나때문에 두 번째가 다음 달로 밀리던 문제. `marchQueue`에 도착·요격을 쌓고 결산 뒤 같은 달 안에서 다음 창을 연다. 같은 성이면 앞 부대가 차지한 뒤 두 번째는 합류(병력 합산) | `js/app.js` `stepMarches`·`promoteMarchQueue`·`chainPendingEvents`·`openPendingMarch`, `js/battle.js` `closeBattle`·`clearMarchFlags` |
| 수성 후방 지원 | 32×32 3중성에서 보조(책사·풍수사·도사·군악대·무희)가 본진(y≈9)에 서 성문(y≈24)까지 2~3턴을 걷던 문제 → '내성' 선택 시 **바깥 성벽 안쪽 3~5칸 후방 지원선**(`rear`)에 배치. 1·2·3중성 모두 첫 턴 거리 1~2 | `js/battle.js` `defenseZoneSlots`·`placeSide`, `js/app.js` `DEF_ZONES` |
| 줌아웃 정보 | cam.s<0.30에서 미니맵 점 1.9→2.9px·어두운 테두리·선택 흰 링·총대장 금테, 미니맵 아래 `● 아군 ● 적군 ○ 위태` 범례, 병력 35% 이하 부대는 숫자 유지 | `js/battle.js` `drawMinimap`·`bindMinimap`·`drawUnit`, `index.html`·`css/game.css` `.mm-legend` |
| 선택 모달 보호 | 돌발 사건 결과창·천하 소식 카드를 `dismissible:false`로 잠그고, 필수 선택에서 뒤로가기를 누르면 `선택을 마쳐야 넘어갈 수 있습니다` 안내 | `js/app.js` `showChoiceEvent`·`showTimelineCard`, `js/backguard.js` |
| 유령 세력 | AI 전쟁으로 0성이 된 세력이 명부·몸값 제안에 남던 문제 → `pruneLandlessFactions`로 달마다 정리, 월정산 소식·몸값 취소·사로잡힌 아군 석방. `offerFactionAlive`도 성 0개면 거짓 | `js/app.js` `pruneLandlessFactions`·`advanceMonth`·`offerFactionAlive`·`openPrison`, `js/battle.js` `victory` |
| 보물 사거리 | 무력·통솔·지력·이동은 적용 중이었고 사거리만 빠져 있던 백마궁에 `rng +1(원거리 병과 한정)` 추가. 장수 정보·보물 화면에 `사거리+1` 표시 | `data/treasures.json` #26, `js/data.js` `treasureStats`·`equipBonus`, `js/battle.js` `makeAlly`, `js/app.js` |
| 전직 | Lv.10/20/30 칭호·기술 해금·스탯 +1 확인. 군주 `왕후`(여성 왕비 오해) → **군왕 → 패왕 → 대왕**. 전투 중에는 전직 팝업을 띄우지 않음 | `data/classes.json`, `js/app.js` `flushPromotions` |
| 표기·UI | 명부 머리글 정렬 화살표 인라인(`통솔▲`), 출진 인용문 단어 중간 줄바꿈, `4,500이(가)` → `4,500명이`, 조언 `보다 많습니다`/`에 맞먹습니다` 구분 | `js/app.js`, `css/game.css` |

**검증 메모** — `SK.stepMarches`·`SK.promoteMarchQueue`로 큐를 직접 확인하고, 두 부대를 같은 달에 도착시켜 첫 승리 후 두 번째 창이 같은 턴에 뜨는지, 같은 성이면 합류하는지 보았다. 수성전은 `SK.defenseZoneSlots`의 `rear` 길이와 보조~성벽 최단 거리(맨해튼 2~3)를 측정. 100개월은 `#btn-next-month` 반복 + `SKBattle.debug.forceVictory()`로 수성전을 즉시 정리하며 영토 변동·세력 수·저장 크기·힙·갱신 시간을 기록.

## 0.0 v5.27 — 3라운드 실플레이에서 잡은 수정 (2026-11-21 · `?v=41`)

390×844 실제 브라우저로 진류(조조군)를 5개월 내정한 뒤 소패를 공성전으로 함락하고, 2~6성 중반 상황을 만들어 다중 성 관리·세이브/로드·이탈 복귀까지 돌린 결과입니다.

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 지형 부호 | 유닛 패널 지형 표기가 음수 지형에 `+`를 붙여 `도로 방어+-5%`로 찍히던 오타 → `방어-5%`/`방어+30%` (부호 한 번) | `js/battle.js` `drawUnit` |
| 수성 보조 AI | 보조(책사·풍수사·도사·군악대·무희)가 본진 6칸에 묶여 성문 앞 아군에게 지원이 닿지 않던 문제. **성 안쪽 어디든 적 사거리 밖(근접 +2·원거리 +1)**이면 전진, 적이 들어오면 마당 전체 허용. 지원이 닿는 아군·다친 정도로 자리 점수, 적·본진 거리 감점, 보조끼리 붐빔은 실적 제외 | `js/battle.js` `defenseAllowed`·`defenseSafeRing`·`supportReach`·`planAuto` |
| 외교 화면 | 27세력이 전부 `교전 중`으로 나열 → **휴전·동맹 / 국경(1칸) / 두 칸 / 먼 세력(접힘)** 4묶음, 카드마다 상태 배지·`2성 · 국경 1곳`, 머리말 요약(`국경 2 · 휴전·동맹 0 · 나머지 25`), `먼 세력 19곳 더 보기` | `js/app.js` `openPeace`, `css/game.css` `.dp-*` |
| 전장 밀도 | 줌아웃(cam.s<0.30)에서 숫자 배지는 선택 부대·적 총대장만, 나머지는 병력 바만. 밀집 시 글자 상한 1.55→1.06, 아/적 칩→색 점, 여백 축소로 라벨 폭 한 칸 이하 | `js/battle.js` `drawUnit` |
| 특기 플로팅 | `「위화도의 결단」` 등 이름 문구를 부대 뒤에 그리고(스프라이트·병력 라벨 아래) 위치 -2칸 위·투명도 보정 — 어떤 배율에서도 병력 숫자를 덮지 않음 | `js/battle.js` `addFloat({back})`·`drawBackFloats` |
| 태수·군사 자동 | 함락한 성의 `governor/advisor`가 성 화면을 열기 전까지 비어 자동 내정이 돌지 않던 문제 → **달이 바뀔 때마다** 군주 우선으로 빈 태수·군사 재임명 | `js/app.js` `advanceMonth`·`enforceLordGovernor` |
| 세력 멸망 | 공성 함락으로 마지막 성을 잃은 세력이 명부에 남던 문제 → 명부에서 지우고 결산창에 `○○군이 마지막 성을 잃고 천하에서 사라졌습니다`. 결산 세력명은 지우기 전에 확보 | `js/battle.js` `victory` |
| 전투 중 이탈 | 전투 중 새로고침·앱 종료 시 출진 병력이 사라지던 문제 → `battleInProgress` 저장, 복귀 시 출발 성으로 병력 반환 + 안내 창. 승패·요격·수성·후퇴 결산에서 표식 제거 | `js/battle.js` `startBattle`·`clearBattleProgress`, `js/app.js` `SK.load`·`startGame` |

**검증 메모** — 로컬 정적 서버 + Playwright(390×844). `SK.openSortiePrep(null, cap)` → 배치 모달 `출진!` → 두 달 뒤 도착 모달 → `SKBattle.debug.toggleAuto(true)` + `toggleSpeed()` ×4 → 함락. 다중 성은 `s.cities[id].owner`·`genIds`를 직접 만든 뒤 다음 달을 넘겨 `advanceMonth`의 재임명을 확인. 전투 중 이탈은 전투를 띄운 채 `pg.reload()` → `#btn-continue`.

## 0.0 v5.26 — 2라운드 실플레이에서 잡은 수정 (2026-11-21 · `?v=40`)

390×844 실제 브라우저로 조선·신라·고려·사섭군·여포군·손견군을 6~14개월씩 돌리고, 외교(휴전·동맹)·포로·관아·보물·도감·전직·긴급 회군·수성전 역할 AI·3중성 공성전을 끝까지 플레이하며 찾은 것을 반영했다.

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 지도 조작 버튼 | 5단 세로(40×214) → **한 줄 가로(약 166×34)**, 작은 버튼 27px. `layoutAnchors`에 **조작 버튼·범례를 장애물 사각형**으로 넘겨 라벨이 그 밑을 피하고(페널티 6000), 화면 밖으로 잘리는 자리도 피한다. 80거점 전수 측정 **라벨 겹침 125 → 0** | `css/game.css`·`js/map.js` `mapObstacles()` |
| 월정산 표기 | `순금` → **`세수 − 봉급`**, 정산 밖 지출이 있으면 **`이 달 실제 금고`**·**`이 달 실제 창고`** 줄 추가(`소스 → 소스` 병기). `advanceMonth` 첫출에 `goldStart`/`foodStart`를 잡는다 | `js/app.js` `advanceMonth` |
| 경제 문구 | 상단 줄 `월 순금` → `월 세수−봉급`(+툴팁 내역), 경제 현황 `이번 달 세수 − 봉급` + 예상치 주의 문구, 성 요약 `이 성 +N` → **`대수확 예상 +N`**, `월 군량` → **그 성 병력 기준 유지비** | `js/app.js` |
| 전장 라벨 | 인접 2부대 이상 = 밀집 → 숫자 **`2.0k`**, 4부대 이상 → 아/적 칩 생략, 병과 배지는 인접 1부대 이하만·빈 쪽으로, 반 칸 엇갈림. 특기 이름 플로팅 17px → **11.5px** | `js/battle.js` `drawUnits`·`drawFloats` |
| 자동전투 배속 | **×1→×2→×3→×4**, `speedPref`로 세션 내 다음 전투에 기억. ×4는 `paceMs`에 0.85를 더 걸어 연출까지 단축. 버튼 title도 ×4까지 안내 | `js/battle.js` `toggleSpeed`·`startBattle`·`index.html` |
| 수성전 원거리 AI | 망루 +12 점수가 **사거리 밖에서도** 자리를 지키게 만들던 문제. 적이 `rng+1` 안에 있을 때만 망루 보너스, 아니면 성벽을 따라 이동 | `js/battle.js` `planAuto` |
| 요격대 규모 | 성 수비병 25~40% + **출진군 20~30%(최대 60%)** 중 큰 값. 부대 수는 `max(성, 출진군)/6000` 기준 | `js/app.js` `stepMarches` |
| 위임 일괄 내정 | 장수 전원이 `징병`을 골라 +13,000 병력이 나오던 문제. `chooseDelegatedAction(cityId, done)`로 징병·보수·훈련·위로 1회, 개간·상업 2회 제한. `comfort`도 위임 목록에 포함 | `js/app.js` `runDelegation` |
| 포로 | 안내문을 실제 규칙(2개월까지 탈출 불가, **3개월째부터**)에 맞춤, 몸값의 `미` → **`군량`**, 교환 대상 아군이 없으면 포로만 풀어 주던 버그 수정 | `js/app.js` `openPrison`·`prisonTick` |
| 전장 상단 | 요격전 제목 `{성} 가는 길`(종류는 부제로), 목표 칩은 2줄까지 접히는 짧은 문구, 전장 소식 피드 `top:74px`로 목표 칩과 분리 | `js/battle.js`·`css/game.css` |

### 검증 메모 (다음 라운드에서 그대로 쓰는 방법)

- 로컬 정적 서버 + Playwright(390×844, is_mobile)로 실제 화면을 띄우고 `#btn-next-month` 클릭·모달 자동 닫기로 달을 넘긴다. 전투는 `SK.startBattle({origin, targetId, type, units})`로 바로 열 수 있고, 판단 검증은 `SKBattle.debug.*`(`plan`·`defRoles`·`reach`·`gate`·`toggleAuto`·`toggleSpeed`)로 본다.
- **주의**: 요격·도착 모달은 `armPendingWatch`가 몇 초 뒤 다시 띄운다. 다음 달을 넘긴 직후 모달 목록이 비어 있을 수 있으니 “모달이 뜰 때까지 기다렸다가 마지막 버튼”을 누르는 방식으로 자동화해야 한다.
- 배속 버튼은 하단 액션바가 아니라 **상단 `#btn-speed` 하나뿐**이다.

## 0.0 v5.25 — 심층 실플레이에서 잡은 수정 (2026-11-21 · `?v=39`)

390×844 실제 브라우저·모바일 뷰포트로 조조군·고구려로 12개월 이상 내정하고, 출진·요격전·공성전(1·2·3중성)·수성전·세이브·뒤로가기를 직접 플레이하며 찾은 것을 반영했다.

- `js/app.js` — 표지 수치를 데이터에서 다시 채우는 `refreshTitleFoot()` (거점 80 · 병과 19 · 장수 697, 전에는 `623 장수`로 낡아 있었음).
- `js/app.js` — `armPendingWatch()`: 월정산이 어떤 이유로든 먼저 닫혀도 `pendingMarch`(행군 도착·요격)·`pendingInvasion`(적 침공)을 몇 초간 다시 띄운다. 월정산 모달은 `dismissible:false`로 바꿈. `js/battle.js`의 `closeBattle()`에서도 같은 감시를 건다.
- `js/battle.js` — 전장 상단 부제를 짧은 설명(`B.def.desc`)으로 바꿔 말줄임 제거. 결산표에 합계줄 하단 고정.
- `css/game.css` — `.map-hint` `word-break: keep-all` + 2줄 클램프(한국어 단어 중간 줄바꿈 방지), `.round-btn` 배경 불투명도 0.9·지도 버튼 `z-index:12`, `.rm-report-scroll` 페이드·합계줄 sticky.
- 한국어 조사: `을(를)`·`이(가)`·`은(는)`·`과(와)` 대체 표기가 화면에 나오던 8곳을 `josa()`/`hasBatchim()`으로 수정. 도움말 `건전`→`건물`, 병영 징병 표기 `+1,200` → `1,200+ (통솔·매력 보정)`.

## 0.0 v5.24 — S·A·B·C 등급 색 통일 (2026-11-21 · `?v=38`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 등급 4색 | 앱 전체 장수 등급 배지를 **S 빨강 · A 보라 · B 파랑 · C 초록**, 글씨 흰색으로 통일. 단색 기준 `S #c93024` · `A #7b38b5` · `B #2962ba` · `C #2b7d4e`, 큰 배지는 `#e03c2d→#a81d13` / `#9248cc→#632599` / `#3274d9→#1c4d9e` / `#32945c→#1e663d` 그라데이션 | `css/game.css` |
| 세력 선택 | 군주 초상 옆 원형 배지 `.fx-tier`에 **S/A/B/C 4종 전부** 정의(그전엔 `t-A`만 있어 S·B·C가 금색 기본값) — 등급색 그라데이션 + 밝은 테두리 + 등급색 그림자 | `css/game.css` (`app.js` `factionScreenCard`가 `t-${tier}` 출력) |
| 주점·등용·포로·도감 | `.tier`(주점/등용) · `.pr-tier`(포로) · `.cdx-tier`(인물 도감) 색 교체, 도감 등급 필터 칩(`data-f="tier"`)도 같은 4색(선택 시 등급색 배경) | `css/game.css` (`app.js` `openTavern`·`openPrison`·`codexGenCells`/`codexChips`) |
| 캐시 | `index.html` 11개 · `manifest.webmanifest` `?v=37` → `?v=38` | `index.html`, `manifest.webmanifest` |

## 0.0 v5.23 — 모바일 뒤로가기 이탈 방지 · 한국 재야 풀 38인 + 전용 초상 20장 (2026-11-21 · `?v=37`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 뒤로가기 | 안드로이드 제스처·버튼 `popstate` 가드. ① 모달이 열려 있으면 **맨 위 모달만 닫기**(`dismissible:false`는 무시) ② 전장에서는 상단 `‹`와 같은 **후퇴 확인** ③ 성 화면은 **지도로**, 시나리오·세력 화면은 **한 단계 앞으로** ④ 지도·타이틀은 **"한 번 더 누르면 종료됩니다"**(2초 안 재입력 시 실제 이탈) | `js/backguard.js`(신규), `js/app.js` `SK.modal`(모달 스택 `SK.modalStack`)·`SK.confirmRetreat` |
| 히스토리 | 앱을 열 때 `pushState` 가드 1개만 얹고, 뒤로가기가 올 때마다 같은 항목을 다시 얹어 **길이 고정**(무한 루프 없음). 실제 이탈 때만 가드를 얹지 않고 한 칸 더 나간다. bfcache 복귀(`pageshow`)면 다시 세운다 | `js/backguard.js` |
| 한국 재야 풀 | 왕실 34명 제외로 얇아진 한국 주점을 위해 **왕이 아닌 실존 한국 인물 43인**(유금필·김윤후·김방경·이지란·최윤덕·정기룡·연남생·정운·권응수·창조리·목라근자·해구·알천·죽지랑·박영규·장문휴·홍대용·박지원·김시습·남이·어유소·허종·정문부·이정암·신립·정충신·영규·홍계남·김응서·김상헌·거타지·김정호·유형원·정제두·안용복·논개·김천일·송상현·오연총·고연수·어재연·원측·정년) 추가. 등급 재산정 후 **A 10 · B 19 · C 14**, 이름 중복 0. 병과는 13개 병과에 분산(기병 6·수적 5·책사 7·창병 4·검병 4·등갑병 3·궁기 3·풍수사 3·궁수 2·무도가 2·도사 2·산적 1·무희 1) | `js/data.js` `EXTRA_GENERALS`·`KOREAN_EXTRA`·`FEMALE_GENERALS`(논개), `data/hero_gags.json`(43줄) |
| 지역 분리 | 빈 주점 긴급 보충을 **같은 지역 안에서만**(한국 성은 한국 인재) 하도록 고치고, 주점 진열도 `here` 예외를 없애 **한국 18거점에 중국 인재 0** | `js/app.js` `seedTalents`·`tavernPool` |
| 전용 초상 40장 | 5×4 시트 2장을 각각 20등분해 **256×256 WebP**로 `assets/portraits/korea_v523/`에 저장, `data/korea_v523_art.json`으로 연결 — 황희·장영실·최무선·유성룡·사명대사·김윤후·임경업·최치원·김취려·김방경·이황·이이·이지란·정지·김덕령·정기룡·알천·죽지랑·연남생·박지원 / 유금필·복지겸·오연총·배중손·서산대사·조광조·어재연·김응하·최윤덕·맹사성·신숙주·홍대용·안용복·해구·목라근자·김인문·원측·정년·창조리·고연수 | `data/korea_v523_art.json`, `js/app.js` `loadTopArt` |

## 0.0 v5.21 — 징병 절반 · 요격대 병력 · 수성전 배치 · 성문 파괴 연출 · 점프 침공 · 탐라 · 상단바 · 소세력 부하 (2026-11-21 · `?v=35`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 징병 | 기본 `2,500` → **`1,200`** (보너스 `800` → `350`, 금 150·군량 120 유지). 병영·군사 조언 문구와 `미` → `군량` | `app.js` `openRecruit`·`CMDS.recruit.run`·`openBarracksMenu`·군사 조언 |
| 요격대 | 총합 = 목표 성 병력의 **25~40%**, 부대 수 2~6, 부대당 최소 병력 규모 비례 → 2,000명 성 = `500~800명`. 전장 편성도 `요격대/(부대 수+0.5)`로 맞춰 **경고창 수치 = 실제 적 병력** | `app.js` `stepMarches`, `battle.js` `startBattle` |
| 수성 배치 | `openDefenseDeploy`: 출진 장수 **최대 10명** + 장수별 `외성/망루/내성`. 요약(출진 병력·예비·자리). 예비 병력은 이기면 성에 유지(`B.reserve`) | `app.js`, `battle.js` `defenseZoneSlots`·`placeSide` |
| 성문 통과 | 수성측 아군은 살아 있는 자기 성문 통과(`moveCost(..., side)`, 성문 칸 클릭 이동). 적만 막힘 | `battle.js` |
| 성문 파괴 연출 | `assets/battle/gate_broken.webp`(256×320) + `GATE_ART_OFF`(겹수별 문 위치 보정) | `battle.js` `drawBrokenGates`, `tools/v521_gate_broken.py` |
| 점프 침공 | `planPlayerInvasion`은 **인접 성(`adj`)에서만** 침공(2칸 건너 `ring` 제거) | `app.js` |
| 탐라 | 제주 섬 한가운데(0.845, 0.523)로 보정, `CITY_COORD_FIX` 신설 | `js/city_geo.js` |
| 상단바 | 아이콘 버튼 34px·간격 축소 + `data-res=short/long/xlong` 자릿수별 밀도(보조 합계 단계 숨김) | `css/game.css`, `app.js` `refreshHud` |
| 소세력 5팀 | 도겸 6 · 공융 6 · 한수 7 · 엄백호 6 · 왕랑 6 (고유 부하 고정, 랜덤 보충 없음). 28세력 중복 0 | `historical_scenarios.json`, `data.js` `EXTRA_GENERALS`·`EARLY_RETAINERS` |

## 0.0 v5.20 — 조선·고려·사섭군·공손강군 28세력 · 신규 아트 6인 · 실플레이 버그 5종 (2026-11-21 · `?v=34`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 세력 수 | 1막 24 → **28**. `joseon`(조선, **완산**, mark `조`, `#991B1B`) · `goryeo`(고려, **개성**, mark `려`, `#6B21A8`) · `shi_xie`(사섭군, **남해**, mark `사`) · `gongsunkang`(공손강군, **요동**, mark `강`) | `historical_scenarios.json`, `data.js` |
| 한국 5국 | `SK.KOREAN_FACTIONS`에 `joseon`·`goryeo` 추가 → 완산·개성 주점 풀·세력 계열·`MAJOR_FACTIONS`가 3국과 같다 | `data.js`, `app.js` |
| 명부 | 조선 10(이성계·세종대왕·이순신·정도전·정몽주·권율·김시민·정약용·김종서·곽재우) · 고려 10(왕건·강감찬·서희·윤관·양규·최영·척준경·신숭겸·배현경·박서) · 사섭 7 · 공손강 6 | `historical_scenarios.json`, `EARLY_RETAINERS`, `EXTRA_GENERALS`(사광·환린·유의) |
| 중복 0 | 공손찬군에서 `공손공`을 빼고 `공손속`으로 채움. 28세력 도시·수도·장수 중복 0 | `historical_scenarios.json` |
| 소세력 보충 | `padStartRosters`에서 군주급(`job === '군주'`)·시나리오 군주 제외 | `data.js` |
| 신규 아트 | 서서·사섭·공손강·한현·이각·이유 초상+SD 12장 (256×256 투명 WebP) | `assets/portraits/v520/`, `assets/units/v520/`, `data/v58_art_manifest.json` |
| 버그 1 | 주점·탐색에 타 세력 군주·왕이 재야 인재로 등장(완산 탐색에서 광개토대왕) → `SK.lordNameSet`·`SK.isLordOnly`로 시드·신규 등장·주점·탐색·성 보충에서 제외 | `data.js`, `app.js` |
| 버그 2 | 월정산 '군량 순'이 농원 비축 누락 → `foodNet += farmGain` | `app.js` |
| 버그 3 | 수성전 적장 이벤트를 '아군' 버프로 표시 → `적군` 치환·안내 문구 | `battle.js`, `css/game.css` |
| 버그 4 | 승리 결산 조사 《청주을(를)》 → `SK.josa` | `battle.js` |
| 버그 5 | 군량 단위 `미 −193` → `군량 −193` | `app.js` |
| 버그 6·7 | 마지막 성 철수 시 패망 처리 누락, 패망 뒤 다음 달·행군 이벤트 계속 → `SK.lockRun`·`s.over` 잠금·`[새로 시작]` | `app.js`, `battle.js` |
| 검증 | 28세력 중복 0·명부 일치·아트 200·콘솔 0건(390×800), 조선으로 공성 승리·수성 패배·12개월 진행까지 실플레이 | `tools/v520_*.py` (gitignore) |

## 0.0 v5.19 — 1막 주 세력 드림팀 · 한현군·맹획군 24세력 (2026-11-21 · `?v=33`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 세력 수 | 22 → **24**. 신규 `hanxuan`(한현군, **장사** 중도시, mark `현`, `#A21CAF`) · `meng_huo`(남만 맹획군, **운남**, mark `맹`, `#C2410C`) | `historical_scenarios.json`, `data.js` `FACTIONS`·`FACTION_MARK`·`FACTION_COLOR` |
| 손견군 | 수도 `장사` → **`시상`**(1막 공백지, 강동 길목). 손견·손책·손권·주유·여몽·황개·정보·한당·주태·태사자·감녕·노숙 12명 | `historical_scenarios.json`, `ACT1_ROSTER_TARGET` |
| 유비군 | 7 → **12명**: 유비·관우·장비·조운(공손찬군에서 이동)·제갈량·방통·서서·강유·간옹·손건·미축·미방 | `EXTRA_GENERALS`(서서: 책사, 지 92·통 81·정 84·매 89) |
| 조조군 | **14명**(곽가·허저·우금·서황 추가, 장료 제외) | `ACT1_ROSTER_TARGET.caocao: 14` |
| 동탁군 | **12명**(장수·우보·단외 추가, 장료를 여포군으로) | `EXTRA_GENERALS`(우보) |
| 여포군 | 여포·**장료**·후성·고순·진궁·장패·송헌·위속 8명 | `historical_scenarios.json` |
| 마등군 | 마등·마초·마대·방덕·마휴·마철·성의 7명 | — |
| 한현군 | 한현(군주 C)·황충·위연·양령·형도영·진응·포륭 7명 — `장사` | `EXTRA_GENERALS` |
| 맹획군 | 맹획·축융·올돌골·목록대왕·타사대왕·아회남·대래동주·맹우·동도나·금환삼결·망아장 11명 — `운남` | `EXTRA_GENERALS` |
| 유표·유요 | 유표군은 황충을 한현군에 내주고 유종을 더해 12명, 유요군은 태사자를 손견군에 주고 착융·번능·장영·설례 | — |
| 4막 | 남중 호족 id `meng_huo` → **`nanjung`**(`EARLY_RETAINERS` 키도 이동). 1막 맹획군과 이름·색이 섞이지 않게 | `historical_scenarios.json`, `data.js` |
| 등장 연도 | `f.generals`에 명시된 장수는 `debutYear`를 건너뛴다 — **190년에 제갈량·강유·주유·여몽·손권·마대·위연**이 서는 이유. `EARLY_RETAINERS`·풀 보충은 기존대로 연도 검사 | `data.js` `padStartRosters`, `app.js` `enrichFactions` |
| 검증 | 1막 24세력 **도시·수도·장수 중복 0건**, 8개 세력(유비·조조·여포·손견·마등·동탁·한현·맹획) 인게임 `[장수]` 명부 전수 일치, 콘솔·pageerror 0건(390×800) | `tools/v519_roster_check.js`, `tools/v519_ui_check.py` |

---

## 0.0 v5.18 — 시나리오 1막 개방 · 한국 3국 명부 · 여포군/장각군 (2026-11-21 · `?v=32`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 시나리오 화면 | 1막 카드만 플레이 가능(`1막 · 천하제일 대난투 / (동탁이 우리 왕따시킨다던데?) / 22개 세력 · 전 영웅 집합!`). 2·3·4막은 **`새 컨텐츠 준비중` 잠금 카드 3장** — 탭하면 토스트만 뜨고 진입하지 않는다 | `js/app.js` `openScenarioPicker`·`soonCard`·`SOON_ACTS`, `css` `.scbn.soon`·`.scbn-soon-tag`·`.scbn-lock` |
| 세력 수 | 1막 세력 20 → **22** (여포군·장각군 신설). 카드의 `N개 세력`은 `sc.factions.length`로 자동 계산 | `js/app.js` `scenarioLine` |
| 유비군 | `평원` → **익주 파군(영안)** 1성. 북방 평원·원소·공융 숨통을 틔우고 성도(유언)·형주(유표)와 맞선다 | `data/historical_scenarios.json` |
| 여포군 | 신규 세력 `lvbu` — 군주 여포, 수도 **복양**, 여포·진궁·고순·장패·송헌·위속·**후성**(7명). 동탁군에서 여포·고순, 원소군에서 송헌을 뺀다 | `data.js` `FACTIONS`·`FACTION_MARK`·`EARLY_RETAINERS`, `EXTRA_GENERALS`(후성) |
| 장각군 | 신규 세력 `zhangjiao`(황건적) — 군주 장각, 수도 **여남**, 장각·장보·장량·관해·배원소·주창·요화(7명) | 위와 같음 |
| 명부 중복 0 | 마등군의 `한수`·유언군의 `장로`가 각 세력 군주와 겹치던 것을 제거. 시작 명부 22세력 전수 검사에서 **도시·장수 중복 0건** | `EARLY_RETAINERS`, `historical_scenarios.json` |
| 한국 3국 | 군주 1명 + 명장·책사·문신 10/7/10명으로 정리(고구려 광개토대왕·백제 근초고왕·신라 진흥왕). `구수/구수왕`·`내해/내해이사금`·`사반왕` 같은 중복·군더더기 제거 | `data.js` `KOREAN_EXTRA`·`EARLY_RETAINERS`, `historical_scenarios.json` |
| 성 헤더 | `대도시 · 3중 성벽` 배지를 둘째 줄로 내려 우측 금·군량 숫자와 겹치지 않게 함(390px에서 겹침 0) | `index.html` `.ct-line2`, `css` `.ct-line1 #city-hanja` |
| 색 | 고구려를 더 진한 인디고(`#312E81`)로 — 새 여포군(보라 `#7E22CE`)과 구분 | `data.js` `FACTION_COLOR` |

---

## 0.0 v5.17에서 바뀐 것 — 대형 전장·3중 성곽·미니맵·전직 3회 (2026-11-21 · `?v=31`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 격자 크기 | **요격 8종·소도시 24×24 · 중도시 28×28 · 대도시 32×32**. `N`·`WORLD`는 `startBattle`이 `B.cols`·`B.rows`로 다시 잡는다(모든 지도는 정사각) | `js/data.js` `SK.battleSizeFor`, `js/battle.js` |
| 지도 | 11종 모두 코드 생성. 지도마다 `A`(아군 본진)·`E`(적 본진)·`V`(마을 2~4)를 심고 `SK.MAP_META[key]`에 좌표를 남긴다 | `js/data.js` `siegeMap`·`plainMap`…`finishMap`·`placeSite` |
| 1×1 본진·마을 | 본진 위 부대는 턴 시작 **최대 병력 +20% · MP +10 · 방어 +25%**, 점령한 마을은 **+10% · MP +5 · 방어 +15%**. 밟으면 그 진영 것으로 바뀐다(`sitePhase`) | `siteAt`·`siteBonusOf`·`sitePhase`·`drawSites` |
| 총대장 | v5.32부터 총대장 격파로 전투가 끝나지 않는다(금관 표시용). 승패는 **전멸**만이고, v5.38부터 본진 점령은 즉시 승패 대신 사기 +25/−25 역전(1회)이다. `B.winReason`이 결산 창에 찍힌다 | `finishCheck`·`captureHQ`, `victory`/`defeat` |
| AI 역할 | `u.role`: 공성·요새는 전원 `guard`(본진 사수), 들판은 절반 `assault`(마을→아군 본진), 수성전은 적 전원 `assault` | `aiGoalOf`·`enemyAct` |
| 대도시 성곽 | 아래 1중 가로 성벽+정문 → 가운데 2중 가로 성벽+정문 → 맨 위 **네모(ㄷ자) 본성 성곽**+문, 그 안에 적 총대장 본진. 성문은 성벽 두께(2칸)를 관통하는 통로 | `js/data.js` `siegeMap(3)` |
| 단계 돌파 | 문을 부순 만큼 안쪽 마당이 열린다. **성문이 살아 있으면 성벽 너머로 근접·사격·투석 모두 닿지 않는다**(예전엔 근접만 막혀 성 밖에서 총대장을 저격할 수 있었다) | `wallBlocked`·`canHit`·`planAuto`·`enemyAct` |
| 망루·성내 마을 | 1중 성벽 뒤 좌·우 `T`(수성 궁수·연노 사거리 +1, 방어 +45%), 1·2단 사이 외성 마당 좌·우 `V`(중도시 포함). 소도시는 성 안 천막 옆 2 + 성 앞 1 | `siegeMap` |
| 미니맵 | 우측 상단 104px. 아군(파랑)·적군(빨강)·총대장(금테)·본진(금)·마을(초록)·성문(금/초록) + 화면 흰 사각형. 누르면 카메라 이동, `◧/◨` 접기 | `buildMinimap`·`drawMinimap`·`bindMinimap`, `index.html` `#battle-minimap` |
| 출진·상한 | 최대 10부대, **일반 5,000 / 군주 10,000 고정**. 관직 보너스는 공·방·봉급·충성으로만 | `SK.troopCapOf`, `js/app.js` `openDeploy`·`openAppoint` |
| 전직 3회 | `SK.PROMO_AT = [10,20,30]`, 이름 4단계. 병종별 **Lv.30 궁극기 18종**(`data/classes.json`). SD 동테→은테+깃발→금테+오라, **전직 팝업** | `SK.PROMO`·`SK.tierForLv`·`SK.skillsAtLevel`, `js/app.js` `queuePromotion`·`flushPromotions`, `drawUnit` |
| 생포/퇴각 | HP 0 → **15% 생포 / 85% 퇴각**. 결산표 `생포`(금)·`퇴각`, 생포된 적장은 포로 확정 | `downUnit`·`battleReportHTML`·`rollPrisoners` |
| 포로 몸값 | `rec.by`(잡은 순간의 세력)로 `"유표군의 포로 몸값 제안"`. 세력이 멸망하면 제안 중단 안내 1회. 문구 `포로`로 통일 | `addPrisoner`, `js/app.js` `prisonTick`·`offerFromOf` |
| 내정 성곽 | 성 그림 1·2·3중 겹테두리 + `N중 성벽` 배지. 시설 칸 **소 6 · 중 8 · 대 10**(옛 저장은 자동으로 빈 칸 추가) | `SLOT_MAX`·`YARD_SPOTS`·`renderSceneLevel`, `css` `.city-scene.ring-*`·`.sb-wall-badge` |
| 밸런스 | 적 6~10부대(요격 5~8)·900~5,200. 적 명장 공·방을 아군과 같은 식(능력치 60 기준)으로 → A급 적장 1.8배 우위 제거. 대형 전장 턴 40 | `startBattle`·`makeNamedEnemy` |
| 자동전투 | 책략이 늘 공격보다 앞서 성문 앞에서 버프만 되풀이하던 교착 → 공격·성문 공략 먼저, 회복(score>45)만 책략 우선 | `planAuto` |
| 검증 | `tools/v517_smoke.py`·`v517_logic.py`·`v517_rules.py`·`v517_auto.py`·`v517_shots.py`·`v517_play.py`, 스크린샷 `preview/v517/` |  |

> 새로 알아둘 것: ① 지도는 **정사각**이어야 한다(`N`과 `WORLD`가 한 값). ② 성벽은 **2칸 두께**이고 성문은 그 두 줄을 다 뚫는다(한 줄만 뚫으면 위 줄 벽에 막혀 통로가 막힌다). ③ 적 본진·아군 본진은 `SK.MAP_META` 좌표를 따른다 — 지도를 고치면 `finishMap`이 좌표를 다시 남긴다.

## 0.0 v5.16에서 바뀐 것 — 도감·천하통일 엔딩·전란 피해 (2026-11-21 · `?v=30`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 도감 | 인물 623·보물 151 수집 체크, 필터·수집률·초상 그리드, **다음 회차 유지**(`samgukji-jojo-codex` + `state.codex`) | `app.js` `openCodex`·`codexMerge`·`codexMeet`·`codexTreasure`, `css` `.cdx-*` |
| 천하통일 엔딩 | 80/80이면 1회 엔딩(걸린 달·거점·장수·명성·도감 %) | `app.js` `checkUnification`·`showUnification` |
| 결산 합계 | 표 아래 `합계`(총공격·받은피해·회복·처치) | `battle.js` `battleReportHTML` |
| 공성 전란 피해 | 7턴~·성문 파괴에 비례해 성벽·시설·농업·상업·치안·인구 손실 | `battle.js` `victory` |
| 정리 | 1막 부제·표지 수치, 문관 병과 핀셋(책사 46), 야영 아군 스폰·천막 위 소나무, `B=null` 콜백 보호 | `data/*.json`, `js/data.js`, `js/battle.js` |

## 0.1 v5.15에서 바뀐 것 — 조조전식 밸런스·8종 요격전·1막 판도 (2026-11-21 · `?v=29`)

| 갈래 | 내용 | 코드 |
| --- | --- | --- |
| 삼각 상성 | 보병(검병·등갑병·무도가)→궁병 **+20%** / 궁병(궁수·연노·궁기)→기병·야수·책략계(기병·야수·책사·도사·풍수사·무희·군악대) **+18%**, 창병 **+20%** / 기병·야수→보병 **+18%** / 창병→기병·야수 **+35%** | `js/data.js` `SK.TRIANGLE`·`SK.triangleMul` |
| 반격 | 방어자 최소 사거리(`minRng`) 안쪽이면 반격 불가 · 피해 **75%**, 검병만 **90%** · 예고 창에 배율 표시 | `js/battle.js` `canCounterAt`·`counterMulOf`·`counter`·`openAttackPreview` |
| 등갑병 4딜 벽 | 피해식 방어 계수 **0.52**(이전 0.62) + 최소 피해 하한 `max(4, atk×2.2×sizeScale(d))` | `js/battle.js` `calcDamage` |
| 야수병 | 기본 이동 **5**(`data.js`·`classes.json` 양쪽) · 숲·산 진입 1 · 숲·산 위/산전·밀림전이면 **+1** → `movOf(u)` | `js/battle.js` `movOf`·`reachSet`·`:uc-mov` 표시 |
| 수성전 사거리 | 성벽·망루·본성(`C`·`T`·`K`) 위 궁수·궁기·연노·포차·발석차 **+1**, 지형 보너스와 합산해 **최대 +1** | `js/battle.js` `effRng`·`wallRngBonus` |
| 군악대·무희 오라 | 턴 시작 마름모 2칸 — 군악대 아군 **MP+4·공+8%(1턴)**, 무희 아군 **crit·evade 8%** + 적 **atk −8%** | `js/battle.js` `classAuraPhase`, `buffs.crit`·`buffs.evade` |
| 병과 재분배 | 책사 85→40 · 군악대 43→21 · 연노 11→25 · 등갑 14→22 · 무도가 16→25 · 포차 17→23 · 궁기 23→28 · 궁수 29→42 · 검병 36→48 · 공융→군주, 왕랑·성충→책사 | `data/generals.json` |
| 1막 판도 | 동탁=낙양+호로관 · 유표=양양 · 원소=남피. 시작 인원 동탁·원소·조조·손견·유표 **12명**, 유비 **7명**, 나머지 **최소 6명** | `data/historical_scenarios.json`(`cityCaps` 190 = 2/1/1), `js/data.js` `SK.ACT1_ROSTER_TARGET`·`padStartRosters` |
| 행군 | `MARCH_MIN = 2` — 모든 성 공격이 **2일 행군**(첫날 요격) | `js/app.js` |
| 요격전 8종 | 평야·도하·산전·**밀림**·**협곡**·**야영**·수전·요새. `interceptTypeFor`가 바다·강·관문·요새·육로 가중치로 고름 | `js/data.js` `SK.MAPS`·`SK.BATTLE_TYPES`·`enemyClassesFor`·`enemySlots/allySlots`, `js/app.js` `interceptTypeFor` |
| 새 맵 그림 | `assets/maps/v2/battle_forest.webp`·`battle_gorge.webp`·`battle_camp.webp`(1400×1400 WebP) · 야영은 `assets/battle/` 프랍도 함께 | `js/battle.js` `draw()`·`drawBattleProps` |
| 옛 저장 | `interceptType: 'ambush'`는 밀림전(`forest`)으로 이어지고 `SK.MAPS.ambush`도 남겨 둠 | `js/app.js` `openPendingMarch` |
| 검증 | `tools/v515_verify.py`·`v515_autobattle.py`·`v515_def.py` | `preview/v515_local/` |

## 0.1 v5.12에서 바뀐 것 — 코믹·올스타 리브랜딩 (2026-11-21)

- **이름**: 《꼬마영웅 대난투》. `<title>`·표지 로고·kicker·sub까지 통일. 표지 배경(`assets/title_bg.webp`)에는 글자가 없어 그림은 그대로 씁니다.
- **시나리오**: `data/historical_scenarios.json`의 `title`·`subtitle`·`historyNote`·`timelineEvents`가 코믹 톤. 판도는 건드리지 않았습니다. `data/scenarios.json`은 옛 파일(미사용).
- **날짜**: `SK.dateLabel()`이 `N년차 M월`을 돌려줍니다(세이브의 `eraYear - (year-1)`로 기준 연도 계산, 마이그레이션 불필요). 시나리오 뱃지는 `app.js` `SC_ACT`(1~4막).
- **개그**: `data/hero_gags.json` → `SK.setGags`/`SK.gagOf(name, cls, tier)`. 이름 전용 우선, 없으면 병종 → 등급 폴백(이름 해시로 고정 선택).
- **징병·훈련**: `doCommand('recruit'/'train')`이 `openRecruit`/`openTrain`으로 분기. `CMDS.recruit/train.run`은 그대로 쓰고 `finishAction`이 행동·EXP·공훈을 정산합니다.
- **탐색**: `explore()` 앞단에 실패 판정(`fail: true`, 호출부는 EXP 10). 보상은 40~45%로 하향.
- **대상인**: `cs.grandMerchant`(남은 달)·`cs.gmStock`(보물 id). `advanceMonth`에서 18% 확률 방문, `openRiceTrader`가 특가·보물 판매.
- **건물 2명**: `slot.uid`(주담당) + `slot.deputy`(부장). `slotMul`이 부장 시 ×1.45(상한 190%), `runSlots`가 부장 EXP·공훈, `applyDuty`가 부장도 행동 소모. **`autoAssignDuty`는 주담당만 채웁니다**(사용자 지시).

## 0.1 v5.11에서 바뀐 것 — 풀코스·공성 맵·성별 금고·세이브 5 (2026-11-21)

| 갈래 | 내용 | 코드 위치 |
| --- | --- | --- |
| 성별 금고 | `s.gold`/`s.food`는 **지금 다루는 성(`s.purseCity`)의 가상 속성**이다. 실제 값은 `cs.gold`·`cs.food`. 세수·시장·농원·봉급·유지비·건설·징병·수송·출진 보급이 성 단위로 돈다. 합계는 `SK.totalGold/totalFood`, 옛 저장은 `SK.load`에서 인구 비례로 이관 | `app.js` `installPurse`·`purseCs`·`advanceMonth` |
| 자동 보급 | 유지비 2개월치 아래거나 금 120 미만인 성에 이웃 내 성이 자동 수송(`autoSupplyNeighbors`) | `app.js` |
| 세이브 | 수동 5슬롯(`samgukji-jojo-slot-1..5`) + 자동(`SAVE_KEY`). 표지·메뉴의 `[세이브 슬롯]` | `app.js` `saveTo`·`loadFrom`·`openSaveSlots` |
| 공성/수성 | 같은 성이면 같은 맵. `SK.siegeMapKey(rings)`·`siegeRingsOfCity`(대 3·중 2·소 1). 성문은 `B.gates` 배열(바깥부터), `activeGate()`가 지금 문. `assets/battle/` 18종은 `drawBattleProps`가 격자에 렌더 | `data.js`·`battle.js` |
| 전란 피해 | 수성 승리도 성벽·건물 경험치·농업·상업·치안·인구 손실(`defenseVictory`의 `warDamage`) | `battle.js` |
| 회군/배수진 | `SK.openRecall`·`recallMarch`, `SK.openLastStand`(성 0 + 원정 주력 생존 시 1회) | `app.js` |
| 결산 | `battleReportHTML()` — 딜·탱·힐·처치·MVP, 승리/패배/수성 결과창에 삽입 | `battle.js` |
| 포로 | `addPrisoner`(첫 3개월 탈출 불가), `prisonTick`(충성↓·탈출·몸값/교환 제안), `openPrison`/`openPrisoners` | `battle.js`·`app.js` |
| 관직 | `SK.OFFICES` 24단계(문관 12·무관 12). `officeWarBonus`가 전투 공·방, `officePol/Intel`이 내정 표시 | `data.js`·`battle.js` |
| 등급/나이 | `genScore` 최고+상위2, 97+ S·93+ A·원본 S A 보호. `SK.ageOf` 최소 18세 | `data.js` |
| 계절 | 봄 4~5 · 여름 6~9 · 가을 10~11 · 겨울 12~3 | `app.js` `SEASON_KEYS` |
| 지도 | 지붕 세력색 `.m-roof`(`mix-blend-mode: color`), 중립 수비 1,500~2,500 | `map.js`·`css` |
| 검증 | `tools/v511_smoke.py`·`v511_flow.py`·`v511_battle_ui.py`·`v511_econ.py`·`v511_siege3.py` | `preview/v511/` |

## 0.2 v5.10에서 바뀐 것 — 사계절·공훈치·주점·터치·AI 동반성장 (2026-11-20)

| 갈래 | 내용 | 코드 위치 |
| --- | --- | --- |
| 계절 판정 | `s.month`(0=1월) → 봄 3~5 / 여름 6~8 / 가을 9~11 / 겨울 12~2. 예전 `SEASONS`가 한 달 어긋나 있던 것 수정 | `app.js` `SEASON_KEYS`·`seasonKeyOf`·`seasonOf`·`currentSeason` |
| 사계절 지도 | `map_bg_spring/autumn/winter.webp`(직접 생성 WebP) · 달이 바뀌면 `loadBg(season)`이 갈아입고 실패하면 기본 지도 → 절차 지형으로 물러난다 | `assets/map_bg_*.webp`, `map.js` `BG_SEASON`·`loadBg`·`refresh` |
| 사계절 성 그림 | `assets/scenes/{spring,autumn,winter}/city_lv{1,2,3,5}.webp` 12장. `계절 → 기본 레벨 → 지역 기본` 순 폴백 | `app.js` `sceneChainFor`·`setSceneSrc`·`sceneImageFor` |
| 계절 파티클 | 캔버스마다 rAF 1개. 봄 벚꽃잎 24·여름 반딧불 16·가을 단풍잎 20·겨울 눈송이 34. 지도 `.map-season`(z0)·성 `#city-season`(z1) | `app.js` `SeasonFX`(`SK.seasonFX`), `map.js` `seasonCanvas`, `index.html` `#city-season` |
| 터치 스크롤 | 성 화면 스크롤·카드에 `touch-action: pan-y` | `css/game.css` v5.10 절 |
| 지도 드래그 | 마커 `pointerdown` 차단 제거 → 제스처가 **8px 미만 탭=거점 열기 / 이상=지도 이동** 판정(`lastTapHandled`로 click 중복 차단) | `map.js` `buildMarkers`·`bindGestures`(`downTarget`) |
| 배속 버튼 이동 | `[＋ 자동 배속]`·`[매달 최선 ON/OFF]`를 `[시설]` 탭 `.slot-tools`로. `[장수]` 탭은 상태 요약 + `[군사 조언]`만 | `app.js` `renderCitySlots`·`renderApBar` |
| 조언 배지 대비 | 이름 배지 `#5a3410` 바탕 + `#fff8e8` 글씨 | `css` `.ap-delegate span` |
| 건물 창 담당 장수 | `.sd-owner`(초상·이름·Lv·관직·5능력치·EXP 바) → 누르면 장수 상세창 | `app.js` `openSlot`·`SK.openGeneralDetail` |
| 보물 `+N` | 상세창 5능력치에 `SK.equipBonus` 합산 + `(+N)`, 슬롯별 장비 목록·보정 줄·공훈치 줄. **보물 보정은 `SK.effStat`으로 내정 효율·탐색·등용·민심·배속 판정에도 들어간다** | `app.js` `showHeroInfo`·`equipLines`·`effStat` |
| 농원·시장 → 농업·상업 | 담당 장수가 있으면 매달 +1~3(건물 Lv·정치 비례), 월정산 `농업·상업 성장` 보고 | `app.js` `statGrowOf`·`runSlots` |
| 주점 배속 | 재야 인재가 있으면 **반값(50%) 등용** 자동 시도, 없으면 **주점 Lv×10% 보너스 탐색**. 월정산 보고 | `app.js` `runTavernDuty`, `explore(..., {boost})` |
| 공훈치 | `h.merit` + `SK.gainMerit` · `SK.gainExp(h, exp, merit)`(기본 exp/12). 건물 담당 월 2+Lv, 탐색·등용·계략·전투 | `app.js` `gainExp`·`gainMerit`, `battle.js` `victory`·`defenseVictory` |
| 관직 연동 | `SK.OFFICES.merit` 교위 80 / 중랑장 220 / 진동 500 / 진서 1,000 / 대장군 1,800 — 명성과 함께 확인 | `data.js` `OFFICES`·`meritOf`·`nextOfficeOf`, `app.js` `openAppoint*`·`renderCityGens` |
| 아·적 동반 성장 | `LV_GROW=0.018`(1레벨당 공·방 +1.8%, 승급 +6% 유지). 적 성 장수 **Lv.1 시작**(`cs.genLv`, 어려움 +1) | `battle.js` `makeAlly`·`makeNamedEnemy`, `app.js` `enemyGenLevel` |
| AI 내정·등용 | 매달 병력·성벽 + 농업·상업·치안, 재야 인재 확률 등용, 소속 장수 경험치·공훈·레벨업 | `app.js` `runAiDomestic`·`aiGenBook`, `advanceMonth` |
| 적 지원군 | 인접 같은 세력 성(병력 4,000+, 장수) → 70%로 최대 2성, 원 성 병력 45% 차감 후 적 부대로 합류. 출진·도착 창 경고 | `app.js` `aiSupportCandidates`·`rollAiSupport`·`openDeploy`·`openPendingMarch`, `battle.js` `opts.aiSupport` |
| 전투 배속 | 자동전투 기본 **×1(예전의 2배 느림)**, `[×1 배속]` 버튼으로 ×2(예전 속도). `paceMs`/`wait`가 대기·연출·적군 페이즈를 함께 늦춘다(수동 조작 영향 없음). 전투마다 ×1 시작 | `battle.js` `autoSpeed`·`paceMs`·`wait`·`toggleSpeed`·`loop`(sdt), `index.html` `#btn-speed`, `css` `.battle-speed` |
| 검증 도구 | `tools/v510_smoke.py`·`v510_logic.py`·`v510_month.py`·`v510_ui_gens.py` | `preview/v510/`·`preview/v510_live/` |

---

## 0.2 v5.9에서 바뀐 것 — 성 화면 시안 A·부상병·지원군·BGM (2026-11-20)

| 갈래 | 내용 | 코드 위치 |
| --- | --- | --- |
| 성 화면 3단 탭 | 그림 아래 `[내정]·[시설]·[장수]` 탭(`position:sticky`). 탭 배지 `3/6`·`9`. `cityTab`은 성을 넘겨도 유지 | `index.html` `#city-tabs`·`.city-panes`, `app.js` `setCityTab`·`renderCityTabs`(openCity에서 호출) |
| 성 그림 정리 | 얼굴 스티커·건물 아이콘·이중 Lv 배지 제거 → `.hs-pin > .hs-name` 1줄 이름표. 빈 터는 점선 `＋공터`. 클릭은 그대로 `openSlot` | `app.js` `renderYard`, `css` `.hs-pin` |
| 내정 탭 | `.dev-grid` 2열 막대 카드 6장(`devCard`) + `.ci-grid` 성 요약 8칸(`renderCityDev`의 `#city-info`) | `app.js` `devCard`·`renderCityDev` |
| 시설 탭 | `.slot-head`(칸·공터·`[모두 증축 N곳·금 N]`) + `.slot-grid` 2열 카드(담당 장수·경험 바·`증축` 배지) | `app.js` `renderCitySlots` |
| 장수 탭 | `renderApBar`(담당/대기/완료·매달 최선·군사·자동 배속) + `.gen-list` 카드(관직 배지 `SK.officeOf`, 충성, 대기/담당/수련/완료) | `app.js` `renderCityGens`·`renderApBar` |
| 부상병 | 손실의 35%+병영 Lv×3%p(≤50%)가 `cs.wounded`로. 달 바뀜에 35%(최소 200) 회복, 금 0.45/명 즉시 치료. 상한 = 성 병력 상한의 50% | `app.js` `SK.WOUND`·`woundedRatio`·`woundedCap`·`addWounded`·`tendWounded`·`openHealWounded`·`advanceMonth`(woundHeal), `battle.js` `lostOf` |
| 지원군 파견 | 육로/해로 인접 내 성에서 장수 3명·병력 파견 → 수성전 아군 합류 → 종료 시 원 성 귀환(손실은 부상병). 장수는 `h.rfgTo`로 명부 제외, `s.reinforce`에 편성 보관 | `app.js` `reinforceNeighbors`·`openReinforce`·`openReinforcePick`·`dispatchReinforce`·`cancelReinforce`·`openPendingInvasion`·`startDefense`, `battle.js` `settleReinforce`·`clearReinforceFlags` |
| BGM | 4레이어 FM 편곡(리드·아르페지오·패드·리듬) + 4탭 딜레이 잔향, 테마 6종(표지·내정·지도·야전·공성·승리), 1.15초 크로스페이드, `prewarm` 선렌더 | `js/bgm.js` 전체(`playLead`·`playPluck`·`playString`·`playBass`·`playDrum`·`makeFxBus`·`renderTheme`·`startTheme`), `app.js` DOMContentLoaded의 `bgm('title')` |
| 검증 도구 | `tools/v59_ui.py`(탭·레이아웃 390×680/800) · `v59_logic.py`(부상병·치료·지원군 귀환) · `v59_bgm.py`(6테마 렌더·레벨·크로스페이드) · `v59_run.sh`(로컬 서버+LD_LIBRARY_PATH) | `preview/v59/`, `preview/v59_live/` |

---

## 0.2b v5.8에서 바뀐 것 — 외교·포로·관직·돌발이벤트·입문가이드·30인 아트 (2026-11-20)

| 갈래 | 내용 | 코드 위치 |
| --- | --- | --- |
| 신규 아트 30인 | `a_rank` 18명 초상+SD, `korea` 12명 SD(초상은 계백·양만춘·온달). `top100` 목록 위에 `v58` 목록을 얹음 | `data/v58_art_manifest.json`, `js/data.js` `SK.addTopArt`, `js/app.js` `loadTopArt` |
| 이간계 | 성 → 적장 지목, 금 120 + 지력 대결로 충성 26~42 감소(`s.genLoyal`). 50 이하면 **회유** 버튼 → 매력 대결 성공 시 내 장수(충성 55) | `openEstrange`·`openEstrangeGen`·`lureGen`·`enemyLoyal`·`setEnemyLoyal` |
| 항복 권고 | 보유 2성 이하 또는 병력 2배 우위인 이웃 적성. 금 300 + 매력·배율 판정, 성사 시 성·병력 70%·장수 45% 흡수, 명성 +8 | `openSurrenderAdvice` |
| 동맹·휴전 | 휴전 6개월(금 200) / 동맹 12개월(금 600), `s.truce`+`s.pacts`. AI는 기간 중 침공 안 함, 내가 먼저 치면 명성 −8 | `openPeace`·`openPeaceTerms`·`PEACE_TERMS`, `planPlayerInvasion`, `openDeploy` |
| 포로 | 공격전·수성전 승리 시 적 명장 최대 2명 포로 → 등용(충성 55)/석방(금 180~500·명성 3)/처형(명성 −6, `s.deadGens`·`deadNames`로 재등장 차단) | `battle.js` `rollPrisoners`·`openPrisoners`·`makeNamedEnemy.genId`, `data.js` `SK.isDead` |
| 관직 | 교위 300 → 중랑장 900 → 진동 2,000 → 진서 3,500 → 대장군 6,000 명성. 출진 상한 5,000→6,000~10,000, 충성 +3~6, 봉급 +25~140 | `data.js` `SK.OFFICES`·`officeOf`·`troopCapOf`, `app.js` `openAppoint`·`openAppointPick`·`heroSalary` |
| 돌발 이벤트 | 3개월째부터 45% 확률. 상단 방문(보물 600/900) · 홍수·역병 구제(금 400+군량 300 → 민심 +7 vs −7) · 재야 명장 소문(금 450~1,200, 55% 합류) | `CHOICE_EVENTS` 대신 `rollChoiceEvent`·`showChoiceEvent`, `advanceMonth` 월정산 뒤 연결 |
| 입문 가이드 | 1~3턴 '책사 첫걸음' 배너(×로 끄면 다시 안 뜸), 민심·치안·훈련도·대수확·세율 `?` 2줄 설명, 세력 화면 ⭐ 입문 추천 + 난이도(쉬움 8개월 유예·금 +35% / 보통 4 / 어려움 2·금 −20%) | `renderCityGuide`·`HELP_TIPS`·`helpDot`, `DIFFICULTIES`·`renderDiffRow`·`diffOf`·`graceOf`, `s.difficulty` |
| 세력명·탐색 | `익주 유장군`→`유장군` 등 지역명 제거(200·208·220), 탐색도 보낼 장수를 직접 선택(배속 장수 자동 해제) | `data/historical_scenarios.json`, `openExplore` |

---

## 0.3 v5.7에서 바뀐 것 — 내정 편의·태수 위임·수송·충성·시세·세계제패 AI (2026-11-20)

| 갈래 | 내용 | 코드 위치 |
| --- | --- | --- |
| 성 전환 | 성 화면 헤더 `◀ / ▶`로 내 거점을 넘기고, 성 이름을 누르면 보유 거점 시트. 본성 → 지도 순서, `2 / 5` 표시, 1곳이면 숨김 | `index.html` `.ct-line1/.ct-line2`, `app.js` `ownedCityList`·`renderCityNav`·`stepCity`·`openCityPicker`, `bind()` |
| 태수 방침 5종 | `균형·상업 중시·농업 중시·전시 체제·수송 중시`. `chooseAutoAction`의 우선순위 표가 방침별로 갈리고, `수송 중시`는 `cs.supplyTo`로 매달 병력 자동 수송 | `POLICIES`·`policyOf`·`chooseAutoAction`·`runAutoDomestic`, 관아 `.op-grid`, `openSupplyPick` |
| 태수 자동 증축 | 경험이 찬 시설 1곳을 금 잔액 400 이상일 때 태수가 스스로 증축, 월정산 보고에 `시장 Lv.2 증축 (금 −550)` | `pickAutoUpgrade`(AUTO_UPGRADE_RESERVE), `runAutoDomestic` |
| 모두 증축 | 시설 머리 금테 `[모두 증축]` — 가능 수·총액 표시, 1탭 일괄(금 부족 시 앞에서부터) | `upgradableSlots`·`upgradeAll`·`renderCitySlots` `#btn-up-all` |
| 나이 빈칸 | `EXTRA_GENERALS.birth` → `birthYear`, 모르는 인물은 `세` 숨김 | `js/data.js` `EXTRA_GENERALS`·`registerExtras`, `app.js` `heroAge`·`renderCityGens` |
| 연병장 수련 | 수련 명단 최대 6명, 달이 바뀔 때 경험치(61~63) + 그달 행동 소모, 카드에 `연병장 수련` | `cs.trainCrew`·`trainCrewOf`·`crewGain`·`openTrainCrew`·`runTrainCrew`·`dutyOf` |
| 수송·전출 | 군사 → 수송에서 병력·금·군량 + 장수 전출(보유/상한/남는 자리), 전출 시 배속·태수·군사 자리 자동 해제 | `openTransport`·`openTransportAmount` |
| 충성 | 관아 `[포상]` 금 100 → +8(70↑ +4, 90↑ +2), 보물 +15. 40 미만 경고. 전장 공격·방어 ×(0.86+충성×0.0014) | `loyalOf`·`loyalGain`·`openReward`·`openTreasureGift`, `battle.js` `makeAlly` `loyMul` |
| 시세 | `ricePrice()` — 월별 85~160 + 턴별 ±6(금 100당 쌀 80~160). `[군량 상인]` 사기/팔기 ×100·500·1000 | `RICE_YIELD`·`ricePrice`·`riceCheap`·`openRiceTrader` |
| 세율 | 전 거점 공통 `낮음 0.75·민심+2` / `보통` / `높음 1.35·민심−3`. 예상 수지·월정산 동일 반영 | `TAX_RATES`·`taxRateOf`·`econForecast`·`advanceMonth`, 관아 `.tax-row` |
| 출진 모달 | 카드에 소속 성·상태(대기/시장 담당/연병장 수련)·충성 40 미만 배지, 장수명 nowrap, 행군 1일엔 요격 문구 숨김 | `heroPickRow`, `openDeploy` `.march-note`, css `.hp-badges` |
| 세계제패 AI | 4개월 유예 → 병력 1.45배면 이웃 중립·약소 성 점령(월 최대 2건, 승률 0.32+(배율−1.45)×0.5). 1.55배면 한 달 전 첩보 경고 → 다음 달 `pendingInvasion` | `AI_GRACE_TURNS`·`aiAttackPlan`·`resolveAiRaid`·`runAiCampaigns`·`planPlayerInvasion`·`syncFactionCities` |
| 수성전 | `SK.BATTLE_TYPES.defense`(공성전 지도를 뒤집음). 주둔 장수 최대 6 + 수비병 부대. 승리 → 성 유지·민심+6·명성+10, 패배 → 성 상실·잔여 병력/장수는 가까운 내 성으로 | `defenseUnits`·`openPendingInvasion`·`startDefense`·`surrenderCity`·`loseCity`, `battle.js` `defenseVictory`·`defenseDefeat` |
| v5.7.1 배속 파견 | 배속에서 `actedThisMonth`를 찍지 않고 `applyDuty`가 달 바뀔 때 집계. 주점 사신·정찰·위무·수송·내정 명령 목록에 담당 장수 노출(`시장 담당 · 파견 시 자동 해제`), 보내면 자동 해제 | `dispatchPool`·`dutyLabelOf`·`releaseDuty`·`consumeDispatch`·`pickActor`·`finishAction`·`applyDuty` |
| 검증 | `tools/v57_smoke.py`·`v57_flow.py`·`v57_ai.py`·`v57_defwin.py`·`v57_supply.py`·`v57_crew.py`·`v57_play.py`·`v57_duty*.py`, 스크린샷 `preview/v57/` |  |

주의: `SK.BATTLE_TYPES.defense`는 `map: 'siege'`를 쓰고 `SK.allySlots/enemySlots('defense')`가 공성전과 **반대** 좌표다. 수성전에는 성문(`B.gate`)을 만들지 않는다(성문 판정이 아군 이동까지 막는다).

---

## 0.4 v5.6에서 바뀐 것 — 도안 A 지도·80거점 확정 좌표·성 화면 하단 (2026-11-20)

| 갈래 | 내용 | 코드 위치 |
| --- | --- | --- |
| 지도 베이스 | 지형 밑그림이 **도안 A 그림**(`assets/map_bg.webp` 2000×1333 WebP 592KB)로 교체. `renderTerrain()`이 `0..1×0..1` 맵 공간에 그리고, 그림이 있으면 절차적 바다·산·숲·강은 그리지 않는다. 로드 실패 시 `buildStatic(false)`로 옛 지형 자동 복귀 | `js/map.js` `loadBg`, `renderTerrain`, `renderFeatures`, `buildStatic(lite)` |
| 좌표 | 80거점 `(u,v)` = `preview/v56_final_coords.json`(사용자 7차 검수분). 영안 `0.432/0.629`, 안시성 `v−0.012`, 철원 요새 `u−0.018` 반영 | `js/mapgeo.js` `cities`, `js/city_geo.js` `CITY_META` |
| 도로 | `건업—건안`·`무위—안정`·`무위—천수`·`금성—안정` 제거, `한중—상용` 추가 → 육로 **104** | `SK.ROAD_EDGES`, `SK.MUST_ROADS` |
| 수로 | 요동에 붙은 배길(`liaodong—pyongyang`, `beihai—liaodong`) **전부 제거** → 해로 **7**. `SEA_ONLY_PAIRS`도 정리 | `SK.buildRoads` `sea`, `SK.SEA_ONLY_PAIRS` |
| 바다 판정 | 도안 A에서 뽑은 육지 마스크(`js/mapmask.js` 400×267 1비트 `SK.landAt`, `assets/map_land.png`). `roadIssues()`가 이 마스크로 바다 횡단을 검사(해안 성 18px·같은 섬 육로·무위 종점 예외). 영토 색칠도 `map_land.png`로 오려낸다 | `tools/v56_landmask.py`, `js/mapmask.js`, `SK.roadIssues`, `drawTerritory` |
| 영토·길 | 틴트 알파 0.30 + **이웃 세력 경계 테두리**, blur 2px. 육로 4.2/2.6/1.5로 가늘게, 해로 점선 유지 | `drawTerritory`, `renderRoutes` |
| 성 화면 | `#app { height: 100dvh }` + `#city-mid`(성 그림·내정 정보·장수·행동)만 스크롤, `.city-commands`는 `flex: 0 0 auto`. 390×680·720·844 모두 하단 6버튼 잘림 0 | `index.html` `#city-mid`, `css/game.css` `.city-mid`·`.city-commands` |
| 행군 | `marchTurns()` = **하비↔낭야(91px)** 기준, `d ≤ ref×1.05` → **1일**, 그 외 **2일**(요격 가능). 문구도 `행군 N일` | `js/app.js` `marchTurns`, `MARCH_REF` |
| 검증 | `tools/v56_probe.py`(`roadIssues()` `[]`·BFS 80/80·요동 해로 0), `v56_map.py`, `v56_city.py`, `v56_smoke.py`, `v56_terr.py`. 스크린샷 `preview/v56/` |  |

주의: 지도 배경·육지 마스크는 **도안 A 그림에서 파생**된다. 배경을 바꾸면 `tools/v56_landmask.py`를 다시 돌려 `js/mapmask.js`·`assets/map_land.png`를 새로 만들어야 한다(좌표도 그림 기준으로 다시 맞춰야 한다).

---

## 0.5 v5.5에서 바뀐 것 — 내정 모션·장수 파견·80거점 (2026-11-20)

| 갈래 | 내용 | 코드 위치 |
| --- | --- | --- |
| 인구 성장 | `popMonthly(cs,c)` — `0.22% + 농업/100×0.6% + 상업/100×0.35% + (민심−50)/100×0.6% + (치안−50)/100×0.3% + 시설 Lv합×0.009% + 인구기술`(클램프 −1.2~+2.2%). 민심 40 미만은 소란 성으로 집계 | `app.js` `popMonthly`, `advanceMonth` |
| 인구 표시 | 성 화면 인구 옆 `(+N/월)`(개발도 머리·정보 줄 2곳), 월정산 `인구 성장 N곳 · 감소 M곳 ±N` | `renderCityDev`, `advanceMonth` |
| 성 안 모션 | `#city-life` 캔버스에 2등신 백성·농부·상인·훈련병·순찰병(최대 28명)이 시설 주변을 오가고 일한다. 인구·민심·시설 수에 비례, 이미지·GIF 없음, 화면이 활성일 때만 rAF | `CityLife`(app.js), `css/game.css` `.city-life` |
| 자동 배속 | `[＋ 자동 배속]`이 빈 곳만이 아니라 **모든 건물을 최선으로 재배치**(`bestDutyPlan`, 점수=능력치×10+종합×0.25). `[매달 최선 ON/OFF]` 토글(기본 OFF)을 켜면 달이 바뀔 때 성마다 자동 재배치 | `autoAssignDuty`, `bestDutyPlan`, `renderApBar` |
| 정찰 | 금 45 + **대기 장수 1명의 이번 달 행동**. 지력·매력으로 **3~5개월**(`scoutMonths`). 지도 적성 시트의 `[정찰 보내기]`는 `SK.openScoutSheet`로 맞닿은 내 성 장수를 고른다 | `SK.scoutCity`, `openScoutPick`·`openScoutEnvoy` |
| 적성 카드 | 정찰된 적성 장수 카드에 **둥근 네모 금테 초상** + **병종/직업 배지**(`.mg-job.j-*` 색 구분: 기병·궁기 붉은, 창·검·등갑 파란, 궁·연노 초록, 책사·풍수사·도사 보라) | `openCitySheet`, `css` `.mini-gen .mg-frame` |
| 인재 등용 | 주점 위에 **사신 줄**(대기 장수, `매력` 표시) — 사신을 바꾸면 등용 확률·값이 그 장수 기준으로 다시 계산 | `openTavern` `.envoy-row` |
| 백성 위로 | 단순 금 버튼 → **대기 장수를 골라 파견**(금 100 + 그 장수의 행동). 상승량 `3 + (매력×0.6+정치×0.4−60)×0.16`(2~16) | `openComfort`, `comfortGain` |
| UI 정리 | 성 헤더 `YYYY년 M월`(`#city-date`), 내정 수치 전면 `Math.round`, 증축 문구 `담당 장수를 배속해 N개월 더 운영하면 증축할 수 있습니다`, 360×740~390×844에서 하단 6버튼 잘림 없음 | `openCity`, `renderCityDev`, `css` |
| 3단계 도시 | **대도시 12**(장안·낙양·허창·업·성도·양양·건업·한중·평양·한성·경주·타이베이) / **중도시 20**(남피·계·진양·북평·복양·진류·완·하비·여남·수춘·강릉·장사·합비·회계·오·시상·요동·국내성·웅진·완산) / **소도시 37**(평원 포함) / 관문 9 / 요새 2 = **80거점** | `data/cities.json`, `SK.TYPE_KEY`, `ECON_MUL`, `SLOT_MAX`, `js/map.js` |
| 중도시 수치 | `econMul 1.22`, 인구 15~24만(상한 42만), 공터 **7**(소 6·대 8), 지도 아이콘 26px(소 22·대 30), 시작 Lv.2, 새 아이콘 `assets/icons/mid.webp` | `app.js` `basePop`·`cityPopCap`, `map.js` `ICON_*` |
| 신규 거점 | **부여**(국내성 북서, 0.831/0.046) · **옥저**(함흥 북동, 0.934/0.082) 소도시. 도로 `국내성—부여—옥저—함흥`, 전 시나리오 고구려 영지(190은 시작 상한 1로 수도만) | `js/mapgeo.js`, `js/city_geo.js`, `SK.ROAD_EDGES`, `historical_scenarios.json` |
| 좌표 이동 | **운남** 0.076/0.732(노수 관문 아래 강 건너 북쪽) · **자동** 0.209/0.628(검각 아래 남동 강변) · **시상** 0.600/0.620(건업–오 호수 남서) · **장사** 0.484/0.678(동쪽) | `js/mapgeo.js`, `js/city_geo.js` |
| 도로 감사 | `SK.roadIssues()` `[]` — 80거점·육로 108·해로 9, 190/200/208/220 모든 세력 한 덩어리 | `SK.roadIssues` |

새 저장 필드: `state.autoBestDuty`(기본 false). `SK.load()`가 없으면 채운다.

검증: `tools/v55_probe.py`(80거점·roadIssues·시나리오 연결), `v55_map.py`(운남·자동·시상·장사·부여·옥저 확대 스샷), `v55_city.py`(성 화면·하단 버튼), `v55_flow.py`(자동 배속·정찰 사신), `v55_flow2.py`(주점 사신·관아 민심·월정산·정수), `v55_flow3.py`(매달 최선·적성 배지·360×740). 스크린샷 `preview/v55/`.

---

## 0.6 v5.4에서 바뀐 것 — 내정 경제 밸런스 (2026-11-20)

| 갈래 | 내용 | 코드 위치 |
| --- | --- | --- |
| 금 수입 | 도시 세수 + 시장 Lv.1~5(`marketGold` 110/180/280/400/560 × 담당배율) + 관작 봉급 | `app.js` `advanceMonth`, `runSlots`, `econForecast` |
| 금 지출 | **휘하 장수 봉급** — S 28 · A 19 · B 14 · C 10, 군주 +4, 레벨마다 +3% (`heroSalary`) | `ECON.salary`, `payrollOf` |
| 군량 | 도시 기본 쌀 수확 **삭제**. **병력 1,000명당 월 20** 유지비(행군 병력 포함, `upkeepOf`) | `ECON.upkeepPer1000` |
| 10월 대수확 | `s.month === 9`에 성마다 `c.food × 0.30 × (0.6+농업/100) × (0.85+민심/250) × (1+농원배율) × 기술` | `harvestOf()` |
| 농원 | 매달 `30 × Lv × 담당배율 × 도시배율` 비축 + 대수확 배율 `0.09 × Lv × 담당배율` | `runSlots`, `harvestOf` |
| 기근 | 군량 0 클램프 + **민심 −3 · 병력 3% 이탈**, 월정산 경고 | `advanceMonth` `famine` |
| 시작 군량 | 유지비 **10.5개월치** ±5% (유비 2,561 · 동탁 12,085) | `newState` |
| 증축 | `buildUp` [0, **550**, 1,200, 2,600, 5,200], 시설 경험 `slotExpNeed = 40 + 35×Lv` (첫 증축 2~3개월) | `ECON.buildUp`, `buildCost`, `slotExpNeed` |
| 이벤트 | 한 달 이벤트 금·군량 보상을 세력 규모에 비례해 0.35배로 줄임 | `applyDomesticEvent` |
| UI | 지도 상단 `월 순금 / 월 군량 / 🌾 대수확 D개월` 줄 → **경제 현황** 창(`openEcon`), 월정산 금·군량 2단 결산 + 시설별 경험치·`증축 가능!` | `index.html` `#econ-strip`, `openEcon`, `runSlots.grow` |
| 성 화면 | `[＋ 자동 배속]`(빈 건물에 최적 장수), 담당 칩 `순찰소 담당` 식 표기(`dutyOf`), 훈련도 정수, 관아 처마 간판, 장수 초상 둥근 네모 금테, 명부 병종 배지, `[추천]` 초록 배지 | `autoAssignDuty`, `renderApBar`, `renderYard`, `dutyOf`, `css/game.css` v5.4 블록 |

**밸런스 기준값** (`tools/v54_sim.py`, 190년 1월 → 191년 12월, 시장·농원 건설/증축 + 소규모 징병 + 담당 배속):

| 세력 | 첫 10월 전 최저 | 첫 대수확 | 직후 | 191년 12월 | 기근 |
| --- | --- | --- | --- | --- | --- |
| 유비군(1성) | 3.3개월치(1,560) | +6,338 | 20.6개월치 | 금 3,590 · 군량 17,553(28.3개월) | 0회 |
| 동탁군(5성) | 2.8개월치(4,827) | +23,192 | 15.1개월치 | 금 17,740 · 군량 34,018(17.1개월) | 0회 |

> 튜닝할 때: `ECON` 상수 한 곳만 고치면 세수·봉급·유지비·수확·증축이 함께 움직입니다. 고친 뒤 `tools/v54_run.sh tools/v54_sim.py`로 24개월 표를 다시 뽑아 **첫 10월 전 최저 2.5개월 이상 · 대수확 뒤 12개월 이상 · 2년 말 금/군량 100,000 미만**을 확인하세요.

---

## 0.7 v5.3에서 바뀐 것 (2026-11-20)

| 갈래 | 내용 | 코드 위치 |
| --- | --- | --- |
| 세력 선택 | 모달 → 전용 화면 `#screen-faction`(먹·나무결·금테). 카드에 군주 초상·색 뱃지·수도·거점·장수 | `index.html`, `openFactionPicker` · `factionScreenCard` |
| 성 내성 | 핫스팟 명패(금테 목재), 관아 금테 원형, 시장 위치 보정, 수치판·장수 카드·6버튼 양피지+금테 | `css/game.css` 끝 `v5.3` 블록, `YARD_SPOTS` |
| 신규 거점 | **금성(geumseong)** — 서북 황하 굽이. 77→78거점, 무위·천수·안정과 도로 | `js/mapgeo.js`, `js/city_geo.js`, `data/cities.json`, `SK.ROAD_EDGES` |
| 지도 수정 | 190 원소=`업·남피·호관`, 안시성↔요동 간격·직선 도로, 한반도 `부산↔완산`(웅진↔완산·광주↔한성 제거) | `data/historical_scenarios.json`, `SK.ROAD_EDGES` |
| 세력 별칭 | 한수군 금성=실제 성, 신라 금성=경주, 백제 마한북부=한성 | `SK.ALIAS_BY_FACTION` |
| 등용 | `recruitChance()` — 등급+매력·지력+명성+친밀. 실패 시 금 0, 행동만 소모, 그달 재시도 불가(`state.recruitFail[genId]=turn`) | `openTavern` |
| 담당 정렬 | `dutyCandidates()` — `SLOT_DEFS[key].stat` 내림차순, 1등 `[추천]` | `openSlot`·`openDutyPick` |
| 출진 | 최소 1,000 / 기본 2,000, `SK.REGIMENTS` 전부 2,000, `makeRegiment` 스탯 하향 | `openDeploy`, `js/data.js`, `js/battle.js` |
| 행군 | `state.marches`(id·origin·target·units·total·left), `startMarch`·`stepMarches`·`openPendingMarch`, 지도 ⚔ 마커 | `js/app.js`, `js/map.js` `syncMarchMarks` |
| 요격전 | 평야·도하·산악·수전·매복 5종. `interceptTypeFor()`가 바다·강·지형으로 고름. 승리 시 잔여 병력으로 계속, 패배 시 회군 | `SK.BATTLE_TYPES`·`SK.MAPS`·`SK.enemySlots/allySlots`, `interceptVictory/Defeat` |
| 책략 AI | 회복>디버프>광역버프>공격책략>단일·자기버프. `planSupportSkill()`·`aiCast()`를 아군 `[자동]`·적 AI 공용 | `planAuto`, `autoStep`, `enemyAct` |
| 공성전 | 성문 HP `clamp(수비병*0.18+700,1000,2400)`, 무명 수비 스탯 하향, **망루 `T` 2칸·본성 `K` 2칸**(방어 ×1.45, 턴당 15% 회복) | `siegeMap()`·`siegeTower`·`siegeKeep`·`effDef`·턴 리셋 |
| HUD | 미선택 시 책공/책방 `-` 초기화 | `SKBattle.refreshUI` |

> 새 저장 필드: `state.marches`, `state.marchSeq`, `state.pendingMarch`, `state.recruitFail`, `hero.marchId` — `SK.load()`가 없으면 채웁니다.
> 행군 중인 장수는 `h.marchId`가 붙고 `cityGens()`에서 빠집니다(성 화면·담당·출진 목록에서 안 보임). 도착·승리·패배·후퇴 때 해제됩니다.

검증: `tools/v53_probe.py`(78거점·`roadIssues()` `[]`·190 20세력 전부 한 덩어리), `v53_smoke.py`, `v53_flow.py`(요격 승리→행군 계속→도착 공성→함락), `v53_siege.py`(10,000 vs 4,000 자동 승리: 8턴·잔여 6,655), `v53_hold.py`(망루·본성 턴 회복 +15%·지형 표시), `v53_ui.py`(등용 51%·실패 금 0·[추천]·기본 2,000). 스크린샷 `preview/v53/`.

---

## 0.8 v5.2에서 바뀐 것 (2026-11-20)

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

## 0.9 v16 — 시나리오 선택 화면 (2026-11-20)

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

- 지도 도로망 78거점을 손으로 고정(`SK.ROAD_EDGES`)하고, 지형·영토·산맥·성 아이콘을 v5.0.2에서 다시 그렸습니다. (v5.5에서 80거점·중도시 포함으로 확장)
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

- **캐시 버스터**: `index.html` 안의 `?v=22` 9곳(`game.css`, `mapgeo.js`, `city_geo.js`, `data.js`, `bgm.js`, `sfx.js`, `app.js`, `map.js`, `battle.js`)을 배포마다 **+1** 합니다. 이걸 빼먹으면 폰에서 옛 파일이 계속 돌아 "고쳤는데 안 바뀐다"가 됩니다.
- 라이브 확인은 폰 브라우저에서 `.../samgukji-jojo1/?v=22`처럼 버전을 붙여 여는 게 확실합니다.
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
| `cities.json` | 78 | `id, name, type(대도시/소도시/관문/요새), faction(위/촉/오/군웅/한국), battleType, gold, food, troops, defense, governor` | 좌표는 `js/city_geo.js`에서 이름으로 연결 |
| `generals.json` | 585 | `id, name, faction, tier(S/A/B/C), job, leadership, war, intel, politics, charm, skill(고유특기명), birthYear, debutYear` | `debutYear` 전에는 등용·수비 배치에서 제외 |
| `historical_scenarios.json` | 4 | `id, year, title, historyNote, timelineEvents[], factions[]` | 190(20세력)·200(13)·208(12)·220(9) |
| `classes.json` | 18 | `job, promotions[4], moveRange, attackRange('1' 또는 '1~4'), terrainBonus{siege,naval,mountain,fortress}, skills[{name,mp,unlockLv,effect}]` | **런타임에 `SK.CLASSES`를 덮어쓴다** (7장 규칙 7) |
| `tech_tree.json` | 24 | `id, category(군사/내정/…), tier, name, costGold, turns, prereq, summary, bonus{atkPct,defPct,goldPct,foodPct,popPct,wallPct,recruitPct}` | `SK.techPct(key)`가 합산 |
| `unique_passives.json` | 100 | `name, title, trigger(on_attack/…), effect, valuePct, cooldown` | 장수 카드·전장 발동 |
| `treasures.json` | 151 | `id, name, type(무기/방어구/명마/병법서), grade(전설/…), statBonus{war,intel,leadership,charm,politics,move}, effect, dropHint` | v5.0.1에서 `쌍고검` 추가로 150→151 |
| `top100_art_manifest.json` | 100 | `이름: {id, rank, portrait, unit}` | 전용 일러스트 경로 |
| `v58_art_manifest.json` | 30 | `이름: {id, portrait?, unit?}` | v5.8 A급 18인·한국 12인. `SK.addTopArt`가 위 100인 목록 위에 얹음 |
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

- **지도**: 80거점 = 대도시 12·중도시 20·소도시 37·관문 9·요새 2. 육로 108개 + 해로 9개. 한국(고구려·백제·신라 계열)·대만 포함, 일본 제외. 섬(탐라·대만)은 배로만.
- **전장 유형**: 도시=**공성전 고정**, 관문=산전, 요새=요새전. 수전은 바다를 건너는 행군·요격전에서 쓸 예정(`SK.battleTypeFor`).
- **내정**: 성마다 건물 슬롯, 담당 장수에 따라 생산 50~150%, 장수는 **월 1행동**. `다음 달` → 확인창(대기 장수 N명) → 월 배너 → 월정산.
- **인재**: 주점 등용(성 인근·길로 이어진 성), 탐색(금 0, 월 행동 소모)으로 보물·은거 인재·의용병·산적·맹수·일기토. 성당 장수 상한 **99명**.
- **경제**: 시작 금 1성 1,200~1,500 / 대세력 2,500~4,000, 시작 군량 = 유지비 10.5개월치. 매달 `세수 + 시장 + 관작 봉급 − 장수 봉급`이 금으로, **병력 1,000명당 20**이 군량으로 나갑니다. 도시 기본 쌀 수확은 없고 **10월 가을 대수확** 한 번이 1년치를 댑니다. 병력 상한 = 인구의 **17%**(`cityCap`). 정찰 45 · 유언비어 80 · 이간계 100 · 화친 200.
- **명성·관작**: 명성 오르면 관작 승진 → 봉급·병력 보너스.
- **전투**: 18×18, 이동·공격·책략·아이템, 병과 배지, 사거리(궁수 4·궁기 4·연노 5·포차 5·발석차 7), 성문 2배 피해(공성 병기), 경험치·레벨업.

---

## 7. 절대 깨면 안 되는 규칙 (사용자가 직접 정한 것)

1. **모바일 세로 390×844 우선.** 사용자는 **PC가 없고 폰만** 씁니다. 데스크톱 레이아웃을 먼저 만들면 안 되고, 엄지가 닿는 하단에 주요 버튼을 둡니다(내정 화면 오른쪽 아래 `지도` 버튼 등).
2. **UI에 한자를 쓰지 않는다.** 코드에 `hanja` 필드가 남아 있지만 `js/data.js` 끝부분에서 병과·스킬·인물·전장 유형의 `hanja`를 전부 `''`로 비웁니다. 새 데이터를 넣을 때도 한자를 화면에 내보내지 마세요.
3. **날짜는 아라비아 숫자 월.** `190년 1월` 형식(`SK.dateLabel`). `정월`·`건안 5년` 같은 표기 금지.
4. **군주는 언제나 자기가 있는 성의 태수.** `enforceLordGovernor()`가 강제하고, `appointDefaults()`는 군주를 태수·군사 자동 임명에서 뺍니다. 관아 문구도 `대기 장수 N명` 기준.
5. **계열(위·촉·오·군웅·한국)을 섞지 않는다.** `SK.EARLY_RETAINERS`(30세력·255명) 밖 인물을 `enrichFactions`가 끌어오면 고증 오류로 취급됩니다. 예: 190 유비 평원 = 유비·관우·장비·손건·미축·간옹·미방 **7명**(v5.15 확정).
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

### B. 2~3턴 행군 + 요격전 4~5종 — ✅ v5.3에서 완료(`?v=17`)

> 완료 내용: `state.marches`·지도 ⚔ 마커·한 달 단위 전진, 평야·도하·산악·수전·매복 5종 요격전, 승리 시 잔여 병력으로 계속·패배 시 회군. `tools/v53_flow.py`로 검증.

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
SK.CITY_LIST.length             // 78
SK.ROAD_EDGES.length            // 102
SK.roadIssues()                 // [] 이어야 함 (끊긴 길·바다 관통·겹침 감사)
Object.keys(SK.CLASSES).length  // 19
```

1. **390×844** 뷰포트(headless 브라우저)로 새 게임 → 유비(평원) 시작.
2. 지도: 팬(드래그)·줌(+버튼)·내 성 탭(내정 진입)·적성 탭(미정찰 시트→정찰 45금) 동작, 이름·아이콘 겹침 0.
3. 내정: 공터 건설(금 차감 확인) → 담당 지정 → `다음 달` 확인창 → 월 배너 → 월정산 숫자 변화 → 같은 화면 유지.
3-1. 경제: 상단 `월 순금/월 군량/🌾 대수확` 줄 → 경제 현황 창, 월정산 금·군량 2단 결산과 `시설 성장` 줄, 10월 대수확 카드, 군량 0일 때 민심 −3·병력 이탈 경고.
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
라이브: https://hojin8811-dev.github.io/samgukji-jojo1/?v=17
먼저 저장소 최상위의 HANDOFF.md 를 끝까지 읽고, README.md 와 V5_ROADMAP.md 로 최신 상태를 확인해라.

[프로젝트] 모바일 세로 390×844 우선, 정적 HTML/CSS/JS(빌드 없음), 후한 말 삼국 배경 턴제 전략.
전국 지도 80거점 내정 + 《삼국지 조조전》식 18×18 격자 전장. 585장수·19병과·4시나리오.
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
window.__errs 0, SK.CITY_LIST 78, SK.roadIssues() [] 를 확인해라. 끝나면 바뀐 파일·검증 결과·남은 일을 요약해라.
```

---

*이 문서는 v5.0.3 기준입니다. 큰 변경이 있으면 이 파일도 같이 갱신해 주세요.*
