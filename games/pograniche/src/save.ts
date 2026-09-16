import {
  ARMORS,
  EMPTY_FRONTIER_TALENTS,
  STARTER_INVENTORY,
  WEAPONS,
  frontierPouchSize,
  unlockFrontierLoot,
} from '@studio/rules';
import type {
  CombatState,
  ExpeditionState,
  FrontierGear,
  FrontierInventory,
  FrontierTalents,
  MapNodeId,
} from '@studio/rules';

export interface PogranicheSave {
  victories: number;
  bestStage: number;
  run: ExpeditionState | null;
  inventory: FrontierInventory;
  loadout: FrontierGear;
  marks: number;
  talents: FrontierTalents;
}

interface LegacySave {
  victories?: number;
  bestStage?: number;
  run?: LegacyRun | null;
}

interface LegacyRun {
  phase: 'battle' | 'loot' | 'complete';
  encounterIndex: number;
  gear: FrontierGear;
  combat: CombatState;
}

export const DEFAULT_LOADOUT: FrontierGear = { weapon: 'road-blade', armor: 'patched-coat' };

export function defaultPogranicheSave(): PogranicheSave {
  return {
    victories: 0,
    bestStage: 0,
    run: null,
    inventory: { weapons: [...STARTER_INVENTORY.weapons], armors: [...STARTER_INVENTORY.armors] },
    loadout: { ...DEFAULT_LOADOUT },
    marks: 0,
    talents: { ...EMPTY_FRONTIER_TALENTS },
  };
}

export function migratePogranicheSave(old: unknown, fromVersion: number): PogranicheSave | null {
  if (typeof old !== 'object' || old === null || fromVersion < 1 || fromVersion > 7) return null;
  if (fromVersion === 7) {
    const saved = old as PogranicheSave;
    if (!hasCurrentSaveShape(saved)) return null;
    const atTrailhead = saved.run?.phase === 'map' && saved.run.nodeId === 'trailhead';
    const tinctures = atTrailhead ? frontierPouchSize(numberOrZero(saved.victories)) : 0;
    return { ...saved, run: saved.run ? withV8Fields(saved.run, tinctures) : null };
  }
  if (fromVersion === 6) {
    const saved = old as PogranicheSave;
    if (!hasCurrentSaveShape(saved)) return null;
    return { ...saved, run: saved.run ? withCheckpoints(saved.run) : null };
  }
  if (fromVersion === 5) {
    const saved = old as PogranicheSave;
    if (!hasCurrentSaveShape(saved)) return null;
    return { ...saved, run: saved.run ? withCheckpoints(saved.run) : null, marks: 0, talents: { ...EMPTY_FRONTIER_TALENTS } };
  }
  if (fromVersion === 4) {
    const saved = old as Partial<PogranicheSave>;
    if (!saved.inventory || !saved.loadout) return null;
    return {
      victories: numberOrZero(saved.victories),
      bestStage: numberOrZero(saved.bestStage),
      inventory: saved.inventory,
      loadout: saved.loadout,
      run: saved.run ? withCheckpoints({ ...saved.run, nextBattleEffect: saved.run.nextBattleEffect ?? null, combat: { ...saved.run.combat, scentBonus: 0 } }) : null,
      marks: 0,
      talents: { ...EMPTY_FRONTIER_TALENTS },
    };
  }
  const saved = old as LegacySave;
  if (fromVersion === 1) {
    return { ...defaultPogranicheSave(), victories: numberOrZero(saved.victories) };
  }

  const legacyRun = saved.run && isLegacyRun(saved.run) ? saved.run : null;
  const run = legacyRun ? normalizeRun(legacyRun, fromVersion === 2) : null;
  let inventory: FrontierInventory = {
    weapons: [...STARTER_INVENTORY.weapons],
    armors: [...STARTER_INVENTORY.armors],
  };
  if (legacyRun) {
    inventory = unlockFrontierLoot(inventory, legacyRun.gear.weapon);
    inventory = unlockFrontierLoot(inventory, legacyRun.gear.armor);
  }
  return {
    victories: numberOrZero(saved.victories),
    bestStage: numberOrZero(saved.bestStage),
    run,
    inventory,
    loadout: legacyRun ? { ...legacyRun.gear } : { ...DEFAULT_LOADOUT },
    marks: 0,
    talents: { ...EMPTY_FRONTIER_TALENTS },
  };
}

