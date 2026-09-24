import { describe, expect, it } from 'vitest';
import { selectMapNode, startExpedition } from '@studio/rules';
import { migratePogranicheSave } from '../src/save';

describe('Пограничье: миграция сохранения', () => {
  it('переносит незавершённый save v3 на карту и сохраняет найденную экипировку', () => {
    const current = selectMapNode(startExpedition({ weapon: 'watch-cleaver', armor: 'chain-jacket' }), 'old-road');
    const legacy = {
      victories: 4,
      bestStage: 2,
      run: {
        phase: current.phase,
        encounterIndex: current.encounterIndex,
        gear: current.gear,
        combat: current.combat,
      },
    };
    const migrated = migratePogranicheSave(legacy, 3);

    expect(migrated?.progress.prologue.victories).toBe(4);
    expect(migrated?.progress.prologue.bestStage).toBe(2);
    expect(migrated?.chapter).toBe('prologue');
    expect(migrated?.run?.nodeId).toBe('old-road');
    expect(migrated?.run?.combat.turn).toBe(current.combat.turn);
    expect(migrated?.inventory.weapons).toContain('watch-cleaver');
    expect(migrated?.inventory.armors).toContain('chain-jacket');
    expect(migrated?.loadout).toEqual(current.gear);
  });

  it('не переносит повреждённое или неизвестное сохранение', () => {
    expect(migratePogranicheSave(null, 3)).toBeNull();
    expect(migratePogranicheSave({}, 99)).toBeNull();
  });

  it('добавляет состояние навыка зверей в save v4 без потери карты и коллекции', () => {
    const run = startExpedition();
    const legacy = {
      victories: 2,
      bestStage: 1,
      run: { ...run, combat: { ...run.combat, scentBonus: undefined } },
      inventory: { weapons: ['road-blade', 'watch-cleaver'], armors: ['patched-coat'] },
      loadout: { weapon: 'watch-cleaver', armor: 'patched-coat' },
    };
    const migrated = migratePogranicheSave(legacy, 4);
    expect(migrated?.run?.combat.scentBonus).toBe(0);
    expect(migrated?.run?.nodeId).toBe('trailhead');
    expect(migrated?.inventory.weapons).toContain('watch-cleaver');
  });

  it('добавляет метки и таланты в save v5 без потери текущего похода', () => {
    const legacy = {
      victories: 3,
      bestStage: 2,
      run: startExpedition(),
      inventory: { weapons: ['road-blade'] as const, armors: ['patched-coat'] as const },
      loadout: { weapon: 'road-blade' as const, armor: 'patched-coat' as const },
    };
    const migrated = migratePogranicheSave(legacy, 5);
    expect(migrated?.progress.prologue.victories).toBe(3);
    expect(migrated?.run?.nodeId).toBe('trailhead');
    expect(migrated?.marks).toBe(0);
    expect(migrated?.talents).toEqual({ strength: 0, vitality: 0, supplies: 0 });
  });

  it('добавляет безопасный чекпоинт в save v6 из текущих ресурсов боя', () => {
    const run = selectMapNode(startExpedition(), 'old-road');
    const legacyRun = { ...run, combat: { ...run.combat, playerHp: 13, potions: 1, enemyHp: 21 } };
    const { checkpointHp: _hp, checkpointPotions: _potions, checkpointEnemyHp: _enemy, ...withoutCheckpoint } = legacyRun;
    const legacy = {
      victories: 1,
      bestStage: 1,
      run: withoutCheckpoint,
      inventory: { weapons: ['road-blade'] as const, armors: ['patched-coat'] as const },
      loadout: { weapon: 'road-blade' as const, armor: 'patched-coat' as const },
      marks: 2,
      talents: { strength: 1, vitality: 0, supplies: 0 },
    };
    const migrated = migratePogranicheSave(legacy, 6);
    expect(migrated?.run?.checkpointHp).toBe(13);
    expect(migrated?.run?.checkpointPotions).toBe(1);
    expect(migrated?.run?.checkpointEnemyHp).toBe(21);
    expect(migrated?.marks).toBe(2);
  });

  it('отбрасывает битый save v6 вместо падения миграции', () => {
    expect(migratePogranicheSave({ inventory: {}, loadout: {}, run: {} }, 6)).toBeNull();
    expect(migratePogranicheSave({
      inventory: { weapons: ['road-blade'], armors: ['patched-coat'] },
      loadout: { weapon: 'неизвестное', armor: 'patched-coat' },
      run: null,
    }, 6)).toBeNull();
  });

  it('добавляет настойки и их чекпоинт в save v7 без подарка посреди похода', () => {
    const current = selectMapNode(startExpedition(), 'old-road');
    const { checkpointTinctures: _checkpoint, ...runWithoutCheckpoint } = current;
    const { tinctures: _tinctures, tinctureUsed: _used, ...combatWithoutTinctures } = current.combat;
    const legacy = {
      victories: 4,
      bestStage: 2,
      run: { ...runWithoutCheckpoint, combat: combatWithoutTinctures },
      inventory: { weapons: ['road-blade'] as const, armors: ['patched-coat'] as const },
      loadout: { weapon: 'road-blade' as const, armor: 'patched-coat' as const },
      marks: 1,
      talents: { strength: 1, vitality: 0, supplies: 0 },
    };
    const migrated = migratePogranicheSave(legacy, 7);
    expect(migrated?.run?.combat.tinctures).toBe(0);
    expect(migrated?.run?.combat.tinctureUsed).toBe(false);
    expect(migrated?.run?.checkpointTinctures).toBe(0);
    expect(migrated?.progress.prologue.victories).toBe(4);
    expect(migrated?.marks).toBe(1);
  });

  it('выдаёт заслуженный кисет при миграции v7, если поход ещё не начат', () => {
    const current = startExpedition();
    const { checkpointTinctures: _checkpoint, ...runWithoutCheckpoint } = current;
    const { tinctures: _tinctures, tinctureUsed: _used, ...combatWithoutTinctures } = current.combat;
    const migrated = migratePogranicheSave({
      victories: 4,
      bestStage: 3,
      run: { ...runWithoutCheckpoint, combat: combatWithoutTinctures },
      inventory: { weapons: ['road-blade'] as const, armors: ['patched-coat'] as const },
      loadout: { weapon: 'road-blade' as const, armor: 'patched-coat' as const },
      marks: 0,
      talents: { strength: 0, vitality: 0, supplies: 0 },
    }, 7);
    expect(migrated?.run?.combat.tinctures).toBe(2);
    expect(migrated?.run?.checkpointTinctures).toBe(2);
  });

  it('переносит save v8 в независимый прогресс глав', () => {
    const legacy = {
      victories: 5,
      bestStage: 3,
      run: startExpedition(),
      inventory: { weapons: ['road-blade'] as const, armors: ['patched-coat'] as const },
      loadout: { weapon: 'road-blade' as const, armor: 'patched-coat' as const },
      marks: 2,
      talents: { strength: 1, vitality: 1, supplies: 0 },
    };
    const migrated = migratePogranicheSave(legacy, 8);
    expect(migrated?.chapter).toBe('prologue');
    expect(migrated?.progress).toEqual({
      prologue: { victories: 5, bestStage: 3 },
      'chapter-1': { victories: 0, bestStage: 0 },
      'chapter-2': { victories: 0, bestStage: 0 },
    });
    expect(migrated?.run?.chapter).toBe('prologue');
    expect(migrated?.run?.combat.bleed).toBe(0);
    expect(migrated?.run?.combat.parryOpen).toBe(false);
  });

  it('добавляет город в save v9 без потери главы и похода', () => {
    const run = startExpedition({ weapon: 'warden-spear', armor: 'warden-shell' }, undefined, 1, 'chapter-1');
    const legacy = {
      chapter: 'chapter-1' as const,
      progress: { prologue: { victories: 2, bestStage: 3 }, 'chapter-1': { victories: 1, bestStage: 2 } },
      run,
      inventory: { weapons: ['road-blade', 'warden-spear'] as const, armors: ['patched-coat', 'warden-shell'] as const },
      loadout: { weapon: 'warden-spear' as const, armor: 'warden-shell' as const },
      marks: 4,
      talents: { strength: 1, vitality: 1, supplies: 0 },
    };
    const migrated = migratePogranicheSave(legacy, 9);
    expect(migrated?.chapter).toBe('chapter-1');
    expect(migrated?.run?.nodeId).toBe('gate-yard');
    expect(migrated?.marks).toBe(4);
    expect(migrated?.city).toEqual({
      forgeLevel: 0, extraPotion: false, extraTincture: false, pendingTrophy: null, contract: null,
    });
  });

  it('добавляет настойку и скупщика в save v10 без потери города', () => {
    const run = startExpedition();
    const legacy = {
      chapter: 'prologue' as const,
      progress: { prologue: { victories: 1, bestStage: 3 }, 'chapter-1': { victories: 0, bestStage: 0 } },
      run,
      inventory: { weapons: ['road-blade'] as const, armors: ['patched-coat'] as const },
      loadout: { weapon: 'road-blade' as const, armor: 'patched-coat' as const },
      marks: 2,
      talents: { strength: 0, vitality: 0, supplies: 0 },
      city: { forgeLevel: 1, extraPotion: true, contract: { id: 'beast-hunt' as const, ready: true } },
    };
    const migrated = migratePogranicheSave(legacy, 10);
    expect(migrated?.city).toEqual({
      forgeLevel: 1, extraPotion: true, extraTincture: false, pendingTrophy: null, contract: { id: 'beast-hunt', ready: true },
    });
    expect(migrated?.run?.nodeId).toBe('trailhead');
  });

  it('добавляет главу II в save v11 без потери текущей главы', () => {
    const legacy = {
      chapter: 'chapter-1' as const,
      progress: { prologue: { victories: 2, bestStage: 3 }, 'chapter-1': { victories: 1, bestStage: 3 } },
      run: startExpedition({ weapon: 'outpost-mace', armor: 'aventail-mail' }, undefined, 1, 'chapter-1'),
      inventory: { weapons: ['road-blade', 'outpost-mace'] as const, armors: ['patched-coat', 'aventail-mail'] as const },
      loadout: { weapon: 'outpost-mace' as const, armor: 'aventail-mail' as const },
      marks: 3,
      talents: { strength: 1, vitality: 1, supplies: 0 },
      city: { forgeLevel: 1, extraPotion: false, extraTincture: false, pendingTrophy: null, contract: null },
    };
    const migrated = migratePogranicheSave(legacy, 11);
    expect(migrated?.chapter).toBe('chapter-1');
    expect(migrated?.progress['chapter-1']).toEqual({ victories: 1, bestStage: 3 });
    expect(migrated?.progress['chapter-2']).toEqual({ victories: 0, bestStage: 0 });
    expect(migrated?.loadout).toEqual(legacy.loadout);
  });

  it('отклоняет повреждённый save v9 до запуска интерфейса', () => {
    const broken = {
      chapter: 'chapter-1', progress: null, run: null,
      inventory: { weapons: ['road-blade'], armors: ['patched-coat'] },
      loadout: { weapon: 'road-blade', armor: 'patched-coat' },
      marks: 2, talents: { strength: 0, vitality: 0, supplies: 0 },
    };
    expect(migratePogranicheSave(broken, 9)).toBeNull();
    expect(migratePogranicheSave({ ...broken, progress: { prologue: { victories: 1, bestStage: 3 }, 'chapter-1': { victories: 0, bestStage: 0 } }, talents: null }, 9)).toBeNull();
  });
});
