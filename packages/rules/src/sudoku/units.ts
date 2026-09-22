/** Все 27 областей судоку (9 строк + 9 столбцов + 9 квадратов) как списки индексов 0..80. */
export function buildUnits(): number[][] {
  const units: number[][] = [];
  for (let r = 0; r < 9; r += 1) {
    units.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  }
  for (let c = 0; c < 9; c += 1) {
    units.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  }
  for (let br = 0; br < 3; br += 1) {
    for (let bc = 0; bc < 3; bc += 1) {
      const box: number[] = [];
      for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 3; c += 1) box.push((br * 3 + r) * 9 + (bc * 3 + c));
      }
      units.push(box);
    }
  }
  return units;
}

export const UNITS: readonly number[][] = buildUnits();
