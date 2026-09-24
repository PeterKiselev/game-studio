import { describe, expect, it } from 'vitest';
import {
  ARMORS, CHAPTERS, DEFAULT_FRONTIER_CITY, EMPTY_FRONTIER_TALENTS, ENEMIES, STARTER_INVENTORY, WEAPONS, acceptFrontierContract, applyFrontierCitySupplies, applyFrontierForge, availableMapNodes, buyFrontierPotion, buyFrontierTincture, chooseLoot,
  claimVictory, collectFrontierTrophy, consumeFrontierDepartureSupply, createFrontierCombat, equipFrontierLoot, finishFrontierTurn, frontierDefeatText, frontierEnemyTrophy, frontierIntent, lootOptions,
  frontierChapterUnlocked, frontierPouchSize, improveFrontierForge, learnFrontierTalent, playFrontierAction, progressFrontierContract, claimFrontierContract, retryEncounter, selectMapNode, startExpedition, turnInFrontierTrophy, unlockFrontierLoot,
} from '../src/pograniche';
import type { ExpeditionState, FrontierAction } from '../src/pograniche';

function begin(): ExpeditionState {
  return selectMapNode(startExpedition(), 'old-road');
}

function enterSecondBattle(state: ExpeditionState, path: 'watchtower' | 'hidden-path' = 'watchtower'): ExpeditionState {
  return selectMapNode(selectMapNode(state, path), 'burned-road');
}

function enterGate(state: ExpeditionState, path: 'wormwood-ravine' | 'forester-lodge' = 'forester-lodge'): ExpeditionState {
  return selectMapNode(selectMapNode(state, path), 'gate');
}

function actions(state: ExpeditionState, ...list: FrontierAction[]): ExpeditionState {
  return {
    ...state,
    combat: list.reduce(
      (combat, action) => playFrontierAction(combat, state.gear, action),
      state.combat,
    ),
  };
}

function winCurrent(state: ExpeditionState): ExpeditionState {
  let next = state;
  for (let guard = 0; guard < 30 && !next.combat.outcome; guard++) {
    const turn = next.combat.turn;
    const maxHp = ARMORS[next.gear.armor].maxHp;
    const intent = frontierIntent(next.combat);
    const shouldHeal = next.combat.bleed > 0 || (next.encounterIndex === 2
      ? maxHp - next.combat.playerHp >= 10
      : next.combat.playerHp <= 12);
    if (shouldHeal && next.combat.potions > 0) {
      next = actions(next, 'potion');
      if (!next.combat.outcome && next.combat.turn === turn) next = actions(next, 'attack', 'attack');
    } else if (intent.kind === 'parry') {
      next = actions(next, 'feint');
      while (!next.combat.outcome && next.combat.turn === turn && next.combat.ap > 0) next = actions(next, 'attack');
    } else if ((intent.kind === 'rend' || intent.kind === 'toll') && next.combat.dodgeCooldown === 0) {
      next = actions(next, 'dodge');
      if (!next.combat.outcome && next.combat.turn === turn) next = actions(next, 'attack');
    } else if (intent.kind === 'windup' && next.combat.heavyCooldown === 0) {
      next = actions(next, 'heavy');
      if (!next.combat.outcome && next.combat.turn === turn) next = actions(next, 'attack');
    } else if (intent.kind === 'stance' && next.combat.heavyCooldown === 0) {
      next = actions(next, 'heavy');
      if (!next.combat.outcome && next.combat.turn === turn) next = actions(next, 'attack');
    } else if (next.combat.tinctures > 0 && !next.combat.tinctureUsed && next.combat.ap < 3) {
      next = actions(next, 'tincture');
    } else if (intent.kind === 'stance') {
      next = actions(next, 'feint');
      if (!next.combat.outcome && next.combat.turn === turn && next.combat.ap > 0) next = actions(next, 'guard');
      if (!next.combat.outcome && next.combat.turn === turn && next.combat.ap > 0) next = actions(next, 'attack');
    } else {
      next = actions(next, 'attack');
    }
  }
  return next;
}

