import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { sixthCase } from '../src/cases/sixth';

describe('иллюстрированное дело про костёр', () => {
  it('содержит три страницы с подписями и отдельную обложку', () => {
    expect(sixthCase.story).toHaveLength(3);
    for (const frame of sixthCase.story!) {
      expect(frame.caption.length).toBeGreaterThan(30);
      expect(frame.alt.length).toBeGreaterThan(30);
    }
    for (const name of ['sixth-campfire-book-1', 'sixth-campfire-book-2', 'sixth-campfire-book-3', 'cover-sixth-campfire']) {
      expect(existsSync(new URL(`../src/story/${name}.webp`, import.meta.url))).toBe(true);
    }
  });

  it('не раскрывает владельцев мест и порядок прихода', () => {
    const text = [sixthCase.intro, ...sixthCase.story!.map(frame => frame.caption)].join(' ');
    expect(text).not.toMatch(/Ксюша.{0,15}бревн|Влад.{0,15}трав|Оля.{0,15}расклад|Митя.{0,15}камен/);
    expect(text).not.toMatch(/пришла первой|пришёл вторым|пришла третьей|пришёл последним/);
  });
});
