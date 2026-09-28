import type { sudoku } from '@studio/rules';

/**
 * Словарь игры. Два языка, один типизированный контракт: если в русском
 * появилась строка, а в английском нет, сборка не пройдёт — именно поэтому
 * словарь описан интерфейсом, а не свободным объектом.
 *
 * Правило, которое легко нарушить и трудно потом найти: **в сохранение
 * не попадает ни одна строка отсюда**. Идентификаторы уроков, достижений,
 * режимов и приёмов остаются прежними (`only-choice-1`, `naked-pair`,
 * `first_puzzle`), а отображаемый текст берётся по этим id. Иначе игрок,
 * переключивший язык, потерял бы прогресс.
 */

export type Locale = 'ru' | 'en';

/** Русский требует три формы, английский две — поэтому число отдаёт функция, а не шаблон. */
type Plural = (count: number) => string;

export interface Strings {
  appTitle: string;

  common: {
    menu: string;
    close: string;
    toMenu: string;
  };

  menu: {
    academyKicker: string;
    academyDone: string;
    academyLessonTitle: (index: number, title: string) => string;
    academyProgress: (done: number, total: number) => string;
    allLessons: string;
    dailyFresh: string;
    dailyResume: string;
    dailyDone: (stars: number) => string;
    streak: (days: number) => string;
    streakEmpty: string;
    practice: string;
    achievements: string;
    shop: string;
    resume: string;
    playedGames: Plural;
  };

  academy: {
    screenTitle: string;
    introTitle: string;
    introText: string;
    backToLessons: string;
    nextLesson: string;
    toLessonList: string;
    techniqueLabel: string;
    pickHighlighted: string;
    notProven: string;
    correct: string;
    nextIs: (title: string) => string;
    courseFinished: string;
  };

  puzzle: {
    daily: string;
    practice: string;
    mistakes: (count: number) => string;
    notes: string;
    hint: string;
    hintMore: string;
    hintMoreForAd: string;
    noMoreHints: string;
    adFailed: string;
    generatorFailed: string;
  };

  reveal: {
    title: string;
    summary: (time: string, mistakes: number, hints: number) => string;
    streak: (days: number) => string;
    profileTitle: string;
    profileFull: string;
    profilePartial: string;
    stepsInTask: Plural;
    notNeeded: string;
    tasksWithTechnique: (count: number) => string;
    achievementUnlocked: (title: string) => string;
  };

  shop: {
    title: string;
    buy: string;
    owned: string;
    failed: string;
    items: Record<string, { title: string; description: string }>;
  };

  grid: {
    cellLabel: (row: number, col: number) => string;
  };

  techniques: Record<sudoku.HintTechnique, string>;

  /** Формулировка разбора хода. Данные приходят из правил, язык живёт здесь. */
  hintText: (hint: sudoku.Hint) => string;

  lessons: Record<string, { title: string; short: string }>;
  achievements: Record<string, { title: string; description: string }>;
  difficulties: Record<sudoku.Difficulty, string>;
}

function cell(row: number, col: number, locale: Locale): string {
  return locale === 'ru' ? `строка ${row}, столбец ${col}` : `row ${row}, column ${col}`;
}

function cellOf(index: number, locale: Locale): string {
  return cell(Math.floor(index / 9) + 1, (index % 9) + 1, locale);
}

/** Русская тройка форм: 1 шаг, 2 шага, 5 шагов; 11-14 всегда последняя форма. */
function ruPlural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/**
 * «В этой строке» / «В этом столбце» — род в русском разный, поэтому
 * храним фразу целиком, а не одно существительное. Формы сразу с
 * заглавной: обе начинают предложение подсказки.
 */
const RU_UNIT: Record<'row' | 'col' | 'box', string> = {
  row: 'В этой строке',
  col: 'В этом столбце',
  box: 'В этом квадрате',
};

const EN_UNIT: Record<'row' | 'col' | 'box', string> = {
  row: 'In this row',
  col: 'In this column',
  box: 'In this box',
};

