import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { chapter1KeyCase } from '../src/cases/chapter1-key';
import { chapter1PondCase } from '../src/cases/chapter1-pond';

describe('иллюстрации первой главы', () => {
  it.each([[chapter1KeyCase, 'ch1-key'], [chapter1PondCase, 'ch1-pond']] as const)(
    '%s: три страницы и отдельная обложка существуют', (source, prefix) => {
      expect(source.story).toHaveLength(3);
      expect(source.cover).toBeTruthy();
      for (const frame of source.story!) {
        expect(frame.alt.length).toBeGreaterThan(30);
        expect(frame.caption.length).toBeGreaterThan(30);
      }
      for (const name of [`${prefix}-book-1`, `${prefix}-book-2`, `${prefix}-book-3`, `cover-${prefix}`]) {
        expect(existsSync(new URL(`../src/story/${name}.webp`, import.meta.url))).toBe(true);
      }
    },
  );

  it('подписи пруда не раскрывают доказательства, доступные после таблиц', () => {
    const text = chapter1PondCase.story!.map(frame => frame.caption).join(' ');
    expect(text).not.toMatch(/300|1:50|мокрый след|рычаг|насос включил|лодк/);
    expect(text).not.toContain('Геннадий Ильич');
  });
});
