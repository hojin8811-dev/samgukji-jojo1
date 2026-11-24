/* v5.82 — S급 필살기 개성 보강 (계획안 36명 손 설계 + 나머지 S급 병과·능력치 자동 차별화)
   · 이름(n)·대사(q)·그림(v)·색(c)은 그대로 두고 효과(e)와 한 줄 설명(desc)만 바꾼다.
   · 이 파일은 js/data.js 뒤에 읽어 SK.ULTIMATES 를 덮어쓴다. */
(function () {
  var T = {
    '조조': { e: {"r":2,"k":"aoe","m":0.9,"morale":-12,"buff":{"atk":0.1,"turns":2}}, desc: "2칸 광역 90% + 적 사기 -12, 아군 전체 공격 +10%(2턴)", skill: "패왕의 위엄" },
    '유비': { e: {"k":"buff","r":9,"allyHit":{"pct":80,"r":1},"buff":{"def":0.15,"turns":2},"heal":{"pct":0.2}}, desc: "아군 전체 HP 20% 회복 + 방어 +15%(2턴), 인접 적 80% 피해", skill: "인덕의 맹약" },
    '손권': { e: {"k":"line","len":3,"m":1.1,"burn":{"turns":2,"dot":0.08}}, desc: "3칸 직선 110% + 화상 2턴(턴당 8%)", skill: "강동 수군 화계" },
    '여포': { e: {"k":"hit","m":1.5,"pierce":1,"onKill":{"extraAction":true}}, desc: "단일 150% 방어 100% 무시, 처치 시 즉시 재행동", skill: "방천화극 난무" },
    '관우': { e: {"k":"hit","m":1.3,"execute":{"hpBelow":50,"bonusPct":70}}, desc: "단일 130%, HP 50% 이하 적에게 +70% 추가 피해", skill: "청룡언월 참마" },
    '장비': { e: {"r":2,"k":"aoe","m":0.9,"stun":{"chance":1,"turns":1},"morale":-15}, desc: "2칸 광역 90% + 기절 1턴 + 적 사기 -15", skill: "장판교 대갈일성" },
    '조운': { e: {"k":"combo","n":3,"m":1.65,"selfBuff":{"evade":0.3,"turns":2}}, desc: "3연타(각 55%) + 회피 +30%(2턴)", skill: "칠진칠출" },
    '마초': { e: {"k":"line","len":3,"m":1.0,"moveBonus":20,"stun":{"chance":0.3,"turns":1}}, desc: "3칸 직선 관통 100%, 이동 후 +20%, 30% 기절", skill: "서량 철기 돌진" },
    '하후돈': { e: {"k":"hit","m":1.2,"lifesteal":0.5,"onKill":{"heal":0.2}}, desc: "단일 120% + 50% 흡혈, 처치 시 HP 20% 회복", skill: "발안탄정" },
    '제갈량': { e: {"r":2,"k":"magic","p":1.1,"stun":{"chance":0.7,"turns":1},"mp":{"gain":20}}, desc: "2칸 뇌격 110% + 70% 기절 + MP 20 회복", skill: "뇌격진" },
    '주유': { e: {"r":2,"k":"magic","p":1.0,"burn":{"turns":3,"dot":0.08}}, desc: "2칸 광역 화계 100% + 화상 3턴(턴당 8%)", skill: "적벽 열화" },
    '사마의': { e: {"k":"magic","r":0,"p":1.2,"mp":{"drain":15},"debuff":{"atk":-0.2,"turns":2}}, desc: "단일 계략 120% + 적 공격 -20%(2턴) + MP 15 흡수", skill: "낭고지상" },
    '이순신': { e: {"k":"buff","r":9,"enemyAll":{"morale":-12,"burn":{"turns":2,"dot":0.06}},"buff":{"atk":0.15,"def":0.15,"turns":3}}, desc: "아군 전체 공·방 +15%(3턴), 적 전체 사기 -12 + 화상 2턴", skill: "학익진" },
    '세종대왕': { e: {"k":"buff","r":9,"enemyAll":{"morale":-8},"mp":{"gain":20},"buff":{"atk":0.1,"magicDef":0.3,"turns":3}}, desc: "아군 전체 공격 +10%·계략방어 +30%(3턴), MP 20 회복, 적 사기 -8", skill: "집현전의 지혜" },
    '광개토대왕': { e: {"k":"line","len":4,"m":1.1,"onKill":{"allyMorale":8},"morale":-10}, desc: "4칸 직선 관통 110% + 적 사기 -10, 처치 시 아군 사기 +8", skill: "정복군주의 질주" },
    '을지문덕': { e: {"r":2,"k":"aoe","m":0.9,"debuff":{"move":-2,"turns":2}}, desc: "2칸 광역 90% + 적 이동력 -2(2턴)", skill: "살수대첩" },
    '강감찬': { e: {"r":2,"k":"aoe","m":1.0,"buff":{"def":0.2,"counter":0.25,"turns":2}}, desc: "2칸 광역 100% + 아군 방어 +20%·반격 +25%(2턴)", skill: "귀주대첩" },
    '안중근': { e: {"k":"hit","m":1.0,"crit":{"chance":1,"mul":1.8},"stun":{"chance":1,"turns":2}}, desc: "단일 치명 확정(×1.8) 100% + 기절 2턴", skill: "하얼빈의 의거" },
    '김유신': { e: {"k":"hit","m":1.3,"moveBonus":15,"adjacentBuff":{"atk":0.15,"turns":2}}, desc: "단일 130%, 이동 후 +15%, 인접 아군 공격 +15%(2턴)", skill: "화랑 검진" },
    '연개소문': { e: {"k":"combo","n":5,"m":2.0,"shred":{"def":-0.04}}, desc: "5연타(각 40%), 타격마다 적 방어 -4% 누적", skill: "오검 난무" },
    '손책': { e: {"k":"line","len":2,"m":1.2,"morale":-10}, desc: "2칸 직선 120% + 적 사기 -10", skill: "소패왕의 돌격" },
    '동탁': { e: {"r":2,"k":"aoe","m":0.85,"debuff":{"atk":-0.15,"turns":2}}, desc: "2칸 광역 85% + 적 공격 -15%(2턴)", skill: "폭정의 압제" },
    '원소': { e: {"r":1,"k":"aoe","m":0.9,"buff":{"atk":0.12,"turns":2}}, desc: "1칸 광역 90% + 아군 전체 공격 +12%(2턴)", skill: "하북의 위세" },
    '황충': { e: {"k":"hit","m":1.4,"rng":4,"pierce":0.3,"crit":{"chance":0.5,"mul":1.5}}, desc: "사거리 4 단일 140%, 방어 30% 무시, 50% 치명(×1.5)", skill: "백보천양" },
    '태사자': { e: {"k":"combo","n":2,"m":1.3,"rng":3}, desc: "사거리 3 2연사(각 65%)", skill: "신사 연발" },
    '감녕': { e: {"k":"hit","m":1.1,"morale":-20}, desc: "단일 110% + 적 사기 -20", skill: "백기 야습" },
    '허저': { e: {"k":"hit","m":1.4,"pierce":0.4,"stun":{"chance":0.4,"turns":1}}, desc: "단일 140% 방어 40% 무시 + 40% 기절", skill: "호치의 광분" },
    '전위': { e: {"r":1,"k":"aoe","m":1.0,"cover":true,"stun":{"chance":0.5,"turns":1},"selfDef":0.4}, desc: "1칸 광역 100% + 50% 기절, 자신 방어 +40%(2턴), 3턴간 인접 아군 피해 40% 대신 받음", skill: "악래의 방패" },
    '방통': { e: {"r":2,"k":"magic","p":1.0,"burn":{"turns":2,"dot":0.07},"debuff":{"move":-1,"turns":2}}, desc: "2칸 광역 계략 100% + 화상 2턴 + 이동력 -1", skill: "연환계" },
    '육손': { e: {"k":"line","len":3,"stat":"int","p":1.0,"burn":{"turns":3,"dot":0.08},"morale":-10}, desc: "3칸 직선 계략 100% + 화상 3턴 + 적 사기 -10", skill: "이릉 화공" },
    '장료': { e: {"k":"hit","m":1.3,"onKill":{"extraAction":true},"morale":-15}, desc: "단일 130% + 적 사기 -15 + 처치 시 재행동", skill: "소요진 8백 돌파" },
    '방덕': { e: {"k":"hit","m":1.2,"lowHpBonus":{"per10":6,"max":60}}, desc: "단일 120%, 잃은 HP 10%마다 +6%(최대 +60%)", skill: "관을 지고 싸우다" },
    '계백': { e: {"k":"hit","m":1.5,"selfCost":{"hpPct":15},"onKill":{"allyMorale":10}}, desc: "단일 150%, 자신 HP 15% 소모, 처치 시 아군 사기 +10", skill: "황산벌 결사" },
    '양만춘': { e: {"k":"hit","m":1.2,"rng":4,"crit":{"chance":1,"mul":1.6},"stun":{"chance":0.5,"turns":1}}, desc: "사거리 4 단일 120% 치명 확정(×1.6) + 50% 기절", skill: "안시성의 화살" },
    '이성계': { e: {"k":"hit","m":1.35,"rng":4,"pierce":0.2,"crit":{"chance":0.6,"mul":1.5}}, desc: "사거리 4 단일 135%, 방어 20% 무시, 60% 치명(×1.5)", skill: "신궁 연주" },
    '권율': { e: {"k":"buff","r":9,"buff":{"def":0.2,"counter":0.3,"turns":3},"heal":{"pct":0.1}}, desc: "아군 전체 방어 +20%·반격 +30%(3턴) + HP 10% 회복", skill: "행주대첩" },
    '순욱': { e: {"k":"buff","r":9,"buff":{"atk":0.1,"def":0.06,"turns":2},"morale":8,"heal":{"pct":0.1}}, desc: "아군 전체 지원 + 아군 사기 +8 + HP 10% 회복 + 아군 공격 +10%·방어 +6%(2턴)", skill: "왕좌지책" },
    '곽가': { e: {"k":"magic","r":2,"p":0.94,"burn":{"turns":2,"dot":0.07},"mp":{"gain":10}}, desc: "2칸 광역 계략 94% + 화상 2턴 + MP +10", skill: "귀신지통" },
    '가후': { e: {"k":"magic","r":2,"p":0.94,"burn":{"turns":2,"dot":0.07},"mp":{"gain":10}}, desc: "2칸 광역 계략 94% + 화상 2턴 + MP +10", skill: "독사절계" },
    '초선': { e: {"k":"debuff","r":2,"debuff":{"def":-0.18,"atk":-0.1},"morale":-8,"turns":3}, desc: "적 전체 약화 + 적 사기 -8 + 적 방어 -18% + 적 공격 -10%", skill: "경국지색" },
    '근초고왕': { e: {"k":"buff","r":9,"buff":{"atk":0.1,"def":0.06,"turns":2},"morale":8,"heal":{"pct":0.1}}, desc: "아군 전체 지원 + 아군 사기 +8 + HP 10% 회복 + 아군 공격 +10%·방어 +6%(2턴)", skill: "해상웅비" },
    '김춘추': { e: {"k":"debuff","r":2,"debuff":{"def":-0.18,"atk":-0.1},"morale":-8,"turns":3}, desc: "적 전체 약화 + 적 사기 -8 + 적 방어 -18% + 적 공격 -10%", skill: "외교승부" },
    '동명성왕': { e: {"k":"hit","rng":4,"m":1.3,"pierce":0.25,"crit":{"chance":0.4,"mul":1.5}}, desc: "단일 130% + 사거리 4 + 방어 25% 무시 + 치명 40%(×1.5)", skill: "주몽신궁" },
    '장수왕': { e: {"k":"buff","r":9,"buff":{"atk":0.12000000000000001,"def":0.06,"turns":2},"morale":8,"heal":{"pct":0.1}}, desc: "아군 전체 지원 + 아군 사기 +8 + HP 10% 회복 + 아군 공격 +12%·방어 +6%(2턴)", skill: "남진정책" },
    '을파소': { e: {"k":"heal","r":2,"p":0.18,"clear":true,"atk":0.08,"turns":3}, desc: "아군 치유", skill: "진대법" },
    '진흥왕': { e: {"k":"aoe","r":1,"m":0.7,"morale":-8,"buff":{"atk":0.12,"def":0.08,"turns":2}}, desc: "1칸 광역 70% + 적 사기 -8 + 아군 공격 +12%·방어 +8%(2턴)", skill: "한강장악" },
    '원효': { e: {"k":"buff","r":9,"buff":{"atk":0.14,"def":0.06,"turns":3},"morale":8,"heal":{"pct":0.1}}, desc: "아군 전체 지원 + 아군 사기 +8 + HP 10% 회복 + 아군 공격 +14%·방어 +6%(3턴)", skill: "일심화쟁" },
    '왕건': { e: {"k":"buff","r":9,"buff":{"atk":0.12000000000000001,"def":0.06,"turns":2},"morale":8,"heal":{"pct":0.1}}, desc: "아군 전체 지원 + 아군 사기 +8 + HP 10% 회복 + 아군 공격 +12%·방어 +6%(2턴)", skill: "호족포용" },
    '척준경': { e: {"k":"hit","m":1.37,"execute":{"hpBelow":35,"bonusPct":50},"lifesteal":0.2}, desc: "단일 137% + HP 35% 이하 +50% + 흡혈 20%", skill: "신검일격" },
    '정도전': { e: {"k":"buff","r":9,"buff":{"atk":0.14,"def":0.06,"turns":3},"morale":8,"heal":{"pct":0.1}}, desc: "아군 전체 지원 + 아군 사기 +8 + HP 10% 회복 + 아군 공격 +14%·방어 +6%(3턴)", skill: "삼봉개국" },
    '정몽주': { e: {"k":"heal","r":2,"p":0.18,"clear":true,"atk":0.08,"turns":3}, desc: "아군 치유", skill: "단심일편" },
    '황희': { e: {"k":"buff","r":9,"buff":{"atk":0.1,"def":0.06,"turns":2},"morale":8,"heal":{"pct":0.1}}, desc: "아군 전체 지원 + 아군 사기 +8 + HP 10% 회복 + 아군 공격 +10%·방어 +6%(2턴)", skill: "청백수성" },
    '이황': { e: {"k":"debuff","r":2,"debuff":{"def":-0.19999999999999998,"atk":-0.1},"morale":-10,"turns":3}, desc: "적 전체 약화 + 적 사기 -10 + 적 방어 -20% + 적 공격 -10%", skill: "이기이원" },
    '정약용': { e: {"k":"magic","r":2,"p":0.96,"burn":{"turns":2,"dot":0.07},"mp":{"gain":15}}, desc: "2칸 광역 계략 96% + 화상 2턴 + MP +15", skill: "거중설계" },
    '최영': { e: {"k":"hit","m":1.34,"execute":{"hpBelow":35,"bonusPct":50},"lifesteal":0.2}, desc: "단일 134% + HP 35% 이하 +50% + 흡혈 20%", skill: "홍건격파" },
    '설총': { e: {"k":"debuff","r":2,"debuff":{"def":-0.19999999999999998,"atk":-0.1},"morale":-10,"turns":3}, desc: "적 전체 약화 + 적 사기 -10 + 적 방어 -20% + 적 공격 -10%", skill: "화왕직언" },
    '황진이': { e: {"k":"debuff","r":2,"debuff":{"def":-0.22,"atk":-0.1,"move":-1},"morale":-12,"turns":3}, desc: "적 전체 약화 + 적 사기 -12 + 적 방어 -22% + 적 공격 -10% + 적 이동 -1", skill: "송도가곡" },
    '김좌진': { e: {"k":"line","len":3,"m":1.02,"moveBonus":15,"stun":{"chance":0.2,"turns":1}}, desc: "3칸 직선 102% + 기절 20%", skill: "청산리대첩" },
    '김구': { e: {"k":"heal","r":2,"p":0.16,"clear":true,"atk":0.08,"turns":3}, desc: "아군 치유", skill: "백범결심" },
    '홍범도': { e: {"k":"combo","n":2,"m":1.32,"rng":3,"stun":{"chance":0.25,"turns":1}}, desc: "단일 2연타(합계 132%) + 사거리 3 + 기절 25%", skill: "봉오동매복" },
  };
  var n = 0;
  Object.keys(T).forEach(function (k) {
    var spec = SK.ULTIMATES && SK.ULTIMATES[k];
    if (!spec) return;
    var patched = Object.assign({}, spec, { e: T[k].e, desc: T[k].desc, v582: true, v582Skill: T[k].skill });
    /* A급으로 재산정된 장수(하후돈 등)는 A급 상한을 지킨다 */
    var g = SK.GEN_BY_NAME && SK.GEN_BY_NAME[k];
    if (g && g.tier === 'A' && SK.tuneUltToA) patched = SK.tuneUltToA(patched);
    else if (!patched.tier) patched.tier = 'S';
    SK.ULTIMATES[k] = patched;
    n += 1;
  });
  SK.ULT582_COUNT = n;
})();
