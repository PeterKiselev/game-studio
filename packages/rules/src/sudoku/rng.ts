/**
 * Детерминированный генератор случайности. Обычный Math.random() тут
 * запрещён (правило 3 в CLAUDE.md): ежедневный пазл должен получаться
 * ОДИНАКОВЫМ у всех игроков по одной и той же дате, значит вся случайность
 * судоку обязана идти от явного seed, а не от системного времени.
 */

/** FNV-1a: строка -> 32-битное число, стабильно на любой платформе. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — маленький, быстрый, достаточно качественный для генерации пазлов PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