const RU: Strings = {
  appTitle: 'Академия Sudoku',

  common: { menu: 'Меню', close: 'Закрыть', toMenu: 'В меню' },

  menu: {
    academyKicker: '🎓 КУРС ЛОГИКИ',
    academyDone: 'Курс пройден — повторить урок',
    academyLessonTitle: (index, title) => `Урок ${index}: ${title}`,
    academyProgress: (done, total) => `${done} из ${total} уроков`,
    allLessons: 'Все уроки',
    dailyFresh: '☀️ Сегодняшнее судоку',
    dailyResume: '☀️ Продолжить сегодняшнее судоку',
    dailyDone: (stars) => `☀️ Сегодняшнее судоку · ${'⭐'.repeat(stars)}`,
    streak: (days) => `Серия: ${days} ${ruPlural(days, 'день', 'дня', 'дней')} подряд`,
    streakEmpty: 'Решайте каждый день, чтобы набрать серию',
    practice: 'Практика',
    achievements: 'Достижения',
    shop: '🛍️ Магазин',
    resume: 'Продолжить',
    playedGames: (count) => `${count} ${ruPlural(count, 'партия', 'партии', 'партий')}`,
  },

  academy: {
    screenTitle: 'Академия логики',
    introTitle: 'Не угадывай — доказывай',
    introText: 'Каждый урок учит одному приёму на настоящей сетке. Обучение всегда бесплатно.',
    backToLessons: 'К урокам',
    nextLesson: 'Следующий урок',
    toLessonList: 'К списку уроков',
    techniqueLabel: 'ПРИЁМ',
    pickHighlighted: 'Сначала выберите подсвеченную клетку',
    notProven: 'Проверьте объяснение: эта цифра ещё не доказана',
    correct: 'Верно. Приём освоен.',
    nextIs: (title) => ` Следующий урок: «${title}».`,
    courseFinished: ' Вы прошли базовый курс.',
  },

  puzzle: {
    daily: 'Ежедневное судоку',
    practice: 'Практика',
    mistakes: (count) => `Ошибки: ${count}`,
    notes: '✏️ Заметки',
    hint: '💡 Подсказка',
    hintMore: '💡 Ещё подсказка',
    hintMoreForAd: '💡 Ещё подсказка за рекламу',
    noMoreHints: 'Больше подсказок нет — дальше только своим умом',
    adFailed: 'Реклама не загрузилась — попробуйте ещё раз',
    generatorFailed: 'Не удалось собрать пазл — попробуйте ещё раз',
  },

  reveal: {
    title: 'Пазл решён',
    summary: (time, mistakes, hints) => `Время: ${time} · Ошибки: ${mistakes} · Подсказки: ${hints}`,
    streak: (days) => `Серия: ${days} ${ruPlural(days, 'день', 'дня', 'дней')} подряд`,
    profileTitle: 'Логический профиль задачи',
    profileFull: 'Задача полностью объясняется изучаемыми приёмами.',
    profilePartial: 'Показаны приёмы из объяснимой части решения.',
    stepsInTask: (count) =>
      `${count} ${ruPlural(count, 'логический шаг', 'логических шага', 'логических шагов')} в этой задаче`,
    notNeeded: 'В этой задаче не понадобился',
    tasksWithTechnique: (count) => `Задач с приёмом: ${count}`,
    achievementUnlocked: (title) => `🏅 Новое достижение: «${title}»`,
  },

  shop: {
    title: '🛍️ Магазин',
    buy: 'Купить',
    owned: 'Куплено',
    failed: 'Покупка не завершилась — попробуйте ещё раз',
    items: {
      sudoku_no_ads: {
        title: 'Без рекламы',
        description: 'Убирает рекламу между партиями навсегда. Подсказки за рекламу остаются по желанию.',
      },
      sudoku_unlimited_hints: {
        title: 'Безлимитные подсказки',
        description: 'Все подсказки, кроме первой, становятся бесплатными — без рекламы.',
      },
    },
  },

  grid: { cellLabel: (row, col) => cell(row, col, 'ru') },

  techniques: {
    'naked-single': 'Единственный кандидат',
    'hidden-single': 'Скрытая единственная',
    'naked-pair': 'Голая пара',
  },

  hintText: (hint) => {
    switch (hint.technique) {
      case 'naked-single':
        return (
          `В клетке (${cellOf(hint.index, 'ru')}) может стоять только ${hint.value} — ` +
          'все остальные цифры уже заняты в этой строке, столбце или квадрате.'
        );
      case 'hidden-single':
        return `${RU_UNIT[hint.unit]} цифра ${hint.value} может стоять только в клетке (${cellOf(hint.index, 'ru')}).`;
      case 'naked-pair':
        return (
          `Клетки (${cellOf(hint.pairCells[0], 'ru')}) и (${cellOf(hint.pairCells[1], 'ru')}) ` +
          `образуют пару ${hint.pairDigits[0]}/${hint.pairDigits[1]}. Эти цифры заняты парой, ` +
          `поэтому в клетке (${cellOf(hint.index, 'ru')}) остаётся только ${hint.value}.`
        );
    }
  },

  lessons: {
    'only-choice-1': { title: 'Единственный кандидат', short: 'Исключи цифры строки, столбца и квадрата.' },
    'only-choice-2': { title: 'Пересечение ограничений', short: 'Собери три ограничения в одной клетке.' },
    'only-choice-3': { title: 'Последнее свободное место', short: 'Найди цифру, которой больше некуда встать.' },
    'only-choice-4': { title: 'Цепочка одиночек', short: 'Один точный ход открывает следующий.' },
    'hidden-1': { title: 'Скрытая единственная', short: 'У цифры есть только одно место в области.' },
    'hidden-2': { title: 'Скрытая в строке', short: 'Проверь не клетку, а все места одной цифры.' },
    'hidden-3': { title: 'Скрытая в столбце', short: 'Отсеки занятые позиции сверху вниз.' },
    'hidden-4': { title: 'Скрытая в квадрате', short: 'Найди единственную позицию внутри блока 3×3.' },
    'pair-1': { title: 'Голая пара', short: 'Две клетки забирают две цифры у всей области.' },
    'pair-2': { title: 'Пара в строке', short: 'Исключи две занятые парой цифры из соседних клеток.' },
    'pair-3': { title: 'Пара в столбце', short: 'Найди одинаковые пары кандидатов сверху вниз.' },
    'pair-4': { title: 'Пара в квадрате', short: 'Используй пару внутри блока 3×3.' },
  },

  achievements: {
    first_puzzle: { title: 'Первое судоку', description: 'Решили свой первый пазл.' },
    flawless: { title: 'Без единой ошибки', description: 'Решили пазл без ошибок и без подсказок.' },
    three_flawless: {
      title: 'Твёрдая рука',
      description: 'Решили три пазла без ошибок и подсказок (не обязательно подряд).',
    },
    streak_7: { title: 'Неделя подряд', description: 'Решали ежедневное судоку семь дней подряд.' },
    all_difficulties: {
      title: 'Все три уровня',
      description: 'Решили хотя бы один пазл каждой сложности — лёгкой, средней и сложной.',
    },
    comeback: { title: 'Не с первой попытки', description: 'Решили пазл после того, как сами ошиблись хотя бы раз.' },
  },

  difficulties: { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' },
};

const EN: Strings = {
  appTitle: 'Sudoku Academy',

  common: { menu: 'Menu', close: 'Close', toMenu: 'To menu' },

  menu: {
    academyKicker: '🎓 LOGIC COURSE',
    academyDone: 'Course complete — replay a lesson',
    academyLessonTitle: (index, title) => `Lesson ${index}: ${title}`,
    academyProgress: (done, total) => `${done} of ${total} lessons`,
    allLessons: 'All lessons',
    dailyFresh: '☀️ Daily sudoku',
    dailyResume: '☀️ Resume daily sudoku',
    dailyDone: (stars) => `☀️ Daily sudoku · ${'⭐'.repeat(stars)}`,
    streak: (days) => `Streak: ${days} ${days === 1 ? 'day' : 'days'} in a row`,
    streakEmpty: 'Play every day to build a streak',
    practice: 'Practice',
    achievements: 'Achievements',
    shop: '🛍️ Shop',
    resume: 'Resume',
    playedGames: (count) => `${count} ${count === 1 ? 'game' : 'games'}`,
  },

  academy: {
    screenTitle: 'Logic academy',
    introTitle: 'Never guess — prove it',
    introText: 'Every lesson teaches one technique on a real grid. The course is always free.',
    backToLessons: 'Lessons',
    nextLesson: 'Next lesson',
    toLessonList: 'Back to lessons',
    techniqueLabel: 'TECHNIQUE',
    pickHighlighted: 'First select the highlighted cell',
    notProven: 'Check the explanation: this digit is not proven yet',
    correct: 'Correct. Technique learned.',
    nextIs: (title) => ` Next lesson: “${title}”.`,
    courseFinished: ' You have finished the basic course.',
  },

  puzzle: {
    daily: 'Daily sudoku',
    practice: 'Practice',
    mistakes: (count) => `Mistakes: ${count}`,
    notes: '✏️ Notes',
    hint: '💡 Hint',
    hintMore: '💡 One more hint',
    hintMoreForAd: '💡 One more hint for an ad',
    noMoreHints: 'No more hints — the rest is up to you',
    adFailed: 'The ad did not load — please try again',
    generatorFailed: 'Could not build a puzzle — please try again',
  },

  reveal: {
    title: 'Puzzle solved',
    summary: (time, mistakes, hints) => `Time: ${time} · Mistakes: ${mistakes} · Hints: ${hints}`,
    streak: (days) => `Streak: ${days} ${days === 1 ? 'day' : 'days'} in a row`,
    profileTitle: 'Logic profile of this puzzle',
    profileFull: 'This puzzle is fully explained by the techniques you are learning.',
    profilePartial: 'These are the techniques from the explainable part of the solution.',
    stepsInTask: (count) => `${count} logic ${count === 1 ? 'step' : 'steps'} in this puzzle`,
    notNeeded: 'Not needed in this puzzle',
    tasksWithTechnique: (count) => `Puzzles using it: ${count}`,
    achievementUnlocked: (title) => `🏅 New achievement: “${title}”`,
  },

  shop: {
    title: '🛍️ Shop',
    buy: 'Buy',
    owned: 'Purchased',
    failed: 'The purchase did not go through — please try again',
    items: {
      sudoku_no_ads: {
        title: 'No ads',
        description: 'Removes ads between puzzles forever. Optional hint ads stay available if you want them.',
      },
      sudoku_unlimited_hints: {
        title: 'Unlimited hints',
        description: 'Every hint after the first one becomes free — no ads.',
      },
    },
  },

  grid: { cellLabel: (row, col) => cell(row, col, 'en') },

  techniques: {
    'naked-single': 'Naked single',
    'hidden-single': 'Hidden single',
    'naked-pair': 'Naked pair',
  },

  hintText: (hint) => {
    switch (hint.technique) {
      case 'naked-single':
        return (
          `Cell (${cellOf(hint.index, 'en')}) can only be ${hint.value} — ` +
          'every other digit is already used in its row, column or box.'
        );
      case 'hidden-single':
        return `${EN_UNIT[hint.unit]}, digit ${hint.value} fits only in cell (${cellOf(hint.index, 'en')}).`;
      case 'naked-pair':
        return (
          `Cells (${cellOf(hint.pairCells[0], 'en')}) and (${cellOf(hint.pairCells[1], 'en')}) ` +
          `form a ${hint.pairDigits[0]}/${hint.pairDigits[1]} pair. Those digits are taken by the pair, ` +
          `so cell (${cellOf(hint.index, 'en')}) can only be ${hint.value}.`
        );
    }
  },

  lessons: {
    'only-choice-1': { title: 'The only candidate', short: 'Rule out the digits of the row, column and box.' },
    'only-choice-2': { title: 'Crossing constraints', short: 'Bring three constraints together in one cell.' },
    'only-choice-3': { title: 'The last free spot', short: 'Find the digit that has nowhere else to go.' },
    'only-choice-4': { title: 'A chain of singles', short: 'One exact move opens up the next one.' },
    'hidden-1': { title: 'Hidden single', short: 'A digit has only one place left in the area.' },
    'hidden-2': { title: 'Hidden in a row', short: 'Check every place of one digit, not one cell.' },
    'hidden-3': { title: 'Hidden in a column', short: 'Cut off the taken positions top to bottom.' },
    'hidden-4': { title: 'Hidden in a box', short: 'Find the only position inside a 3×3 block.' },
    'pair-1': { title: 'Naked pair', short: 'Two cells claim two digits from the whole area.' },
    'pair-2': { title: 'Pair in a row', short: 'Rule the two claimed digits out of the neighbouring cells.' },
    'pair-3': { title: 'Pair in a column', short: 'Spot identical candidate pairs top to bottom.' },
    'pair-4': { title: 'Pair in a box', short: 'Use a pair inside a 3×3 block.' },
  },

  achievements: {
    first_puzzle: { title: 'First sudoku', description: 'You solved your first puzzle.' },
    flawless: { title: 'Flawless', description: 'You solved a puzzle with no mistakes and no hints.' },
    three_flawless: {
      title: 'Steady hand',
      description: 'You solved three puzzles with no mistakes and no hints (not necessarily in a row).',
    },
    streak_7: { title: 'Seven days', description: 'You played the daily sudoku seven days in a row.' },
    all_difficulties: {
      title: 'All three levels',
      description: 'You solved at least one puzzle on every difficulty — easy, medium and hard.',
    },
    comeback: { title: 'Not on the first try', description: 'You solved a puzzle after making a mistake yourself.' },
  },

  difficulties: { easy: 'Easy', medium: 'Medium', hard: 'Hard' },
};

const DICTS: Record<Locale, Strings> = { ru: RU, en: EN };

/**
 * Выбор языка. `?lang=` имеет приоритет над площадкой намеренно: без него
 * невозможно воспроизводимо прогнать браузерный сценарий на конкретной
 * локали, а тест, который зависит от настроек машины, — не тест.
 * Всё, что не начинается на `ru`, считаем английским: для витрин
 * CrazyGames/Poki английский и есть язык по умолчанию.
 */
export function detectLocale(platformLocale: string, search = globalThis.location?.search ?? ''): Locale {
  const requested = new URLSearchParams(search).get('lang');
  if (requested === 'ru' || requested === 'en') return requested;
  return platformLocale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

let current: Locale = 'ru';

export function setLocale(locale: Locale): void {
  current = locale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.title = DICTS[locale].appTitle;
  }
}

export function locale(): Locale {
  return current;
}

/** Текущий словарь. Вызов, а не константа: язык выбирается уже после загрузки модуля. */
export function t(): Strings {
  return DICTS[current];
}
