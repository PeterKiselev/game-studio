import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fifthCase } from '../src/cases/fifth';

describe('иллюстрированное дело про рынок', () => {
  it('содержит три страницы с подписями и доступными изображениями', () => {
    expect(fifthCase.story).toHaveLength(3);
    for (const frame of fifthCase.story!) {
      expect(frame.caption.length).toBeGreaterThan(30);
      expect(frame.alt.length).toBeGreaterThan(30);
    }
    for (const name of ['fifth-market-book-1', 'fifth-market-book-2', 'fifth-market-book-3', 'cover-fifth-market']) {
      expect(existsSync(new URL(`../src/story/${name}.webp`, import.meta.url))).toBe(true);
    }
  });

  it('не раскрывает владельцев покупок во вступлении и подписях', () => {
    const text = [fifthCase.intro, ...fifthCase.story!.map((frame) => frame.caption)].join(' ');
    expect(text).not.toMatch(/Зоя.{0,15}семен|Игорь.{0,15}гвозд|Настя.{0,15}мёд|Рома.{0,15}творог/);
    expect(fifthCase.cover).toBeTruthy();
  });
});
