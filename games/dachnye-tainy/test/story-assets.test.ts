import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { cases } from '../src/cases';

/**
 * Картинки книжек: у каждого сюжетного дела свои страницы и своя обложка, и все они одного
 * стандарта — страницы 1080×810, обложки 192×144 (иначе первый экран участка тянет лишние
 * сотни килобайт, а страницы разного размера по-разному выглядят в рамке).
 */
const EXPECTED: Record<string, { pages: string[]; cover: string }> = {
  'tutorial-1': { pages: ['tutorial-pie-book-1', 'tutorial-pie-book-2-garden', 'tutorial-pie-book-umbrella', 'tutorial-pie-1'], cover: 'cover-tutorial-pie' },
  'second-1': { pages: ['second-bike-book-1', 'second-bike-book-2', 'second-bike-book-3', 'second-bike-1'], cover: 'cover-second-bike' },
  'third-1': { pages: ['third-greenhouse-book-1', 'third-greenhouse-book-2', 'third-greenhouse-book-3'], cover: 'cover-third-greenhouse' },
  'fourth-1': {
    pages: ['fourth-samovar-book-1', 'fourth-samovar-book-2', 'fourth-samovar-book-3', 'fourth-samovar-book-lantern', 'fourth-samovar-book-4'],
    cover: 'cover-fourth-samovar',
  },
  'fifth-1': { pages: ['fifth-market-book-1', 'fifth-market-book-2', 'fifth-market-book-3'], cover: 'cover-fifth-market' },
  'sixth-1': { pages: ['sixth-campfire-book-1', 'sixth-campfire-book-2', 'sixth-campfire-book-3'], cover: 'cover-sixth-campfire' },
  'ch1-hose': { pages: ['ch1-hose-1', 'ch1-hose-2', 'ch1-hose-3'], cover: 'cover-ch1-hose' },
  'ch1-key': { pages: ['ch1-key-book-1', 'ch1-key-book-2', 'ch1-key-book-3'], cover: 'cover-ch1-key' },
  'ch1-pond': { pages: ['ch1-pond-book-1', 'ch1-pond-book-2', 'ch1-pond-book-3'], cover: 'cover-ch1-pond' },
};

const fileOf = (name: string) => new URL(`../src/story/${name}.webp`, import.meta.url);

/** Размер кадра из заголовка WebP: сжатый с потерями («VP8 ») и расширенный («VP8X»). */
function webpSize(name: string): { width: number; height: number } {
  const b = readFileSync(fileOf(name));
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  throw new Error(`${name}: неожиданный формат WebP «${kind}»`);
}

const nameOf = (href: string) => decodeURIComponent(href.split('/').pop()!.replace(/\.webp.*$/, ''));

describe('картинки книжек: свои страницы, своя обложка, один стандарт', () => {
  it('иллюстрированы ровно девять сюжетных дел', () => {
    expect(cases.filter((c) => c.story).map((c) => c.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('%s: страницы по порядку и своя обложка', (id, expected) => {
    const source = cases.find((c) => c.id === id)!;
    expect(source.story!.map((f) => nameOf(f.image))).toEqual(expected.pages);
    expect(nameOf(source.cover!)).toBe(expected.cover);
  });

  it('обложки и страницы не делят файлы между делами', () => {
    const all = Object.values(EXPECTED).flatMap((e) => [...e.pages, e.cover]);
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(Object.values(EXPECTED).flatMap((e) => e.pages.map((p) => [p] as const)))('страница %s: 1080×810 и не тяжелее 250 КБ', (name) => {
    expect(existsSync(fileOf(name))).toBe(true);
    expect(webpSize(name)).toEqual({ width: 1080, height: 810 });
    expect(statSync(fileOf(name)).size / 1024).toBeLessThanOrEqual(250);
  });

  it.each(Object.values(EXPECTED).map((e) => [e.cover] as const))('обложка %s: 192×144 и не тяжелее 15 КБ', (name) => {
    expect(existsSync(fileOf(name))).toBe(true);
    expect(webpSize(name)).toEqual({ width: 192, height: 144 });
    expect(statSync(fileOf(name)).size / 1024).toBeLessThanOrEqual(15);
  });
});
