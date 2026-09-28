import { sudoku } from '@studio/rules';

/**
 * Урок хранит только логику и стабильный id. Название и подзаголовок
 * живут в `i18n.ts` по этому же id: id попадает в сохранение
 * (`save.academy.completed`), а переведённый текст — никогда, иначе
 * смена языка стирала бы пройденные уроки.
 */
export interface AcademyLesson {
  id: string;
  technique: sudoku.HintTechnique;
  seed: string;
  difficulty?: sudoku.Difficulty;
}

export interface PreparedLesson {
  lesson: AcademyLesson;
  grid: sudoku.Grid;
  solution: sudoku.Grid;
  hint: sudoku.Hint;
}

export const ACADEMY_LESSONS: readonly AcademyLesson[] = [
  { id: 'only-choice-1', technique: 'naked-single', seed: 'academy:naked-single:1' },
  { id: 'only-choice-2', technique: 'naked-single', seed: 'academy:naked-single:2' },
  { id: 'only-choice-3', technique: 'naked-single', seed: 'academy:naked-single:3' },
  { id: 'only-choice-4', technique: 'naked-single', seed: 'academy:naked-single:4' },
  { id: 'hidden-1', technique: 'hidden-single', seed: 'academy:hidden-single:28' },
  { id: 'hidden-2', technique: 'hidden-single', seed: 'academy:hidden-single:29' },
  { id: 'hidden-3', technique: 'hidden-single', seed: 'academy:hidden-single:41' },
  { id: 'hidden-4', technique: 'hidden-single', seed: 'academy:hidden-single:57' },
  { id: 'pair-1', technique: 'naked-pair', seed: 'academy:naked-pair:19', difficulty: 'medium' },
  { id: 'pair-2', technique: 'naked-pair', seed: 'academy:naked-pair:288', difficulty: 'medium' },
  { id: 'pair-3', technique: 'naked-pair', seed: 'academy:naked-pair:322', difficulty: 'medium' },
  { id: 'pair-4', technique: 'naked-pair', seed: 'academy:naked-pair:444', difficulty: 'medium' },
];

/** Следующий непройденный урок — или первый, если пройдено всё (курс можно повторять). */
export function nextLesson(completed: readonly string[]): AcademyLesson {
  const done = new Set(completed);
  return ACADEMY_LESSONS.find((lesson) => !done.has(lesson.id)) ?? ACADEMY_LESSONS[0];
}

/** Подготавливает ровно тот момент решения, где нужен приём урока. */
export function prepareAcademyLesson(lesson: AcademyLesson): PreparedLesson {
  const puzzle = sudoku.generatePuzzle(lesson.seed, lesson.difficulty ?? 'easy');
  const grid = [...puzzle.givens];
  for (let guard = 0; guard < 81; guard += 1) {
    const hint = sudoku.nextHint(grid);
    if (!hint) break;
    if (hint.technique === lesson.technique) {
      return { lesson, grid, solution: puzzle.solution, hint };
    }
    grid[hint.index] = hint.value;
  }
  throw new Error(`Урок ${lesson.id} не содержит приём ${lesson.technique}`);
}
