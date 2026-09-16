export type FrontierAction = 'attack' | 'feint' | 'guard' | 'dodge' | 'heavy' | 'potion';
export type CombatOutcome = 'won' | 'lost' | null;
export type WeaponId = 'road-blade' | 'watch-cleaver' | 'warden-spear';
export type ArmorId = 'patched-coat' | 'chain-jacket' | 'warden-shell';
export type LootId = WeaponId | ArmorId;
export type ExpeditionPhase = 'map' | 'battle' | 'loot' | 'complete';
export type MapNodeId = 'trailhead' | 'old-road' | 'watchtower' | 'hidden-path' | 'rat-den' | 'bear-cave' | 'wolf-woods' | 'hollow-grove' | 'burned-road' | 'gate' | 'city';
export type MapNodeKind = 'start' | 'battle' | 'event' | 'finish';
export type NextBattleEffect = 'supplies' | 'ambush' | null;
export type FrontierTalentId = 'strength' | 'vitality' | 'supplies';

export interface FrontierTalents {
  strength: number;
  vitality: number;
  supplies: number;
}

export const EMPTY_FRONTIER_TALENTS: FrontierTalents = { strength: 0, vitality: 0, supplies: 0 };
export const FRONTIER_TALENT_CAPS: Readonly<Record<FrontierTalentId, number>> = { strength: 2, vitality: 3, supplies: 1 };

export function frontierTalentCost(talents: FrontierTalents, id: FrontierTalentId): number {
  return talents[id] + 1;
}

export function learnFrontierTalent(talents: FrontierTalents, marks: number, id: FrontierTalentId): { talents: FrontierTalents; marks: number } {
  const cost = frontierTalentCost(talents, id);
  if (talents[id] >= FRONTIER_TALENT_CAPS[id] || marks < cost) return { talents, marks };
  return { talents: { ...talents, [id]: talents[id] + 1 }, marks: marks - cost };
}

export interface Weapon {
  id: WeaponId;
  name: string;
  icon: string;
  attack: number;
  heavy: number;
  description: string;
}

export interface Armor {
  id: ArmorId;
  name: string;
  icon: string;
  maxHp: number;
  block: number;
  description: string;
}

export interface Enemy {
  id: string;
  name: string;
  epithet: string;
  icon: string;
  maxHp: number;
  strike: number;
  crush: number;
  reflect: number;
  pattern: readonly IntentKind[];
  optional?: boolean;
  swarmHits?: number;
  potionRetaliation?: number;
  crushIgnoresGuard?: boolean;
  retaliateOnHeavy?: number;
}

export type IntentKind = 'strike' | 'windup' | 'crush' | 'stance' | 'swarm';

export interface EnemyIntent {
  kind: IntentKind;
  name: string;
  damage: number;
  text: string;
}

export interface CombatState {
  enemyIndex: number;
  turn: number;
  playerHp: number;
  enemyHp: number;
  ap: number;
  potions: number;
  guard: boolean;
  guardUsed: boolean;
  evade: boolean;
  feintUsed: boolean;
  dodgeCooldown: number;
  heavyCooldown: number;
  scentBonus: number;
  rage: number;
  blood: boolean;
  damageThisTurn: number;
  heavyThisTurn: boolean;
  charged: boolean;
  stunned: boolean;
  outcome: CombatOutcome;
  log: string[];
}

export interface FrontierGear {
  weapon: WeaponId;
  armor: ArmorId;
}

export interface FrontierInventory {
  weapons: WeaponId[];
  armors: ArmorId[];
}

export interface ExpeditionState {
  phase: ExpeditionPhase;
  nodeId: MapNodeId;
  visited: MapNodeId[];
  encounterIndex: number;
  gear: FrontierGear;
  combat: CombatState;
  checkpointHp: number;
  checkpointPotions: number;
  checkpointEnemyHp: number;
  nextBattleEffect: NextBattleEffect;
}