describe('Пограничье: экспедиция', () => {
  it('начинается на карте перед первым из трёх врагов и с базовой экипировкой', () => {
    const state = startExpedition();
    expect(state.phase).toBe('map');
    expect(state.nodeId).toBe('trailhead');
    expect(availableMapNodes(state).map((node) => node.id)).toEqual(['old-road']);
    expect(state.encounterIndex).toBe(0);
    expect(state.combat.enemyHp).toBe(ENEMIES[0].maxHp);
    expect(state.combat.playerHp).toBe(ARMORS['patched-coat'].maxHp);
    expect(WEAPONS[state.gear.weapon].name).toBe('Дорожный клинок');
  });

  it('победа открывает ровно два предмета добычи', () => {
    const state = claimVictory(winCurrent(begin()));
    expect(state.phase).toBe('loot');
    expect(lootOptions(state)).toHaveLength(2);
  });

  it('выбранное оружие видно в следующем бою и меняет урон', () => {
    let state = claimVictory(winCurrent(begin()));
    state = chooseLoot(state, 'watch-cleaver');
    state = enterSecondBattle(state);
    const before = state.combat.enemyHp;
    state = actions(state, 'attack');
    expect(state.gear.weapon).toBe('watch-cleaver');
    expect(before - state.combat.enemyHp).toBe(5);
  });

  it('выбранная броня увеличивает здоровье и силу защиты', () => {
    let state = claimVictory(winCurrent(begin()));
    state = chooseLoot(state, 'chain-jacket');
    state = enterSecondBattle(state);
    expect(state.combat.playerHp).toBe(32);
    state = actions(state, 'guard');
    state = { ...state, combat: finishFrontierTurn(state.combat, state.gear) };
    expect(state.combat.playerHp).toBe(32);
  });

  it('после двух выборов добычи можно победить босса и закончить поход', () => {
    let state = claimVictory(winCurrent(begin()));
    expect(state.phase).toBe('loot');
    state = chooseLoot(state, 'watch-cleaver');
    expect(state.phase).toBe('map');
    state = enterSecondBattle(state);
    expect(state.encounterIndex).toBe(1);
    expect(state.combat.outcome).toBeNull();
    state = claimVictory(winCurrent(state));
    expect(state.phase).toBe('loot');
    state = chooseLoot(state, 'warden-shell');
    state = enterGate(state);
    expect(state.encounterIndex).toBe(2);
    expect(state.combat.outcome).toBeNull();
    state = claimVictory(winCurrent(state));
    expect(state.encounterIndex).toBe(2);
    expect(state.phase).toBe('complete');
  });

  it.each([
    ['watch-cleaver', 'warden-spear'],
    ['watch-cleaver', 'warden-shell'],
    ['chain-jacket', 'warden-spear'],
    ['chain-jacket', 'warden-shell'],
  ] as const)('сочетание добычи %s + %s не делает поход непроходимым', (firstLoot, secondLoot) => {
    let state = claimVictory(winCurrent(begin()));
    state = chooseLoot(state, firstLoot);
    state = enterSecondBattle(state, 'hidden-path');
    state = claimVictory(winCurrent(state));
    state = chooseLoot(state, secondLoot);
    state = enterGate(state);
    state = claimVictory(winCurrent(state));
    expect(state.phase).toBe('complete');
  });

  it('проигранный бой перезапускается с сохранённой экипировкой', () => {
    let state = begin();
    state = { ...state, combat: { ...state.combat, playerHp: 1 } };
    state = { ...state, combat: finishFrontierTurn(state.combat, state.gear) };
    const retried = retryEncounter(state);
    expect(retried.gear).toEqual(state.gear);
    expect(retried.combat.playerHp).toBe(ARMORS[state.gear.armor].maxHp);
    expect(retried.combat.outcome).toBeNull();
  });

  it('показанный урон не меняется во время действий игрока', () => {
    let state = begin();
    state = actions(state, 'attack');
    expect(frontierIntent(state.combat).damage).toBe(6);
  });

  it('защищаться можно один раз за ход', () => {
    const state = begin();
    const once = actions(state, 'guard');
    expect(playFrontierAction(once.combat, once.gear, 'guard')).toBe(once.combat);
  });

  it('финт безопасен против стойки и снижает ярость только один раз за ход', () => {
    const state = begin();
    const stance = { ...state.combat, turn: 5, rage: 2, enemyHp: 30 };
    const after = playFrontierAction(stance, state.gear, 'feint');
    expect(after.enemyHp).toBe(28);
    expect(after.playerHp).toBe(stance.playerHp);
    expect(after.rage).toBe(1);
    expect(playFrontierAction(after, state.gear, 'feint')).toBe(after);
  });

  it('уклонение полностью отменяет Сокрушение, но недоступно следующий ход', () => {
    const state = begin();
    let combat = { ...state.combat, turn: 3, charged: true, playerHp: 30 };
    combat = playFrontierAction(combat, state.gear, 'dodge');
    combat = finishFrontierTurn(combat, state.gear);
    expect(combat.playerHp).toBe(30);
    expect(combat.stunned).toBe(false);
    expect(combat.dodgeCooldown).toBe(1);
    expect(playFrontierAction(combat, state.gear, 'dodge')).toBe(combat);
  });

  it('тяжёлый удар срывает замах и ломает стойку без отражения', () => {
    let state = begin();
    state = actions(state, 'attack', 'attack', 'attack');
    state = actions(state, 'heavy', 'attack');
    expect(frontierIntent(state.combat).name).toBe('Сорванный удар');

    const stance = { ...state, combat: { ...state.combat, turn: 5, enemyHp: 30, ap: 3, heavyCooldown: 0 } };
    const after = actions(stance, 'heavy', 'attack');
    expect(after.combat.playerHp).toBe(stance.combat.playerHp);
  });

  it('незащищённое Сокрушение оставляет видимый флаг оглушения на новом ходу', () => {
    const state = begin();
    const crush = { ...state.combat, turn: 3, charged: true, playerHp: 30 };
    const after = finishFrontierTurn(crush, state.gear);
    expect(after.ap).toBe(2);
    expect(after.stunned).toBe(true);
    const recovered = playFrontierAction(
      playFrontierAction(after, state.gear, 'attack'), state.gear, 'attack',
    );
    expect(recovered.turn).toBe(after.turn + 1);
    expect(recovered.ap).toBe(3);
    expect(recovered.stunned).toBe(false);
  });

  it('развилка карты даёт два разных и работающих преимущества', () => {
    let cleared = claimVictory(winCurrent(begin()));
    cleared = chooseLoot(cleared, 'watch-cleaver');
    expect(availableMapNodes(cleared).map((node) => node.id)).toEqual(['watchtower', 'hidden-path']);

    const supplied = enterSecondBattle(cleared, 'watchtower');
    expect(supplied.combat.potions).toBe(3);
    expect(supplied.combat.enemyHp).toBe(ENEMIES[1].maxHp);

    const ambush = enterSecondBattle(cleared, 'hidden-path');
    expect(ambush.combat.potions).toBe(2);
    expect(ambush.combat.enemyHp).toBe(ENEMIES[1].maxHp - 10);
  });

  it('переносит остаток здоровья и зелий в следующий бой', () => {
    let state = begin();
    state = { ...state, combat: { ...state.combat, playerHp: 19, potions: 1, outcome: 'won' } };
    state = claimVictory(state);
    expect(state.combat.playerHp).toBe(27);
    state = chooseLoot(state, 'watch-cleaver');
    state = enterSecondBattle(state, 'hidden-path');
    expect(state.combat.playerHp).toBe(27);
    expect(state.combat.potions).toBe(1);
    expect(state.checkpointHp).toBe(27);
    expect(state.checkpointPotions).toBe(1);
  });

  it('повтор боя возвращает ресурсы и засаду к состоянию на входе', () => {
    let state = claimVictory(winCurrent(begin()));
    state = chooseLoot(state, 'watch-cleaver');
    state = enterSecondBattle(state, 'hidden-path');
    const startHp = state.combat.playerHp;
    expect(state.combat.enemyHp).toBe(ENEMIES[1].maxHp - 10);
    state = {
      ...state,
      combat: { ...state.combat, playerHp: 0, potions: 0, enemyHp: 3, outcome: 'lost' },
    };
    const retried = retryEncounter(state);
    expect(retried.combat.playerHp).toBe(startHp);
    expect(retried.combat.potions).toBe(state.checkpointPotions);
    expect(retried.combat.enemyHp).toBe(ENEMIES[1].maxHp - 10);
    expect(retried.combat.outcome).toBeNull();
  });

  it('новая броня сохраняет число ран, а не бесплатно лечит до максимума', () => {
    let state = begin();
    state = { ...state, combat: { ...state.combat, playerHp: 17, outcome: 'won' } };
    state = claimVictory(state);
    expect(state.combat.playerHp).toBe(25);
    state = chooseLoot(state, 'chain-jacket');
    expect(state.combat.playerHp).toBe(31);
    expect(ARMORS['chain-jacket'].maxHp - state.combat.playerHp).toBe(5);
  });

  it('передышка лечит не больше восьми и не превышает максимум здоровья', () => {
    let state = begin();
    state = { ...state, combat: { ...state.combat, playerHp: 27, outcome: 'won' } };
    state = claimVictory(state);
    expect(state.combat.playerHp).toBe(30);
  });

  it('постоянный инвентарь не дублирует добычу и не позволяет надеть чужой предмет', () => {
    const starter = { weapons: [...STARTER_INVENTORY.weapons], armors: [...STARTER_INVENTORY.armors] };
    const unlocked = unlockFrontierLoot(starter, 'watch-cleaver');
    expect(unlockFrontierLoot(unlocked, 'watch-cleaver')).toBe(unlocked);
    expect(equipFrontierLoot({ weapon: 'road-blade', armor: 'patched-coat' }, starter, 'watch-cleaver').weapon).toBe('road-blade');
    expect(equipFrontierLoot({ weapon: 'road-blade', armor: 'patched-coat' }, unlocked, 'watch-cleaver').weapon).toBe('watch-cleaver');
  });

  it('у крыс блок останавливает только первый укус, а уклонение — всю стаю', () => {
    const gear = { weapon: 'road-blade', armor: 'patched-coat' } as const;
    let guarded = playFrontierAction(createFrontierCombat(3, gear), gear, 'guard');
    guarded = finishFrontierTurn(guarded, gear);
    expect(guarded.playerHp).toBe(27);

    let dodged = playFrontierAction(createFrontierCombat(3, gear), gear, 'dodge');
    dodged = finishFrontierTurn(dodged, gear);
    expect(dodged.playerHp).toBe(30);
  });

  it('волк усиливает ровно следующую атаку после зелья', () => {
    const gear = { weapon: 'road-blade', armor: 'patched-coat' } as const;
    let combat = { ...createFrontierCombat(4, gear), playerHp: 20 };
    combat = playFrontierAction(combat, gear, 'potion');
    expect(combat.scentBonus).toBe(5);
    combat = finishFrontierTurn(combat, gear);
    expect(combat.playerHp).toBe(18);
    expect(combat.scentBonus).toBe(0);
  });

  it('рога оленя пробивают блок и всё равно оглушают', () => {
    const gear = { weapon: 'road-blade', armor: 'patched-coat' } as const;
    let combat = { ...createFrontierCombat(5, gear), turn: 3, charged: true };
    combat = playFrontierAction(combat, gear, 'guard');
    combat = finishFrontierTurn(combat, gear);
    expect(combat.playerHp).toBe(15);
    expect(combat.stunned).toBe(true);
  });

  it('медведь отвечает на тяжёлый удар вне замаха, но не при срыве замаха', () => {
    const gear = { weapon: 'road-blade', armor: 'patched-coat' } as const;
    const careless = playFrontierAction(createFrontierCombat(6, gear), gear, 'heavy');
    expect(careless.playerHp).toBe(25);
    const windup = { ...createFrontierCombat(6, gear), turn: 3 };
    const timely = playFrontierAction(windup, gear, 'heavy');
    expect(timely.playerHp).toBe(30);
  });

  it('победа над необязательным зверем возвращает на карту без обязательной добычи', () => {
    let state = claimVictory(winCurrent(begin()));
    state = chooseLoot(state, 'watch-cleaver');
    state = selectMapNode(selectMapNode(state, 'watchtower'), 'rat-den');
    state = claimVictory(winCurrent(state));
    expect(state.phase).toBe('map');
    expect(availableMapNodes(state).map((node) => node.id)).toEqual(['burned-road']);
  });

  it('таланты усиливают новый поход и корректно тратят звериные метки', () => {
    let learned = learnFrontierTalent(EMPTY_FRONTIER_TALENTS, 3, 'strength');
    expect(learned.marks).toBe(2);
    learned = learnFrontierTalent(learned.talents, learned.marks, 'strength');
    expect(learned.marks).toBe(0);
    const talents = { ...learned.talents, vitality: 2, supplies: 1 };
    let state = selectMapNode(startExpedition(undefined, talents), 'old-road', talents);
    expect(state.combat.playerHp).toBe(38);
    expect(state.combat.potions).toBe(3);
    const before = state.combat.enemyHp;
    state = { ...state, combat: playFrontierAction(state.combat, state.gear, 'attack', talents) };
    expect(before - state.combat.enemyHp).toBe(6);
  });

  it('нельзя купить талант выше предела или без меток', () => {
    const capped = { strength: 2, vitality: 0, supplies: 0 };
    expect(learnFrontierTalent(capped, 10, 'strength').talents).toBe(capped);
    expect(learnFrontierTalent(EMPTY_FRONTIER_TALENTS, 0, 'vitality').talents).toBe(EMPTY_FRONTIER_TALENTS);
  });

  it('настойка бесплатно возвращает одно ОД, но используется только раз за ход', () => {
    const gear = { weapon: 'road-blade', armor: 'patched-coat' } as const;
    const combat = createFrontierCombat(0, gear, EMPTY_FRONTIER_TALENTS, 1);
    const used = playFrontierAction(combat, gear, 'tincture');
    expect(used.ap).toBe(4);
    expect(used.tinctures).toBe(0);
    expect(used.tinctureUsed).toBe(true);
    expect(playFrontierAction(used, gear, 'tincture')).toBe(used);
  });

  it('настойка снимает штраф по ОД после оглушения и не тревожит волка', () => {
    const gear = { weapon: 'road-blade', armor: 'patched-coat' } as const;
    const stunned = { ...createFrontierCombat(4, gear, EMPTY_FRONTIER_TALENTS, 1), ap: 2, stunned: true };
    const used = playFrontierAction(stunned, gear, 'tincture');
    expect(used.ap).toBe(3);
    expect(used.scentBonus).toBe(0);
  });

  it('после второго боя выбираются овраг с настойкой или сторожка с лечением', () => {
    let state = claimVictory(winCurrent(begin()));
    state = chooseLoot(state, 'watch-cleaver');
    state = claimVictory(winCurrent(enterSecondBattle(state, 'hidden-path')));
    state = chooseLoot(state, 'warden-spear');
    expect(availableMapNodes(state).map((node) => node.id)).toEqual(['wormwood-ravine', 'forester-lodge']);

    const ravine = selectMapNode(state, 'wormwood-ravine');
    expect(ravine.combat.tinctures).toBe(state.combat.tinctures + 1);
    expect(availableMapNodes(ravine).map((node) => node.id)).toEqual(['gate']);

    const wounded = { ...state, combat: { ...state.combat, playerHp: 20 } };
    const lodge = selectMapNode(wounded, 'forester-lodge');
    expect(lodge.combat.playerHp).toBe(28);
    expect(availableMapNodes(lodge).map((node) => node.id)).toEqual(['gate']);
  });

  it('печать привратника открывает кисет на первой и третьей победах', () => {
    expect([0, 1, 2, 3, 10].map(frontierPouchSize)).toEqual([0, 1, 1, 2, 2]);
    const state = startExpedition(undefined, EMPTY_FRONTIER_TALENTS, frontierPouchSize(3));
    expect(state.combat.tinctures).toBe(2);
    expect(state.checkpointTinctures).toBe(2);
  });

  it('повтор боя восстанавливает настойки чекпоинта', () => {
    let state = selectMapNode(startExpedition(undefined, EMPTY_FRONTIER_TALENTS, 1), 'old-road');
    state = { ...state, combat: { ...state.combat, tinctures: 0, playerHp: 0, outcome: 'lost' } };
    expect(retryEncounter(state).combat.tinctures).toBe(1);
  });

  it('глава «За воротами» начинается на отдельной карте с тремя обязательными боями', () => {
    const state = startExpedition(undefined, EMPTY_FRONTIER_TALENTS, 1, 'chapter-1');
    expect(state.chapter).toBe('chapter-1');
    expect(state.nodeId).toBe('gate-yard');
    expect(state.encounterIndex).toBe(7);
    expect(availableMapNodes(state).map((node) => node.id)).toEqual(['outpost']);
    expect(CHAPTERS['chapter-1'].stages).toEqual(['outpost', 'butcher-row', 'toll-yard']);
  });

  it('глава II открывается только после победы в главе I', () => {
    const progress = {
      prologue: { victories: 1, bestStage: 3 },
      'chapter-1': { victories: 0, bestStage: 0 },
      'chapter-2': { victories: 0, bestStage: 0 },
    };
    expect(frontierChapterUnlocked(CHAPTERS['chapter-1'], progress)).toBe(true);
    expect(frontierChapterUnlocked(CHAPTERS['chapter-2'], progress)).toBe(false);
    expect(frontierChapterUnlocked(CHAPTERS['chapter-2'], { ...progress, 'chapter-1': { victories: 1, bestStage: 3 } })).toBe(true);
  });

  it.each([
    ['bandit-sabre', 'outpost-mace', 'tanner-yard', 'physic-garden'],
    ['bandit-sabre', 'aventail-mail', 'boar-pens', 'physic-garden'],
    ['watch-cuirass', 'outpost-mace', 'tanner-yard', 'raven-belfry'],
    ['watch-cuirass', 'aventail-mail', 'boar-pens', 'raven-belfry'],
  ] as const)('глава II проходится с выбором %s + %s через маршрут %s / %s', (firstLoot, secondLoot, firstRoute, secondRoute) => {
    const completedChapterOneGear = { weapon: 'outpost-mace', armor: 'aventail-mail' } as const;
    let state = selectMapNode(startExpedition(completedChapterOneGear, EMPTY_FRONTIER_TALENTS, 2, 'chapter-2'), 'lantern-alley');
    state = chooseLoot(claimVictory(winCurrent(state)), firstLoot);
    state = selectMapNode(state, firstRoute);
    if (state.phase === 'battle') state = claimVictory(winCurrent(state));
    state = selectMapNode(state, 'execution-yard');
    state = chooseLoot(claimVictory(winCurrent(state)), secondLoot);
    state = selectMapNode(state, secondRoute);
    if (state.phase === 'battle') {
      state = claimVictory(winCurrent(state));
      state = selectMapNode(state, 'bell-stairs');
    }
    state = selectMapNode(state, 'plague-house');
    state = claimVictory(winCurrent(state));
    expect(state.phase, `${state.combat.outcome}: ${state.combat.playerHp}/${state.combat.enemyHp}; ${state.combat.log.join(' | ')}`).toBe('complete');
    expect(state.nodeId).toBe('black-bell');
  });

  it('карта главы даёт честный выбор между обменом и припасами со зверем', () => {
    let state = selectMapNode(startExpedition(undefined, EMPTY_FRONTIER_TALENTS, 0, 'chapter-1'), 'outpost');
    state = { ...state, combat: { ...state.combat, outcome: 'won' } };
    state = chooseLoot(claimVictory(state), 'bandit-sabre');
    expect(availableMapNodes(state).map((node) => node.id)).toEqual(['market-rows', 'backyards']);

    const traded = selectMapNode(state, 'market-rows');
    expect(traded.combat.potions).toBe(state.combat.potions - 1);
    expect(traded.combat.tinctures).toBe(state.combat.tinctures + 1);

    const supplied = selectMapNode(state, 'backyards');
    expect(availableMapNodes(supplied).map((node) => node.id)).toEqual(['butcher-row', 'rotten-pond']);
    const viper = selectMapNode(supplied, 'rotten-pond');
    expect(viper.encounterIndex).toBe(10);
    expect(viper.combat.potions).toBe(state.combat.potions + 1);
  });

  it('отвод отбивает прямую атаку, а финт безопасно раскрывает защиту', () => {
    const gear = { weapon: 'road-blade', armor: 'patched-coat' } as const;
    const combat = createFrontierCombat(7, gear);
    const punished = playFrontierAction(combat, gear, 'attack');
    expect(punished.enemyHp).toBe(combat.enemyHp);
    expect(punished.playerHp).toBe(combat.playerHp - 9);
    expect(punished.parryOpen).toBe(true);

    const opened = playFrontierAction(combat, gear, 'feint');
    expect(opened.enemyHp).toBe(combat.enemyHp - 2);
    expect(opened.playerHp).toBe(combat.playerHp);
    expect(opened.parryOpen).toBe(true);
  });

  it('рваный удар вызывает три хода кровотечения, которое снимается зельем', () => {
    const gear = { weapon: 'road-blade', armor: 'patched-coat' } as const;
    let combat = finishFrontierTurn(createFrontierCombat(8, gear), gear);
    expect(combat.bleed).toBe(3);
    combat = finishFrontierTurn(combat, gear);
    expect(combat.bleed).toBe(2);
    expect(combat.log[0]).toContain('Кровотечение');
    combat = playFrontierAction(combat, gear, 'potion');
    expect(combat.bleed).toBe(0);
  });

  it('Мытарь забирает зелье и лечится, а без зелий наносит урон', () => {
    const gear = { weapon: 'road-blade', armor: 'patched-coat' } as const;
    const wounded = { ...createFrontierCombat(9, gear), enemyHp: 50 };
    const paid = finishFrontierTurn(wounded, gear);
    expect(paid.potions).toBe(1);
    expect(paid.enemyHp).toBe(60);
    expect(paid.playerHp).toBe(wounded.playerHp);

    const empty = finishFrontierTurn({ ...wounded, potions: 0 }, gear);
    expect(empty.playerHp).toBeLessThan(wounded.playerHp);
  });

  it('новая экипировка меняет правила, а не только числа', () => {
    const sabre = { weapon: 'bandit-sabre', armor: 'patched-coat' } as const;
    const feint = playFrontierAction(createFrontierCombat(7, sabre), sabre, 'feint');
    expect(ENEMIES[7].maxHp - feint.enemyHp).toBe(5);

    const cuirass = { weapon: 'road-blade', armor: 'watch-cuirass' } as const;
    let swarm = playFrontierAction(createFrontierCombat(11, cuirass), cuirass, 'guard');
    swarm = finishFrontierTurn(swarm, cuirass);
    expect(swarm.playerHp).toBe(38);

    const mail = { weapon: 'road-blade', armor: 'aventail-mail' } as const;
    const crushed = finishFrontierTurn({ ...createFrontierCombat(9, mail), turn: 5, charged: true }, mail);
    expect(crushed.stunned).toBe(false);
  });

  it.each([
    ['bandit-sabre', 'outpost-mace', 'market-rows', 'chapel'],
    ['bandit-sabre', 'aventail-mail', 'backyards', 'chapel'],
    ['watch-cuirass', 'outpost-mace', 'market-rows', 'chapel'],
    ['watch-cuirass', 'aventail-mail', 'backyards', 'chapel'],
  ] as const)('глава проходится после пролога с добычей %s + %s', (firstLoot, secondLoot, firstRoute, secondRoute) => {
    const weakestCompletedPrologue = { weapon: 'road-blade', armor: 'warden-shell' } as const;
    let state = selectMapNode(startExpedition(weakestCompletedPrologue, EMPTY_FRONTIER_TALENTS, 1, 'chapter-1'), 'outpost');
    state = chooseLoot(claimVictory(winCurrent(state)), firstLoot);
    state = selectMapNode(selectMapNode(state, firstRoute), 'butcher-row');
    state = chooseLoot(claimVictory(winCurrent(state)), secondLoot);
    state = selectMapNode(selectMapNode(state, secondRoute), 'toll-yard');
    state = claimVictory(winCurrent(state));
    expect(state.phase, `${state.combat.outcome}: ${state.combat.playerHp}/${state.combat.enemyHp}; ${state.combat.log.join(' | ')}`).toBe('complete');
    expect(state.nodeId).toBe('town-square');
  });

  it('городские улучшения честно тратят метки и не покупаются повторно', () => {
    const forged = improveFrontierForge(DEFAULT_FRONTIER_CITY, 3);
    expect(forged.marks).toBe(0);
    expect(forged.city.forgeLevel).toBe(1);
    expect(improveFrontierForge(forged.city, 10).city).toBe(forged.city);

    const supplied = buyFrontierPotion(DEFAULT_FRONTIER_CITY, 1);
    expect(supplied.marks).toBe(0);
    expect(supplied.city.extraPotion).toBe(true);
    expect(buyFrontierPotion(supplied.city, 5).city).toBe(supplied.city);

    const tincture = buyFrontierTincture(DEFAULT_FRONTIER_CITY, 1);
    expect(tincture.marks).toBe(0);
    expect(tincture.city.extraTincture).toBe(true);
    expect(buyFrontierTincture(tincture.city, 5).city).toBe(tincture.city);
  });

  it('походный запас расходуется при любом реальном уходе со старта', () => {
    const supplied = buyFrontierPotion(DEFAULT_FRONTIER_CITY, 1).city;
    const start = startExpedition();
    const battle = selectMapNode(start, 'old-road');

    expect(consumeFrontierDepartureSupply(supplied, start, start)).toBe(supplied);
    expect(consumeFrontierDepartureSupply(supplied, start, battle).extraPotion).toBe(false);

    const futureEventFirst: ExpeditionState = { ...start, nodeId: 'watchtower', visited: ['trailhead', 'watchtower'] };
    expect(consumeFrontierDepartureSupply(supplied, start, futureEventFirst).extraPotion).toBe(false);
    expect(consumeFrontierDepartureSupply(supplied, battle, battle)).toBe(supplied);
  });

  it('городская настойка попадает в кисет и списывается вместе с зельем', () => {
    const city = buyFrontierTincture(buyFrontierPotion(DEFAULT_FRONTIER_CITY, 1).city, 1).city;
    const packed = applyFrontierCitySupplies(startExpedition(), city);
    expect(packed.combat.potions).toBe(3);
    expect(packed.combat.tinctures).toBe(1);
    expect(packed.checkpointPotions).toBe(3);
    expect(packed.checkpointTinctures).toBe(1);

    const after = consumeFrontierDepartureSupply(city, packed, selectMapNode(packed, 'old-road'));
    expect(after.extraPotion).toBe(false);
    expect(after.extraTincture).toBe(false);
  });

  it('посылка из погребов сдаётся один раз и закрывает поручение скупщика', () => {
    const hound = ENEMIES.find((enemy) => enemy.id === 'toll-hound')!;
    expect(frontierEnemyTrophy(hound)).toBe('contraband');
    expect(frontierEnemyTrophy(ENEMIES[3])).toBeNull();

    const accepted = acceptFrontierContract(DEFAULT_FRONTIER_CITY, 'smuggler');
    expect(progressFrontierContract(accepted, 'optional-win')).toBe(accepted);
    const ready = progressFrontierContract(collectFrontierTrophy(accepted, 'contraband'), 'smuggler-win');
    expect(ready.pendingTrophy).toBe('contraband');
    expect(ready.contract?.ready).toBe(true);
    expect(collectFrontierTrophy(ready, 'contraband')).toBe(ready);

    const sold = turnInFrontierTrophy(ready, 1);
    expect(sold.marks).toBe(3);
    expect(sold.city.pendingTrophy).toBeNull();
    expect(turnInFrontierTrophy(sold.city, sold.marks)).toEqual(sold);
  });

  it('текст победы согласуется с названием противника', () => {
    expect(frontierDefeatText(ENEMIES[0])).toBe('Ржавый страж повержен');
    expect(frontierDefeatText(ENEMIES[3])).toBe('Чумная стая повержена');
    expect(frontierDefeatText(ENEMIES[10])).toBe('Болотная гадюка повержена');
  });

  it('закалка действительно усиливает обе атаки в бою', () => {
    const gear = { weapon: 'road-blade', armor: 'patched-coat' } as const;
    const city = improveFrontierForge(DEFAULT_FRONTIER_CITY, 3).city;
    const talents = applyFrontierForge(EMPTY_FRONTIER_TALENTS, city);
    const combat = createFrontierCombat(0, gear, talents);
    const quick = playFrontierAction(combat, gear, 'attack', talents);
    const heavy = playFrontierAction(combat, gear, 'heavy', talents);
    expect(combat.enemyHp - quick.enemyHp).toBe(WEAPONS['road-blade'].attack + 1);
    expect(combat.enemyHp - heavy.enemyHp).toBe(WEAPONS['road-blade'].heavy + 2);
  });

  it('контракт нельзя заменить до завершения и нельзя получить дважды', () => {
    const accepted = acceptFrontierContract(DEFAULT_FRONTIER_CITY, 'beast-hunt');
    expect(acceptFrontierContract(accepted, 'quartermaster')).toBe(accepted);
    expect(progressFrontierContract(accepted, 'chapter-win-with-potion')).toBe(accepted);
    const ready = progressFrontierContract(accepted, 'optional-win');
    expect(ready.contract?.ready).toBe(true);
    const claimed = claimFrontierContract(ready, 4);
    expect(claimed.marks).toBe(6);
    expect(claimed.city.contract).toBeNull();
    expect(claimFrontierContract(claimed.city, claimed.marks)).toEqual(claimed);
  });
});
