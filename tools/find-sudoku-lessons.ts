import { generatePuzzle, nextHint } from '../packages/rules/src/sudoku/index';
import type { Difficulty, Grid, HintTechnique } from '../packages/rules/src/sudoku/index';

function firstStateFor(seed: string, difficulty: Difficulty, technique: HintTechnique): Grid | null {
  const puzzle = generatePuzzle(seed, difficulty);
  const grid = [...puzzle.givens];
  for (let guard = 0; guard < 81; guard += 1) {
    const hint = nextHint(grid);
    if (!hint) return null;
    if (hint.technique === technique) return grid;
    grid[hint.index] = hint.value;
  }
  return null;
}

for (const technique of ['naked-single', 'hidden-single'] as const) {
  let found = 0;
  for (let i = 1; i <= 500 && found < 4; i += 1) {
    const seed = `academy:${technique}:${i}`;
    if (!firstStateFor(seed, 'easy', technique)) continue;
    console.log(`${technique}\t${seed}`);
    found += 1;
  }
}