export interface FrontierMapNode {
  id: MapNodeId;
  kind: MapNodeKind;
  name: string;
  description: string;
  enemyIndex?: number;
  next: readonly MapNodeId[];
}

export interface LootOption {
  id: LootId;
  slot: 'weapon' | 'armor';
  name: string;
  icon: string;
  description: string;
}

export const WEAPONS: Record<WeaponId, Weapon> = {
  'road-blade': {
    id: 'road-blade', name: 'Дорожный клинок', icon: '†', attack: 4, heavy: 10,
    description: 'Надёжный, но давно не точенный меч.',
  },
  'watch-cleaver': {
    id: 'watch-cleaver', name: 'Тесак дозора', icon: '⚔', attack: 5, heavy: 12,
    description: 'Быстрые атаки +1, тяжёлые +2.',
  },
  'warden-spear': {
    id: 'warden-spear', name: 'Копьё привратника', icon: '⚚', attack: 6, heavy: 13,
    description: 'Быстрые атаки +2, тяжёлые +3.',
  },
};

export const ARMORS: Record<ArmorId, Armor> = {
  'patched-coat': {
    id: 'patched-coat', name: 'Латаный кафтан', icon: '◇', maxHp: 30, block: 6,
    description: 'Старая защита странника.',
  },
  'chain-jacket': {
    id: 'chain-jacket', name: 'Кольчужная куртка', icon: '▦', maxHp: 36, block: 8,
    description: '+6 здоровья, защита поглощает 8 урона.',
  },
  'warden-shell': {
    id: 'warden-shell', name: 'Панцирь стража', icon: '⬡', maxHp: 40, block: 9,
    description: '+10 здоровья, защита поглощает 9 урона.',
  },
};

export const STARTER_INVENTORY: FrontierInventory = {
  weapons: ['road-blade'],
  armors: ['patched-coat'],
};

export function unlockFrontierLoot(inventory: FrontierInventory, id: LootId): FrontierInventory {
  if (id in WEAPONS) {
    const weapon = id as WeaponId;
    return inventory.weapons.includes(weapon) ? inventory : { ...inventory, weapons: [...inventory.weapons, weapon] };
  }
  const armor = id as ArmorId;
  return inventory.armors.includes(armor) ? inventory : { ...inventory, armors: [...inventory.armors, armor] };
}

export function equipFrontierLoot(gear: FrontierGear, inventory: FrontierInventory, id: LootId): FrontierGear {
  if (id in WEAPONS) return inventory.weapons.includes(id as WeaponId) ? { ...gear, weapon: id as WeaponId } : gear;
  return inventory.armors.includes(id as ArmorId) ? { ...gear, armor: id as ArmorId } : gear;
}

export const ENEMIES: readonly Enemy[] = [
  {
    id: 'rust-sentry', name: 'Ржавый страж', epithet: 'Старая дорога', icon: '♜',
    maxHp: 48, strike: 6, crush: 15, reflect: 3,
    pattern: ['strike', 'windup', 'crush', 'strike', 'stance'],
  },
  {
    id: 'ash-hound', name: 'Пепельный гончий', epithet: 'Сгоревший тракт', icon: '♞',
    maxHp: 60, strike: 7, crush: 16, reflect: 4,
    pattern: ['strike', 'stance', 'strike', 'windup', 'crush'],
  },
  {
    id: 'gate-warden', name: 'Привратник', epithet: 'Ворота Пограничья', icon: '♛',
    maxHp: 78, strike: 8, crush: 18, reflect: 5,
    pattern: ['stance', 'strike', 'windup', 'crush', 'strike'],
  },
  {
    id: 'plague-rats', name: 'Чумная стая', epithet: 'Крысиное логово', icon: '♟', optional: true,
    maxHp: 38, strike: 3, crush: 0, reflect: 2, swarmHits: 2,
    pattern: ['swarm', 'strike', 'swarm', 'stance'],
  },
  {
    id: 'dread-wolf', name: 'Чернолесый волк', epithet: 'Волчья низина', icon: '♞', optional: true,
    maxHp: 50, strike: 7, crush: 14, reflect: 3, potionRetaliation: 5,
    pattern: ['strike', 'windup', 'crush', 'stance', 'strike'],
  },
  {
    id: 'hollow-stag', name: 'Пусторогий олень', epithet: 'Мёртвая роща', icon: '♜', optional: true,
    maxHp: 56, strike: 6, crush: 15, reflect: 4, crushIgnoresGuard: true,
    pattern: ['stance', 'windup', 'crush', 'strike'],
  },
  {
    id: 'scar-bear', name: 'Шрамолап', epithet: 'Медвежья пещера', icon: '♛', optional: true,
    maxHp: 72, strike: 8, crush: 18, reflect: 4, retaliateOnHeavy: 5,
    pattern: ['strike', 'stance', 'windup', 'crush', 'strike'],
  },
] as const;

