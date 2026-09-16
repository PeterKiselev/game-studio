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

    expect(migrated?.victories).toBe(4);
    expect(migrated?.bestStage).toBe(2);
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
    expect(migrated?.victories).toBe(3);
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
});
