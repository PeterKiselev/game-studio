export type FrontierAction = 'attack' | 'feint' | 'guard' | 'dodge' | 'heavy' | 'potion' | 'tincture';
export type CombatOutcome = 'won' | 'lost' | null;
export type WeaponId = 'road-blade' | 'watch-cleaver' | 'warden-spear' | 'bandit-sabre' | 'outpost-mace';
export type ArmorId = 'patched-coat' | 'chain-jacket' | 'warden-shell' | 'watch-cuirass' | 'aventail-mail';
export type LootId = WeaponId | ArmorId;
export type ExpeditionPhase = 'map' | 'battle' | 'loot' | 'complete';
export type MapNodeId = 'trailhead' | 'old-road' | 'watchtower' | 'hidden-path' | 'rat-den' | 'bear-cave' | 'wolf-woods' | 'hollow-grove' | 'burned-road' | 'wormwood-ravine' | 'forester-lodge' | 'gate' | 'city' | 'gate-yard' | 'outpost' | 'market-rows' | 'backyards' | 'rotten-pond' | 'butcher-row' | 'chapel' | 'wine-cellar' | 'smuggler-hole' | 'toll-yard' | 'town-square';
export type MapNodeKind = 'start' | 'battle' | 'event' | 'finish';
export type NextBattleEffect = 'supplies' | 'ambush' | null;
export type FrontierTalentId = 'strength' | 'vitality' | 'supplies';
export type ChapterId = 'prologue' | 'chapter-1';
export type FrontierContractId = 'beast-hunt' | 'quartermaster' | 'smuggler';
export type FrontierContractEvent = 'optional-win' | 'chapter-win-with-potion' | 'smuggler-win';
export type FrontierTrophyId = 'contraband';

export interface FrontierContract {
  id: FrontierContractId;
  ready: boolean;
}

export interface FrontierCityState {
  forgeLevel: number;
  extraPotion: boolean;
  extraTincture: boolean;
  pendingTrophy: FrontierTrophyId | null;
  contract: FrontierContract | null;
}

export const DEFAULT_FRONTIER_CITY: FrontierCityState = {
  forgeLevel: 0, extraPotion: false, extraTincture: false, pendingTrophy: null, contract: null,
};

export const FRONTIER_CONTRACTS: Readonly<Record<FrontierContractId, { title: string; acceptLabel: string; task: string; event: FrontierContractEvent }>> = {
  'beast-hunt': {
    title: 'Зверолов',
    acceptLabel: 'Зверолов · победить любого необязательного зверя',
    task: 'Победи любого необязательного зверя в любом походе.',
    event: 'optional-win',
  },
  quartermaster: {
    title: 'Квартирмейстер',
    acceptLabel: 'Квартирмейстер · завершить главу хотя бы с одним зельем',
    task: 'Заверши любую главу, сохранив хотя бы одно зелье.',
    event: 'chapter-win-with-potion',
  },
  smuggler: {
    title: 'Скупщик',
    acceptLabel: 'Скупщик · волкодав в винных погребах',
    task: 'В главе «За воротами» спустись в винные погреба и победи Волкодава Мытаря.',
    event: 'smuggler-win',
  },
};

export function improveFrontierForge(city: FrontierCityState, marks: number): { city: FrontierCityState; marks: number } {
  const cost = 3;
  if (city.forgeLevel >= 1 || marks < cost) return { city, marks };
  return { city: { ...city, forgeLevel: 1 }, marks: marks - cost };
}

export function buyFrontierPotion(city: FrontierCityState, marks: number): { city: FrontierCityState; marks: number } {
  if (city.extraPotion || marks < 1) return { city, marks };
  return { city: { ...city, extraPotion: true }, marks: marks - 1 };
}

export function buyFrontierTincture(city: FrontierCityState, marks: number): { city: FrontierCityState; marks: number } {
  if (city.extraTincture || marks < 1) return { city, marks };
  return { city: { ...city, extraTincture: true }, marks: marks - 1 };
}

export function frontierEnemyTrophy(enemy: Enemy): FrontierTrophyId | null {
  return enemy.id === 'toll-hound' ? 'contraband' : null;
}