export const EXPEDITION_MAP: readonly FrontierMapNode[] = [
  { id: 'trailhead', kind: 'start', name: 'Начало пути', description: 'Выбери первый участок дороги.', next: ['old-road'] },
  { id: 'old-road', kind: 'battle', name: 'Старая дорога', description: 'Ржавый страж перекрыл тракт.', enemyIndex: 0, next: ['watchtower', 'hidden-path'] },
  { id: 'watchtower', kind: 'event', name: 'Заброшенная башня', description: 'В тайнике осталось дополнительное зелье.', next: ['burned-road', 'rat-den', 'bear-cave'] },
  { id: 'hidden-path', kind: 'event', name: 'Скрытая тропа', description: 'Можно зайти следующему врагу во фланг и начать бой с преимуществом.', next: ['burned-road', 'wolf-woods', 'hollow-grove'] },
  { id: 'rat-den', kind: 'battle', name: 'Крысиное логово', description: 'Стая атакует несколькими укусами. Уклонение надёжнее блока.', enemyIndex: 3, next: ['burned-road'] },
  { id: 'bear-cave', kind: 'battle', name: 'Медвежья пещера', description: 'Медведь отвечает на неосторожные тяжёлые удары.', enemyIndex: 6, next: ['burned-road'] },
  { id: 'wolf-woods', kind: 'battle', name: 'Волчья низина', description: 'Волк чует запах зелий и усиливает следующую атаку.', enemyIndex: 4, next: ['burned-road'] },
  { id: 'hollow-grove', kind: 'battle', name: 'Мёртвая роща', description: 'Рога пробивают блок — от разгона спасает только уклонение.', enemyIndex: 5, next: ['burned-road'] },
  { id: 'burned-road', kind: 'battle', name: 'Сгоревший тракт', description: 'Пепельный гончий почуял добычу.', enemyIndex: 1, next: ['gate'] },
  { id: 'gate', kind: 'battle', name: 'Ворота Пограничья', description: 'Последний привратник ждёт у ворот.', enemyIndex: 2, next: ['city'] },
  { id: 'city', kind: 'finish', name: 'Пограничье', description: 'Ворота открыты.', next: [] },
] as const;

const LOOT: readonly (readonly [LootOption, LootOption])[] = [
  [toLoot(WEAPONS['watch-cleaver']), toLoot(ARMORS['chain-jacket'])],
  [toLoot(WEAPONS['warden-spear']), toLoot(ARMORS['warden-shell'])],
] as const;

function toLoot(item: Weapon | Armor): LootOption {
  return {
    id: item.id,
    slot: 'attack' in item ? 'weapon' : 'armor',
    name: item.name,
    icon: item.icon,
    description: item.description,
  };
}