function normalizeRun(run: LegacyRun, addV3CombatFields: boolean): ExpeditionState {
  const combat = addV3CombatFields
    ? { ...run.combat, evade: false, feintUsed: false, dodgeCooldown: 0 }
    : { ...run.combat };
  return {
    ...run,
    nodeId: nodeForLegacyRun(run),
    visited: visitedForLegacyRun(run),
    combat: { ...combat, scentBonus: 0, tinctures: 0, tinctureUsed: false },
    checkpointHp: combat.playerHp,
    checkpointPotions: combat.potions,
    checkpointEnemyHp: combat.enemyHp,
    checkpointTinctures: 0,
    nextBattleEffect: null,
  };
}

function withCheckpoints(run: ExpeditionState): ExpeditionState {
  const upgraded = withV8Fields(run);
  return {
    ...upgraded,
    checkpointHp: upgraded.combat.playerHp,
    checkpointPotions: upgraded.combat.potions,
    checkpointEnemyHp: upgraded.combat.enemyHp,
    checkpointTinctures: upgraded.combat.tinctures,
  };
}

function withV8Fields(run: ExpeditionState, tinctures = 0): ExpeditionState {
  return {
    ...run,
    combat: { ...run.combat, tinctures, tinctureUsed: false },
    checkpointTinctures: tinctures,
  };
}

function hasCurrentSaveShape(saved: { inventory?: unknown; loadout?: unknown; run?: unknown }): boolean {
  if (!saved.inventory || typeof saved.inventory !== 'object' || !saved.loadout || typeof saved.loadout !== 'object') return false;
  const inventory = saved.inventory as { weapons?: unknown; armors?: unknown };
  const loadout = saved.loadout as { weapon?: unknown; armor?: unknown };
  if (!Array.isArray(inventory.weapons) || !inventory.weapons.every((id) => typeof id === 'string' && id in WEAPONS)) return false;
  if (!Array.isArray(inventory.armors) || !inventory.armors.every((id) => typeof id === 'string' && id in ARMORS)) return false;
  if (typeof loadout.weapon !== 'string' || !(loadout.weapon in WEAPONS) || typeof loadout.armor !== 'string' || !(loadout.armor in ARMORS)) return false;
  if (saved.run === null || saved.run === undefined) return true;
  if (typeof saved.run !== 'object') return false;
  const run = saved.run as { combat?: unknown };
  if (typeof run.combat !== 'object' || run.combat === null) return false;
  const combat = run.combat as { playerHp?: unknown; potions?: unknown; enemyHp?: unknown };
  return Number.isFinite(combat.playerHp) && Number.isFinite(combat.potions) && Number.isFinite(combat.enemyHp);
}

function visitedForLegacyRun(run: LegacyRun): MapNodeId[] {
  const visited: MapNodeId[] = ['trailhead', 'old-road'];
  if (run.encounterIndex >= 1) visited.push('watchtower', 'burned-road');
  if (run.encounterIndex >= 2) visited.push('gate');
  if (run.phase === 'complete') visited.push('city');
  return visited;
}

function nodeForLegacyRun(run: LegacyRun): MapNodeId {
  if (run.phase === 'complete') return 'city';
  if (run.encounterIndex === 0) return 'old-road';
  if (run.encounterIndex === 1) return 'burned-road';
  return 'gate';
}

function isLegacyRun(value: LegacyRun): boolean {
  return typeof value.encounterIndex === 'number' && typeof value.gear === 'object' && value.gear !== null && typeof value.combat === 'object' && value.combat !== null;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
