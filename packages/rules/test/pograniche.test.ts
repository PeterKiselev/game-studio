import { describe, expect, it } from 'vitest';
import {
  ARMORS, EMPTY_FRONTIER_TALENTS, ENEMIES, STARTER_INVENTORY, WEAPONS, availableMapNodes, chooseLoot,
  claimVictory, createFrontierCombat, equipFrontierLoot, finishFrontierTurn, frontierIntent, lootOptions,
  frontierPouchSize, learnFrontierTalent, playFrontierAction, retryEncounter, selectMapNode, startExpedition, unlockFrontierLoot,
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
    const shouldHeal = next.encounterIndex === 2
      ? maxHp - next.combat.playerHp >= 10
      : next.combat.playerHp <= 12;
    if (shouldHeal && next.combat.potions > 0) {
      next = actions(next, 'potion');
      if (!next.combat.outcome && next.combat.turn === turn) next = actions(next, 'attack', 'attack');
    } else if (frontierIntent(next.combat).kind === 'windup' && next.combat.heavyCooldown === 0) {
      next = actions(next, 'heavy');
      if (!next.combat.outcome && next.combat.turn === turn) next = actions(next, 'attack');
    } else if (frontierIntent(next.combat).kind === 'stance' && next.combat.heavyCooldown === 0) {
      next = actions(next, 'heavy');
      if (!next.combat.outcome && next.combat.turn === turn) next = actions(next, 'attack');
    } else {
      while (!next.combat.outcome && next.combat.turn === turn && next.combat.ap > 0) next = actions(next, 'attack');
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
});