export function startExpedition(loadout: FrontierGear = { weapon: 'road-blade', armor: 'patched-coat' }, talents: FrontierTalents = EMPTY_FRONTIER_TALENTS): ExpeditionState {
  const gear = { ...loadout };
  const combat = createFrontierCombat(0, gear, talents);
  return {
    phase: 'map', nodeId: 'trailhead', visited: ['trailhead'], encounterIndex: 0, gear, combat,
    checkpointHp: combat.playerHp, checkpointPotions: combat.potions, checkpointEnemyHp: combat.enemyHp,
    nextBattleEffect: null,
  };
}

export function availableMapNodes(state: ExpeditionState): readonly FrontierMapNode[] {
  if (state.phase !== 'map') return [];
  const current = mapNode(state.nodeId);
  return current.next.map(mapNode);
}

export function selectMapNode(state: ExpeditionState, id: MapNodeId, talents: FrontierTalents = EMPTY_FRONTIER_TALENTS): ExpeditionState {
  const target = availableMapNodes(state).find((node) => node.id === id);
  if (!target) return state;
  if (target.kind === 'event') {
    return {
      ...state,
      nodeId: target.id,
      visited: state.visited.includes(target.id) ? state.visited : [...state.visited, target.id],
      nextBattleEffect: target.id === 'watchtower' ? 'supplies' : 'ambush',
    };
  }
  if (target.kind !== 'battle' || target.enemyIndex === undefined) return state;
  const combat = createFrontierCombat(target.enemyIndex, state.gear, talents);
  const maxHp = ARMORS[state.gear.armor].maxHp + talents.vitality * 4;
  combat.playerHp = clamp(state.combat.playerHp, 1, maxHp);
  combat.potions = Math.max(0, state.combat.potions);
  if (state.nextBattleEffect === 'supplies') {
    combat.potions++;
    combat.log.unshift('Запасы из башни: дополнительное зелье останется с героем до использования.');
  } else if (state.nextBattleEffect === 'ambush') {
    combat.enemyHp = Math.max(1, combat.enemyHp - 10);
    combat.log.unshift('Засада удалась: враг начинает бой, потеряв 10 здоровья.');
  }
  return {
    ...state,
    phase: 'battle',
    nodeId: target.id,
    visited: state.visited.includes(target.id) ? state.visited : [...state.visited, target.id],
    encounterIndex: target.enemyIndex,
    combat,
    checkpointHp: combat.playerHp,
    checkpointPotions: combat.potions,
    checkpointEnemyHp: combat.enemyHp,
    nextBattleEffect: null,
  };
}

export function createFrontierCombat(enemyIndex: number, gear: FrontierGear, talents: FrontierTalents = EMPTY_FRONTIER_TALENTS): CombatState {
  const enemy = ENEMIES[enemyIndex];
  if (!enemy) throw new RangeError(`Unknown encounter: ${enemyIndex}`);
  return {
    enemyIndex, turn: 1, playerHp: ARMORS[gear.armor].maxHp + talents.vitality * 4, enemyHp: enemy.maxHp,
    ap: 3, potions: 2 + talents.supplies, guard: false, guardUsed: false, evade: false,
    feintUsed: false, dodgeCooldown: 0, heavyCooldown: 0, scentBonus: 0,
    rage: 0, blood: false, damageThisTurn: 0, heavyThisTurn: false,
    charged: false, stunned: false, outcome: null,
    log: [`${enemy.name} преградил дорогу. Его следующий ход виден заранее.`],
  };
}