export function collectFrontierTrophy(city: FrontierCityState, trophy: FrontierTrophyId): FrontierCityState {
  return city.pendingTrophy ? city : { ...city, pendingTrophy: trophy };
}

export function turnInFrontierTrophy(city: FrontierCityState, marks: number): { city: FrontierCityState; marks: number } {
  if (!city.pendingTrophy) return { city, marks };
  return { city: { ...city, pendingTrophy: null }, marks: marks + 2 };
}

export function acceptFrontierContract(city: FrontierCityState, id: FrontierContractId): FrontierCityState {
  return city.contract ? city : { ...city, contract: { id, ready: false } };
}

export function progressFrontierContract(city: FrontierCityState, event: FrontierContractEvent): FrontierCityState {
  if (!city.contract || city.contract.ready) return city;
  return FRONTIER_CONTRACTS[city.contract.id].event === event
    ? { ...city, contract: { ...city.contract, ready: true } }
    : city;
}

export function claimFrontierContract(city: FrontierCityState, marks: number): { city: FrontierCityState; marks: number } {
  if (!city.contract?.ready) return { city, marks };
  return { city: { ...city, contract: null }, marks: marks + 2 };
}

export interface FrontierTalents {
  strength: number;
  vitality: number;
  supplies: number;
}

export const EMPTY_FRONTIER_TALENTS: FrontierTalents = { strength: 0, vitality: 0, supplies: 0 };
export const FRONTIER_TALENT_CAPS: Readonly<Record<FrontierTalentId, number>> = { strength: 2, vitality: 3, supplies: 1 };

export function applyFrontierForge(talents: FrontierTalents, city: FrontierCityState): FrontierTalents {
  return city.forgeLevel === 0 ? talents : { ...talents, strength: talents.strength + city.forgeLevel };
}

export function frontierTalentCost(talents: FrontierTalents, id: FrontierTalentId): number {
  return talents[id] + 1;
}

export function frontierPouchSize(victories: number): number {
  return victories >= 3 ? 2 : victories >= 1 ? 1 : 0;
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
  feint?: number;
}

export interface Armor {
  id: ArmorId;
  name: string;
  icon: string;
  maxHp: number;
  block: number;
  description: string;
  steadfast?: boolean;
  stunProof?: boolean;
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
  riposte?: number;
  rend?: number;
}

/** Согласованная строка победы для журнала и экрана результата. */
export function frontierDefeatText(enemy: Enemy): string {
  const feminine = enemy.id === 'plague-rats' || enemy.id === 'bog-viper';
  return `${enemy.name} ${feminine ? 'повержена' : 'повержен'}`;
}

export type IntentKind = 'strike' | 'windup' | 'crush' | 'stance' | 'swarm' | 'parry' | 'rend' | 'toll';

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
  tinctures: number;
  tinctureUsed: boolean;
  bleed: number;
  parryOpen: boolean;
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
  chapter: ChapterId;
  phase: ExpeditionPhase;
  nodeId: MapNodeId;
  visited: MapNodeId[];
  encounterIndex: number;
  gear: FrontierGear;
  combat: CombatState;
  checkpointHp: number;
  checkpointPotions: number;
  checkpointEnemyHp: number;
  checkpointTinctures: number;
  nextBattleEffect: NextBattleEffect;
}

export interface FrontierMapNode {
  id: MapNodeId;
  kind: MapNodeKind;
  name: string;
  description: string;
  label?: string;
  effect?: MapEventEffect;
  enemyIndex?: number;
  next: readonly MapNodeId[];
}

export type MapEventEffect =
  | { kind: 'supplies' | 'ambush' | 'tincture' | 'heal'; amount: number }
  | { kind: 'trade'; potions: number; tinctures: number };

export interface LootOption {
  id: LootId;
  slot: 'weapon' | 'armor';
  name: string;
  icon: string;
  description: string;
}

