import { sudoku } from '@studio/rules';

export interface AcademyLesson {
  id: string;
  title: string;
  short: string;
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
  { id: 'only-choice-1', title: 'Единственный кандидат', short: 'Исключи цифры строки, столбца и квадрата.', technique: 'naked-single', seed: 'academy:naked-single:1' },
  { id: 'only-choice-2', title: 'Пересечение ограничений', short: 'Собери три ограничения в одной клетке.', technique: 'naked-single', seed: 'academy:naked-single:2' },
  { id: 'only-choice-3', title: 'Последнее свободное место', short: 'Найди цифру, которой больше некуда встать.', technique: 'naked-single', seed: 'academy:naked-single:3' },
  { id: 'only-choice-4', title: 'Цепочка одиночек', short: 'Один точный ход открывает следующий.', technique: 'naked-single', seed: 'academy:naked-single:4' },
  { id: 'hidden-1', title: 'Скрытая единственная', short: 'У цифры есть только одно место в области.', technique: 'hidden-single', seed: 'academy:hidden-single:28' },
  { id: 'hidden-2', title: 'Скрытая в строке', short: 'Проверь не клетку, а все места одной цифры.', technique: 'hidden-single', seed: 'academy:hidden-single:29' },
  { id: 'hidden-3', title: 'Скрытая в столбце', short: 'Отсеки занятые позиции сверху вниз.', technique: 'hidden-single', seed: 'academy:hidden-single:41' },
  { id: 'hidden-4', title: 'Скрытая в квадрате', short: 'Найди единственную позицию внутри блока 3×3.', technique: 'hidden-single', seed: 'academy:hidden-single:57' },
  { id: 'pair-1', title: 'Голая пара', short: 'Две клетки забирают две цифры у всей области.', technique: 'naked-pair', seed: 'academy:naked-pair:19', difficulty: 'medium' },
  { id: 'pair-2', title: 'Пара в строке', short: 'Исключи две занятые парой цифры из соседних клеток.', technique: 'naked-pair', seed: 'academy:naked-pair:288', difficulty: 'medium' },
  { id: 'pair-3', title: 'Пара в столбце', short: 'Найди одинаковые пары кандидатов сверху вниз.', technique: 'naked-pair', seed: 'academy:naked-pair:322', difficulty: 'medium' },
  { id: 'pair-4', title: 'Пара в квадрате', short: 'Используй пару внутри блока 3×3.', technique: 'naked-pair', seed: 'academy:naked-pair:444', difficulty: 'medium' },
];

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