export function frontierIntent(state: CombatState): EnemyIntent {
  const enemy = ENEMIES[state.enemyIndex];
  const kind = enemy.pattern[(state.turn - 1) % enemy.pattern.length];
  const strike = enemy.strike + state.rage + (state.blood ? 2 : 0) + state.scentBonus;
  if (kind === 'swarm') {
    const hits = enemy.swarmHits ?? 2;
    return { kind, name: `Стая · ${hits} укуса`, damage: strike * hits, text: 'Блок остановит только первый укус. Уклонение спасёт от всей стаи.' };
  }
  if (kind === 'strike') {
    return { kind, name: 'Удар', damage: strike, text: 'Обычная атака. Защита уменьшит урон.' };
  }
  if (kind === 'windup') {
    return { kind, name: 'Замах', damage: 0, text: enemy.crushIgnoresGuard ? 'Тяжёлый удар сорвёт разгон. Если не успеть, от рогов спасёт только уклонение.' : 'Тяжёлый удар сейчас сорвёт Сокрушение.' };
  }
  if (kind === 'crush') {
    return state.charged
      ? { kind, name: 'Сокрушение', damage: enemy.crush + state.rage + state.scentBonus, text: enemy.crushIgnoresGuard ? 'Рога пробивают блок и оглушают. Спасает только уклонение.' : 'Сильный удар и оглушение. Защита снимет оглушение.' }
      : { kind: 'strike', name: 'Сорванный удар', damage: strike, text: 'Замах сорван — осталась обычная атака.' };
  }
  return {
    kind, name: 'Стойка', damage: 0,
    text: `Быстрые атаки отражают ${enemy.reflect + (state.blood ? 1 : 0)} урона. Тяжёлый удар ломает стойку.`,
  };
}

export function playFrontierAction(
  state: CombatState,
  gear: FrontierGear,
  action: FrontierAction,
  talents: FrontierTalents = EMPTY_FRONTIER_TALENTS,
): CombatState {
  const next = cloneCombat(state);
  const weapon = WEAPONS[gear.weapon];
  const armor = ARMORS[gear.armor];
  const currentIntent = frontierIntent(next);

  if (action === 'attack') {
    if (!canPay(next, 1)) return state;
    next.ap--;
    const damage = weapon.attack + talents.strength;
    next.log.unshift(`Быстрая атака: ${damage} урона.`);
    hurtEnemy(next, damage);
    if (!next.outcome && currentIntent.kind === 'stance' && !next.heavyThisTurn) {
      const reflected = ENEMIES[next.enemyIndex].reflect + (next.blood ? 1 : 0);
      hurtPlayer(next, armor, reflected, 'Отражение стойки');
    }
  } else if (action === 'feint') {
    if (!canPay(next, 1) || next.feintUsed) return state;
    next.ap--;
    next.feintUsed = true;
    const damage = Math.max(2, Math.floor((weapon.attack + talents.strength) * 0.4));
    const calmed = next.rage > 0;
    if (calmed) next.rage--;
    next.log.unshift(`Финт: ${damage} урона${calmed ? ', ярость врага -1' : ''}.`);
    hurtEnemy(next, damage);
  } else if (action === 'guard') {
    if (!canPay(next, 1) || next.guardUsed) return state;
    next.ap--;
    next.guard = true;
    next.guardUsed = true;
    next.log.unshift(`Защита готова: до ${armor.block} урона будет поглощено.`);
  } else if (action === 'dodge') {
    if (!canPay(next, 2) || next.dodgeCooldown > 0 || next.evade) return state;
    next.ap -= 2;
    next.evade = true;
    next.dodgeCooldown = 2;
    next.log.unshift('Уклонение готово: следующая атака врага промахнётся.');
  } else if (action === 'heavy') {
    if (!canPay(next, 2) || next.heavyCooldown > 0) return state;
    next.ap -= 2;
    next.heavyCooldown = 3;
    next.heavyThisTurn = true;
    const prefix = currentIntent.kind === 'windup'
      ? 'Тяжёлый удар срывает замах'
      : currentIntent.kind === 'stance' ? 'Тяжёлый удар ломает стойку' : 'Тяжёлый удар';
    const damage = weapon.heavy + talents.strength * 2;
    next.log.unshift(`${prefix}: ${damage} урона.`);
    hurtEnemy(next, damage);
    const retaliation = ENEMIES[next.enemyIndex].retaliateOnHeavy ?? 0;
    if (!next.outcome && retaliation > 0 && currentIntent.kind !== 'windup' && currentIntent.kind !== 'stance') {
      hurtPlayer(next, armor, retaliation, 'Ответный удар зверя');
    }
  } else {
    const maxHp = armor.maxHp + talents.vitality * 4;
    if (!canPay(next, 1) || next.potions === 0 || next.playerHp === maxHp) return state;
    next.ap--;
    next.potions--;
    const healed = Math.min(10, maxHp - next.playerHp);
    next.playerHp += healed;
    next.log.unshift(`Зелье восстановило ${healed} здоровья.`);
    const scent = ENEMIES[next.enemyIndex].potionRetaliation ?? 0;
    if (scent > 0) {
      next.scentBonus = Math.max(next.scentBonus, scent);
      next.log.unshift(`Волк чует зелье: следующая атака получит +${scent} урона.`);
    }
  }

  return next.ap === 0 && !next.outcome ? finishFrontierTurn(next, gear) : next;
}