export interface FrontierChapter {
  id: ChapterId;
  title: string;
  intro: string;
  start: MapNodeId;
  finish: MapNodeId;
  stages: readonly MapNodeId[];
  nodes: readonly MapNodeId[];
  loot: readonly (readonly [LootOption, LootOption])[];
  requiresPrologueVictories: number;
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
  'bandit-sabre': {
    id: 'bandit-sabre', name: 'Разбойничья сабля', icon: '⌁', attack: 6, heavy: 12, feint: 5,
    description: 'Финт наносит 5 урона и раскрывает отвод.',
  },
  'outpost-mace': {
    id: 'outpost-mace', name: 'Шестопёр заставы', icon: '✦', attack: 5, heavy: 16,
    description: 'Медленнее сабли, зато тяжёлый удар особенно силён.',
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
  'watch-cuirass': {
    id: 'watch-cuirass', name: 'Дозорная кираса', icon: '▤', maxHp: 38, block: 7, steadfast: true,
    description: 'Блок держится против всех ударов врага в этом ходу.',
  },
  'aventail-mail': {
    id: 'aventail-mail', name: 'Кольчуга с бармицей', icon: '◫', maxHp: 42, block: 7, stunProof: true,
    description: 'Сокрушение наносит урон, но не оглушает.',
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
  {
    id: 'outpost-sergeant', name: 'Десятник заставы', epithet: 'Надвратная застава', icon: '♜',
    maxHp: 66, strike: 8, crush: 17, reflect: 0, riposte: 9,
    pattern: ['parry', 'strike', 'windup', 'crush', 'parry'],
  },
  {
    id: 'row-butcher', name: 'Мясник с рядов', epithet: 'Мясной ряд', icon: '♝',
    maxHp: 62, strike: 7, crush: 16, reflect: 4, rend: 2,
    pattern: ['rend', 'stance', 'strike', 'windup', 'crush'],
  },
  {
    id: 'toll-master', name: 'Мытарь', epithet: 'Мытный двор', icon: '♚',
    maxHp: 68, strike: 9, crush: 18, reflect: 5, riposte: 9,
    pattern: ['toll', 'strike', 'parry', 'windup', 'crush', 'stance'],
  },
  {
    id: 'bog-viper', name: 'Болотная гадюка', epithet: 'Гнилой затон', icon: '♟', optional: true,
    maxHp: 44, strike: 5, crush: 0, reflect: 0, riposte: 7, rend: 3,
    pattern: ['parry', 'rend', 'parry', 'strike'],
  },
  {
    id: 'toll-hound', name: 'Волкодав Мытаря', epithet: 'Винные погреба', icon: '♞', optional: true,
    maxHp: 58, strike: 6, crush: 0, reflect: 3, rend: 2, swarmHits: 2,
    pattern: ['swarm', 'rend', 'stance', 'swarm'],
  },
] as const;

export const EXPEDITION_MAP: readonly FrontierMapNode[] = [
  { id: 'trailhead', kind: 'start', name: 'Начало пути', description: 'Выбери первый участок дороги.', next: ['old-road'] },
  { id: 'old-road', kind: 'battle', name: 'Старая дорога', description: 'Ржавый страж перекрыл тракт.', enemyIndex: 0, next: ['watchtower', 'hidden-path'] },
  { id: 'watchtower', kind: 'event', name: 'Заброшенная башня', description: 'В тайнике осталось дополнительное зелье.', label: 'ЗАПАСЫ', effect: { kind: 'supplies', amount: 1 }, next: ['burned-road', 'rat-den', 'bear-cave'] },
  { id: 'hidden-path', kind: 'event', name: 'Скрытая тропа', description: 'Можно зайти следующему врагу во фланг и начать бой с преимуществом.', label: 'ЗАСАДА', effect: { kind: 'ambush', amount: 10 }, next: ['burned-road', 'wolf-woods', 'hollow-grove'] },
  { id: 'rat-den', kind: 'battle', name: 'Крысиное логово', description: 'Стая атакует несколькими укусами. Уклонение надёжнее блока.', enemyIndex: 3, next: ['burned-road'] },
  { id: 'bear-cave', kind: 'battle', name: 'Медвежья пещера', description: 'Медведь отвечает на неосторожные тяжёлые удары.', enemyIndex: 6, next: ['burned-road'] },
  { id: 'wolf-woods', kind: 'battle', name: 'Волчья низина', description: 'Волк чует запах зелий и усиливает следующую атаку.', enemyIndex: 4, next: ['burned-road'] },
  { id: 'hollow-grove', kind: 'battle', name: 'Мёртвая роща', description: 'Рога пробивают блок — от разгона спасает только уклонение.', enemyIndex: 5, next: ['burned-road'] },
  { id: 'burned-road', kind: 'battle', name: 'Сгоревший тракт', description: 'Пепельный гончий почуял добычу.', enemyIndex: 1, next: ['wormwood-ravine', 'forester-lodge'] },
  { id: 'wormwood-ravine', kind: 'event', name: 'Полынный овраг', description: 'Собрать полынь: +1 настойка, которая возвращает 1 ОД в бою.', label: 'ПОЛЫНЬ', effect: { kind: 'tincture', amount: 1 }, next: ['gate'] },
  { id: 'forester-lodge', kind: 'event', name: 'Сторожка лесника', description: 'Отдохнуть перед воротами и восстановить до 8 здоровья.', label: 'НОЧЛЕГ', effect: { kind: 'heal', amount: 8 }, next: ['gate'] },
  { id: 'gate', kind: 'battle', name: 'Ворота Пограничья', description: 'Последний привратник ждёт у ворот.', enemyIndex: 2, next: ['city'] },
  { id: 'city', kind: 'finish', name: 'Пограничье', description: 'Ворота открыты.', next: [] },
  { id: 'gate-yard', kind: 'start', name: 'Надвратный двор', description: 'За воротами начинается тесный и недружелюбный посад.', next: ['outpost'] },
  { id: 'outpost', kind: 'battle', name: 'Застава', description: 'Десятник требует назвать цель визита — или доказать её клинком.', enemyIndex: 7, next: ['market-rows', 'backyards'] },
  { id: 'market-rows', kind: 'event', name: 'Торговые ряды', description: 'Обменять 1 зелье на 1 полынную настойку.', label: 'ЛАВКА', effect: { kind: 'trade', potions: 1, tinctures: 1 }, next: ['butcher-row'] },
  { id: 'backyards', kind: 'event', name: 'Задворки', description: 'Найти оставленные припасы: +1 зелье в следующем бою.', label: 'ПОДАЧКА', effect: { kind: 'supplies', amount: 1 }, next: ['butcher-row', 'rotten-pond'] },
  { id: 'rotten-pond', kind: 'battle', name: 'Гнилой затон', description: 'Гадюка отбивает поспешные удары и оставляет кровоточащие раны.', enemyIndex: 10, next: ['butcher-row'] },
  { id: 'butcher-row', kind: 'battle', name: 'Мясной ряд', description: 'Мясник закрывает дорогу к площади.', enemyIndex: 8, next: ['chapel', 'wine-cellar'] },
  { id: 'chapel', kind: 'event', name: 'Часовня', description: 'Безопасный путь: перевязать раны до 8 здоровья. Посылка скупщика останется в погребах.', label: 'ПЕРЕВЯЗКА', effect: { kind: 'heal', amount: 8 }, next: ['toll-yard'] },
  { id: 'wine-cellar', kind: 'battle', name: 'Винные погреба', description: 'Волкодав сторожит посылку скупщика: метка сразу, товар сдаётся в городе.', enemyIndex: 11, next: ['smuggler-hole'] },
  { id: 'smuggler-hole', kind: 'event', name: 'Лаз контрабандистов', description: 'Зайти Мытарю во фланг: он начнёт бой без 10 здоровья.', label: 'ЗАСАДА', effect: { kind: 'ambush', amount: 10 }, next: ['toll-yard'] },
  { id: 'toll-yard', kind: 'battle', name: 'Мытный двор', description: 'Мытарь назначил цену за проход к Ратушной площади.', enemyIndex: 9, next: ['town-square'] },
  { id: 'town-square', kind: 'finish', name: 'Ратушная площадь', description: 'Первая улица Пограничья пройдена.', next: [] },
] as const;

const LOOT: readonly (readonly [LootOption, LootOption])[] = [
  [toLoot(WEAPONS['watch-cleaver']), toLoot(ARMORS['chain-jacket'])],
  [toLoot(WEAPONS['warden-spear']), toLoot(ARMORS['warden-shell'])],
] as const;

const CHAPTER_ONE_LOOT: readonly (readonly [LootOption, LootOption])[] = [
  [toLoot(WEAPONS['bandit-sabre']), toLoot(ARMORS['watch-cuirass'])],
  [toLoot(WEAPONS['outpost-mace']), toLoot(ARMORS['aventail-mail'])],
] as const;

export const CHAPTERS: Readonly<Record<ChapterId, FrontierChapter>> = {
  prologue: {
    id: 'prologue', title: 'Первый поход', intro: 'Дорога к воротам Пограничья.',
    start: 'trailhead', finish: 'city', stages: ['old-road', 'burned-road', 'gate'],
    nodes: ['trailhead', 'old-road', 'watchtower', 'hidden-path', 'rat-den', 'bear-cave', 'wolf-woods', 'hollow-grove', 'burned-road', 'wormwood-ravine', 'forester-lodge', 'gate', 'city'],
    loot: LOOT, requiresPrologueVictories: 0,
  },
  'chapter-1': {
    id: 'chapter-1', title: 'За воротами', intro: 'Путь через посад к Ратушной площади.',
    start: 'gate-yard', finish: 'town-square', stages: ['outpost', 'butcher-row', 'toll-yard'],
    nodes: ['gate-yard', 'outpost', 'market-rows', 'backyards', 'rotten-pond', 'butcher-row', 'chapel', 'wine-cellar', 'smuggler-hole', 'toll-yard', 'town-square'],
    loot: CHAPTER_ONE_LOOT, requiresPrologueVictories: 1,
  },
};

/**
 * Походный запас из города одноразовый: он считается потраченным в момент,
 * когда игрок действительно покинул стартовый узел главы. Это не должно
 * зависеть от типа следующего узла — сегодня там бой, но завтра первым может
 * стать событие или развилка.
 */
export function applyFrontierCitySupplies(expedition: ExpeditionState, city: FrontierCityState): ExpeditionState {
  let potions = expedition.combat.potions;
  let tinctures = expedition.combat.tinctures;
  const log = [...expedition.combat.log];
  if (city.extraPotion) {
    potions++;
    log.unshift('Лавка снарядила героя дополнительным зельем.');
  }
  if (city.extraTincture) {
    tinctures++;
    log.unshift('Зельянка уложила полынную настойку.');
  }
  if (potions === expedition.combat.potions && tinctures === expedition.combat.tinctures) return expedition;
  return {
    ...expedition,
    combat: { ...expedition.combat, potions, tinctures, log },
    checkpointPotions: potions,
    checkpointTinctures: tinctures,
  };
}

export function consumeFrontierDepartureSupply(
  city: FrontierCityState,
  before: ExpeditionState,
  after: ExpeditionState,
): FrontierCityState {
  const leftStart = before.phase === 'map'
    && before.nodeId === CHAPTERS[before.chapter].start
    && (after.nodeId !== before.nodeId || after.phase !== before.phase);
  if (!leftStart || (!city.extraPotion && !city.extraTincture)) return city;
  return { ...city, extraPotion: false, extraTincture: false };
}

function toLoot(item: Weapon | Armor): LootOption {
  return {
    id: item.id,
    slot: 'attack' in item ? 'weapon' : 'armor',
    name: item.name,
    icon: item.icon,
    description: item.description,
  };
}

export function startExpedition(loadout: FrontierGear = { weapon: 'road-blade', armor: 'patched-coat' }, talents: FrontierTalents = EMPTY_FRONTIER_TALENTS, tinctures = 0, chapterId: ChapterId = 'prologue'): ExpeditionState {
  const gear = { ...loadout };
  const chapter = CHAPTERS[chapterId];
  const firstStage = mapNode(chapter.stages[0]);
  if (firstStage.enemyIndex === undefined) throw new RangeError(`Chapter ${chapterId} starts without an encounter`);
  const combat = createFrontierCombat(firstStage.enemyIndex, gear, talents, tinctures);
  return {
    chapter: chapterId, phase: 'map', nodeId: chapter.start, visited: [chapter.start], encounterIndex: firstStage.enemyIndex, gear, combat,
    checkpointHp: combat.playerHp, checkpointPotions: combat.potions, checkpointEnemyHp: combat.enemyHp,
    checkpointTinctures: combat.tinctures,
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
    const combat = cloneCombat(state.combat);
    const effect = target.effect;
    let nextBattleEffect = state.nextBattleEffect;
    if (effect?.kind === 'tincture') {
      combat.tinctures += effect.amount;
      combat.log.unshift(`Получена полынная настойка: +${effect.amount}.`);
    } else if (effect?.kind === 'heal') {
      const maxHp = ARMORS[state.gear.armor].maxHp + talents.vitality * 4;
      const healed = Math.min(effect.amount, maxHp - combat.playerHp);
      combat.playerHp += healed;
      combat.log.unshift(healed > 0 ? `Перевязка восстановила ${healed} здоровья.` : 'Здоровье уже полное.');
    } else if (effect?.kind === 'trade') {
      if (combat.potions >= effect.potions) {
        combat.potions -= effect.potions;
        combat.tinctures += effect.tinctures;
        combat.log.unshift(`Обмен: −${effect.potions} зелье, +${effect.tinctures} настойка.`);
      } else {
        combat.log.unshift('Для обмена не хватило зелий.');
      }
    } else if (effect?.kind === 'supplies') {
      nextBattleEffect = 'supplies';
    } else if (effect?.kind === 'ambush') {
      nextBattleEffect = 'ambush';
    }
    return {
      ...state,
      combat,
      nodeId: target.id,
      visited: state.visited.includes(target.id) ? state.visited : [...state.visited, target.id],
      nextBattleEffect,
    };
  }
  if (target.kind !== 'battle' || target.enemyIndex === undefined) return state;
  const combat = createFrontierCombat(target.enemyIndex, state.gear, talents, state.combat.tinctures);
  const maxHp = ARMORS[state.gear.armor].maxHp + talents.vitality * 4;
  combat.playerHp = clamp(state.combat.playerHp, 1, maxHp);
  combat.potions = Math.max(0, state.combat.potions);
  if (state.nextBattleEffect === 'supplies') {
    combat.potions++;
    combat.log.unshift('Найденные запасы: дополнительное зелье останется с героем до использования.');
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
    checkpointTinctures: combat.tinctures,
    nextBattleEffect: null,
  };
}

export function createFrontierCombat(enemyIndex: number, gear: FrontierGear, talents: FrontierTalents = EMPTY_FRONTIER_TALENTS, tinctures = 0): CombatState {
  const enemy = ENEMIES[enemyIndex];
  if (!enemy) throw new RangeError(`Unknown encounter: ${enemyIndex}`);
  return {
    enemyIndex, turn: 1, playerHp: ARMORS[gear.armor].maxHp + talents.vitality * 4, enemyHp: enemy.maxHp,
    ap: 3, potions: 2 + talents.supplies, tinctures, tinctureUsed: false, bleed: 0, parryOpen: false, guard: false, guardUsed: false, evade: false,
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
  if (kind === 'parry') {
    const riposte = enemy.riposte ?? enemy.strike;
    return { kind, name: 'Отвод', damage: riposte, text: `Первый прямой удар будет отбит с ответом ${riposte}. Начни с финта.` };
  }
  if (kind === 'rend') {
    return { kind, name: 'Рваный удар', damage: strike, text: `Прошедший урон вызовет кровотечение: ${enemy.rend ?? 1} урона в конце трёх ходов. Зелье снимает эффект.` };
  }
  if (kind === 'toll') {
    return state.potions > 0
      ? { kind, name: 'Подать', damage: 0, text: 'Мытарь отнимет зелье и восстановит 10 здоровья. Можно уклониться.' }
      : { kind, name: 'Подать силой', damage: strike + 4, text: 'Зелий нет — Мытарь взыщет подать ударом. Можно уклониться.' };
  }
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
    if (currentIntent.kind === 'parry' && !next.parryOpen) {
      next.parryOpen = true;
      next.log.unshift('Быстрая атака отбита отводом. Теперь защита врага раскрыта.');
      hurtPlayer(next, armor, ENEMIES[next.enemyIndex].riposte ?? ENEMIES[next.enemyIndex].strike, 'Ответ отвода');
    } else {
      next.log.unshift(`Быстрая атака: ${damage} урона.`);
      hurtEnemy(next, damage);
    }
    if (!next.outcome && currentIntent.kind === 'stance' && !next.heavyThisTurn) {
      const reflected = ENEMIES[next.enemyIndex].reflect + (next.blood ? 1 : 0);
      hurtPlayer(next, armor, reflected, 'Отражение стойки');
    }
  } else if (action === 'feint') {
    if (!canPay(next, 1) || next.feintUsed) return state;
    next.ap--;
    next.feintUsed = true;
    const damage = weapon.feint ?? Math.max(2, Math.floor((weapon.attack + talents.strength) * 0.4));
    const calmed = next.rage > 0;
    if (calmed) next.rage--;
    next.log.unshift(`Финт: ${damage} урона${calmed ? ', ярость врага -1' : ''}.`);
    if (currentIntent.kind === 'parry') next.parryOpen = true;
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
    if (currentIntent.kind === 'parry' && !next.parryOpen) {
      next.parryOpen = true;
      next.log.unshift('Тяжёлый удар отбил отвод. Теперь защита врага раскрыта.');
      hurtPlayer(next, armor, ENEMIES[next.enemyIndex].riposte ?? ENEMIES[next.enemyIndex].strike, 'Ответ отвода');
    } else {
      next.log.unshift(`${prefix}: ${damage} урона.`);
      hurtEnemy(next, damage);
    }
    const retaliation = ENEMIES[next.enemyIndex].retaliateOnHeavy ?? 0;
    if (!next.outcome && retaliation > 0 && currentIntent.kind !== 'windup' && currentIntent.kind !== 'stance') {
      hurtPlayer(next, armor, retaliation, 'Ответный удар зверя');
    }
  } else if (action === 'potion') {
    const maxHp = armor.maxHp + talents.vitality * 4;
    if (!canPay(next, 1) || next.potions === 0 || (next.playerHp === maxHp && next.bleed === 0)) return state;
    next.ap--;
    next.potions--;
    const healed = Math.min(10, maxHp - next.playerHp);
    next.playerHp += healed;
    const stoppedBleed = next.bleed > 0;
    next.bleed = 0;
    next.log.unshift(`Зелье восстановило ${healed} здоровья${stoppedBleed ? ' и остановило кровотечение' : ''}.`);
    const scent = ENEMIES[next.enemyIndex].potionRetaliation ?? 0;
    if (scent > 0) {
      next.scentBonus = Math.max(next.scentBonus, scent);
      next.log.unshift(`Волк чует зелье: следующая атака получит +${scent} урона.`);
    }
  } else {
    if (next.outcome || next.tinctures === 0 || next.tinctureUsed || next.ap >= 4) return state;
    next.tinctures--;
    next.tinctureUsed = true;
    next.ap++;
    next.log.unshift('Полынная настойка вернула 1 ОД.');
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
  let bleedApplied = false;

  if (next.damageThisTurn < 10) {
    next.rage++;
    next.log.unshift(`Ярость врага растёт до ${next.rage}: он получил меньше 10 урона.`);
  }
  if (next.evade && (move.kind === 'strike' || move.kind === 'crush' || move.kind === 'swarm' || move.kind === 'rend' || move.kind === 'toll')) {
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
  } else if (move.kind === 'rend') {
    const before = next.playerHp;
    hurtPlayer(next, armor, move.damage, move.name);
    if (!next.outcome && next.playerHp < before) {
      next.bleed = 3;
      bleedApplied = true;
      next.log.unshift(`Кровотечение: ещё ${next.bleed} хода.`);
    }
    next.scentBonus = 0;
  } else if (move.kind === 'toll') {
    if (next.potions > 0) {
      next.potions--;
      const healed = Math.min(10, enemy.maxHp - next.enemyHp);
      next.enemyHp += healed;
      next.log.unshift(`Мытарь забрал зелье и восстановил ${healed} здоровья.`);
    } else {
      hurtPlayer(next, armor, move.damage, move.name);
    }
  } else if (move.kind === 'parry') {
    next.log.unshift(next.parryOpen ? 'Отвод раскрыт финтом или атакой.' : 'Враг сохранил отвод и не атаковал.');
  } else if (move.kind === 'crush') {
    const guarded = next.guard && !enemy.crushIgnoresGuard;
    hurtPlayer(next, armor, move.damage, move.name, Boolean(enemy.crushIgnoresGuard));
    next.scentBonus = 0;
    willBeStunned = !guarded && !armor.stunProof && !next.outcome;
    if (willBeStunned) next.log.unshift('Оглушение: в следующем ходу будет 2 ОД.');
  } else if (move.kind === 'windup') {
    next.charged = !next.heavyThisTurn;
    next.log.unshift(next.charged ? 'Враг завершил замах. Готовится Сокрушение.' : 'Замах сорван — Сокрушения не будет.');
  } else {
    next.log.unshift(next.heavyThisTurn ? 'Стойка сломана — отражения не было.' : 'Враг удерживает стойку и ждёт атаки.');
  }

  if (!next.outcome && next.bleed > 0 && !bleedApplied) {
    const bleedDamage = enemy.rend ?? 1;
    next.bleed--;
    hurtPlayer(next, armor, bleedDamage, 'Кровотечение', true);
  }
  if (next.outcome) return next;
  next.turn++;
  next.ap = willBeStunned ? 2 : 3;
  next.stunned = willBeStunned;
  next.guard = false;
  next.guardUsed = false;
  next.evade = false;
  next.feintUsed = false;
  next.tinctureUsed = false;
  next.parryOpen = false;
  next.heavyThisTurn = false;
  next.damageThisTurn = 0;
  next.dodgeCooldown = Math.max(0, next.dodgeCooldown - 1);
  next.heavyCooldown = Math.max(0, next.heavyCooldown - 1);
  next.blood = next.enemyHp <= Math.floor(ENEMIES[next.enemyIndex].maxHp * 0.4);
  return next;
}

export function lootOptions(state: ExpeditionState): readonly LootOption[] {
  return state.phase === 'loot' ? (CHAPTERS[state.chapter].loot[chapterStage(state)] ?? []) : [];
}

export function claimVictory(state: ExpeditionState, talents: FrontierTalents = EMPTY_FRONTIER_TALENTS): ExpeditionState {
  if (state.phase !== 'battle' || state.combat.outcome !== 'won') return state;
  if (ENEMIES[state.encounterIndex].optional) return { ...state, phase: 'map' };
  const chapter = CHAPTERS[state.chapter];
  if (isFinalStage(state)) return { ...state, phase: 'complete', nodeId: chapter.finish, visited: [...state.visited, chapter.finish] };
  const maxHp = ARMORS[state.gear.armor].maxHp + talents.vitality * 4;
  return { ...state, phase: 'loot', combat: { ...state.combat, playerHp: Math.min(maxHp, state.combat.playerHp + 8) } };
}

export function chapterStage(state: ExpeditionState): number {
  return CHAPTERS[state.chapter].stages.indexOf(state.nodeId);
}

export function isFinalStage(state: ExpeditionState): boolean {
  return chapterStage(state) === CHAPTERS[state.chapter].stages.length - 1;
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
  combat.tinctures = Math.max(0, state.checkpointTinctures);
  combat.enemyHp = clamp(state.checkpointEnemyHp, 1, ENEMIES[state.encounterIndex].maxHp);
  combat.log.unshift(`Повтор с чекпоинта: ${combat.playerHp} здоровья, зелий ${combat.potions}, настоек ${combat.tinctures}, у врага ${combat.enemyHp} здоровья.`);
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
    state.log.unshift(`${frontierDefeatText(ENEMIES[state.enemyIndex])}.`);
  }
}

function hurtPlayer(state: CombatState, armor: Armor, amount: number, label: string, ignoreGuard = false): void {
  const blocked = state.guard && !ignoreGuard ? Math.min(armor.block, amount) : 0;
  if (!armor.steadfast) state.guard = false;
  state.playerHp = Math.max(0, state.playerHp - amount + blocked);
  state.log.unshift(`${label}: ${amount} урона${blocked ? `, броня поглотила ${blocked}` : ''}.`);
  if (state.playerHp === 0) {
    state.outcome = 'lost';
    state.log.unshift('Ты проиграл бой. Попробуй другой порядок действий.');
  }
}