export function finishFrontierTurn(state: CombatState, gear: FrontierGear): CombatState {
  if (state.outcome) return state;
  const next = cloneCombat(state);
  const move = frontierIntent(next);
  const enemy = ENEMIES[next.enemyIndex];
  const armor = ARMORS[gear.armor];
  let willBeStunned = false;

  if (next.damageThisTurn < 10) {
    next.rage++;
    next.log.unshift(`Ярость врага растёт до ${next.rage}: он получил меньше 10 урона.`);
  }
  if (next.evade && (move.kind === 'strike' || move.kind === 'crush' || move.kind === 'swarm')) {
    next.log.unshift(`${move.name}: промах после уклонения.`);
    next.scentBonus = 0;
  } else if (move.kind === 'swarm') {
    const hits = enemy.swarmHits ?? 2;
    const bite = Math.floor(move.damage / hits);
    for (let hit = 1; hit <= hits && !next.outcome; hit++) hurtPlayer(next, armor, bite, `Укус стаи ${hit}/${hits}`);
    next.scentBonus = 0;
  } else if (move.kind === 'strike') {
    hurtPlayer(next, armor, move.damage, move.name);
    next.scentBonus = 0;
  } else if (move.kind === 'crush') {
    const guarded = next.guard && !enemy.crushIgnoresGuard;
    hurtPlayer(next, armor, move.damage, move.name, Boolean(enemy.crushIgnoresGuard));
    next.scentBonus = 0;
    willBeStunned = !guarded && !next.outcome;
    if (willBeStunned) next.log.unshift('Оглушение: в следующем ходу будет 2 ОД.');
  } else if (move.kind === 'windup') {
    next.charged = !next.heavyThisTurn;
    next.log.unshift(next.charged ? 'Враг завершил замах. Готовится Сокрушение.' : 'Замах сорван — Сокрушения не будет.');
  } else {
    next.log.unshift(next.heavyThisTurn ? 'Стойка сломана — отражения не было.' : 'Враг удерживает стойку и ждёт атаки.');
  }

  if (next.outcome) return next;
  next.turn++;
  next.ap = willBeStunned ? 2 : 3;
  next.stunned = willBeStunned;
  next.guard = false;
  next.guardUsed = false;
  next.evade = false;
  next.feintUsed = false;
  next.heavyThisTurn = false;
  next.damageThisTurn = 0;
  next.dodgeCooldown = Math.max(0, next.dodgeCooldown - 1);
  next.heavyCooldown = Math.max(0, next.heavyCooldown - 1);
  next.blood = next.enemyHp <= Math.floor(ENEMIES[next.enemyIndex].maxHp * 0.4);
  return next;
}

export function lootOptions(state: ExpeditionState): readonly LootOption[] {
  return state.phase === 'loot' ? (LOOT[state.encounterIndex] ?? []) : [];
}

export function claimVictory(state: ExpeditionState, talents: FrontierTalents = EMPTY_FRONTIER_TALENTS): ExpeditionState {
  if (state.phase !== 'battle' || state.combat.outcome !== 'won') return state;
  if (ENEMIES[state.encounterIndex].optional) return { ...state, phase: 'map' };
  if (state.encounterIndex === 2) return { ...state, phase: 'complete', nodeId: 'city', visited: [...state.visited, 'city'] };
  const maxHp = ARMORS[state.gear.armor].maxHp + talents.vitality * 4;
  return { ...state, phase: 'loot', combat: { ...state.combat, playerHp: Math.min(maxHp, state.combat.playerHp + 8) } };
}

export function chooseLoot(state: ExpeditionState, id: LootId, talents: FrontierTalents = EMPTY_FRONTIER_TALENTS): ExpeditionState {
  const option = lootOptions(state).find((item) => item.id === id);
  if (!option) return state;
  const gear = { ...state.gear, [option.slot]: id } as FrontierGear;
  let combat = state.combat;
  if (option.slot === 'armor') {
    const oldMaxHp = ARMORS[state.gear.armor].maxHp + talents.vitality * 4;
    const newMaxHp = ARMORS[gear.armor].maxHp + talents.vitality * 4;
    const missingHp = Math.max(0, oldMaxHp - state.combat.playerHp);
    combat = { ...state.combat, playerHp: clamp(newMaxHp - missingHp, 1, newMaxHp) };
  }
  return {
    ...state,
    phase: 'map',
    gear,
    combat,
  };
}

export function retryEncounter(state: ExpeditionState, talents: FrontierTalents = EMPTY_FRONTIER_TALENTS): ExpeditionState {
  if (state.phase !== 'battle' || state.combat.outcome !== 'lost') return state;
  const combat = createFrontierCombat(state.encounterIndex, state.gear, talents);
  const maxHp = ARMORS[state.gear.armor].maxHp + talents.vitality * 4;
  combat.playerHp = clamp(state.checkpointHp, 1, maxHp);
  combat.potions = Math.max(0, state.checkpointPotions);
  combat.enemyHp = clamp(state.checkpointEnemyHp, 1, ENEMIES[state.encounterIndex].maxHp);
  combat.log.unshift(`Повтор с чекпоинта: ${combat.playerHp} здоровья, зелий ${combat.potions}, у врага ${combat.enemyHp} здоровья.`);
  return { ...state, combat };
}

function cloneCombat(state: CombatState): CombatState {
  return { ...state, log: [...state.log] };
}

function mapNode(id: MapNodeId): FrontierMapNode {
  const node = EXPEDITION_MAP.find((candidate) => candidate.id === id);
  if (!node) throw new RangeError(`Unknown map node: ${id}`);
  return node;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function canPay(state: CombatState, cost: number): boolean {
  return !state.outcome && state.ap >= cost;
}

function hurtEnemy(state: CombatState, amount: number): void {
  state.enemyHp = Math.max(0, state.enemyHp - amount);
  state.damageThisTurn += amount;
  if (state.enemyHp === 0) {
    state.outcome = 'won';
    state.log.unshift(`${ENEMIES[state.enemyIndex].name} повержен.`);
  }
}

function hurtPlayer(state: CombatState, armor: Armor, amount: number, label: string, ignoreGuard = false): void {
  const blocked = state.guard && !ignoreGuard ? Math.min(armor.block, amount) : 0;
  state.guard = false;
  state.playerHp = Math.max(0, state.playerHp - amount + blocked);
  state.log.unshift(`${label}: ${amount} урона${blocked ? `, броня поглотила ${blocked}` : ''}.`);
  if (state.playerHp === 0) {
    state.outcome = 'lost';
    state.log.unshift('Ты проиграл бой. Попробуй другой порядок действий.');
  }
}
