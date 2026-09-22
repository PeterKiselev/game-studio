import { GameApp } from '@studio/game-kit';
import { sudoku } from '@studio/rules';
import { el, toast } from '@studio/ui';
import { renderSudokuGrid } from './grid';
import { ACHIEVEMENTS, checkNewAchievements, starsFor } from './achievements';
import { ACADEMY_LESSONS, prepareAcademyLesson } from './academy';
import './theme.css';
import './style.css';

type Difficulty = sudoku.Difficulty;
type Mode = 'daily' | 'practice';

interface DailyResult {
  stars: 1 | 2 | 3;
  mistakes: number;
  hintsUsed: number;
  timeMs: number;
}

interface PracticeStats {
  played: number;
  best?: { stars: 1 | 2 | 3; timeMs: number };
}

/**
 * Только один пазл может быть «в процессе» одновременно — не Record по id,
 * как progress в «Дачных тайнах». Там несколько независимых дел логично
 * держать открытыми параллельно; тут игрок решает один пазл за раз, и это
 * упрощает и сохранение, и интерфейс (не нужен список «незаконченных партий»).
 *
 * givens и solution НЕ хранятся — пересчитываются из seed через
 * generatePuzzle() при восстановлении: генератор детерминирован, значит
 * seed сам по себе полностью описывает пазл, а дублировать 162 числа в
 * сохранении ради этого незачем.
 */
interface ProgressState {
  mode: Mode;
  difficulty: Difficulty;
  dateIso?: string;
  seed: string;
  grid: number[];
  notes: number[][];
  mistakes: number;
  hintsUsed: number;
  elapsedMs: number;
}

interface Save {
  daily: Record<string, DailyResult>;
  streak: number;
  lastDailyDate?: string;
  practice: Record<Difficulty, PracticeStats>;
  progress?: ProgressState;
  achievements: string[];
  purchases: { noAds?: boolean; unlimitedHints?: boolean };
  academy: { completed: string[] };
}

const DEFAULTS: Save = {
  daily: {},
  streak: 0,
  practice: { easy: { played: 0 }, medium: { played: 0 }, hard: { played: 0 } },
  achievements: [],
  purchases: {},
  academy: { completed: [] },
};

const root = document.getElementById('app')!;
let app!: GameApp<Save>;

async function main(): Promise<void> {
  app = await GameApp.boot<Save>({
    gameId: 'sudoku',
    saveVersion: 1,
    defaults: DEFAULTS,
    adPolicy: { firstAdAfterRounds: 2, minSecondsBetween: 180 },
  });

  app.track('app_start');
  showMenu();
  app.ready();
}

void main();

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' };
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function freshPracticeSeed(): string {
  return `practice:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

/** Все сложности, которые игрок уже проходил хотя бы раз (ежедневные и практика вместе). */
function difficultiesSeen(s: Save): Set<Difficulty> {
  const seen = new Set<Difficulty>();
  for (const d of DIFFICULTIES) {
    if (s.practice[d].played > 0) seen.add(d);
  }
  // Сложность дня не хранится прямо в DailyResult — выводится обратно из
  // даты той же чистой функцией, что назначала её при старте партии.
  for (const dateIso of Object.keys(s.daily)) {
    seen.add(sudoku.difficultyForDate(dateIso));
  }
  return seen;
}

// --- экран 1: меню -----------------------------------------------------------

function showMenu(): void {
  const s = app.save.data;
  const today = sudoku.todayIso();
  const dailyResult = s.daily[today];
  const dailyInProgress = !!resumableProgress('daily', sudoku.difficultyForDate(today), today);

  // Прогресс не возобновляется сам по себе после перезагрузки страницы —
  // main() всегда открывает меню, не лезет молча обратно в партию. Значит
  // меню обязано честно показать, что где-то осталась незаконченная партия,
  // а не тихо предложить «начать» то, что на деле продолжит её же
  // (resumableProgress здесь и внутри startPuzzle — одна и та же проверка).
  const dailyTitle = dailyResult
    ? `☀️ Сегодняшнее судоку · ${'⭐'.repeat(dailyResult.stars)}`
    : dailyInProgress
      ? '☀️ Продолжить сегодняшнее судоку'
      : '☀️ Сегодняшнее судоку';

  const dailyCard = el(
    'button',
    { class: 'daily-card', type: 'button', disabled: !!dailyResult },
    el('div', { class: 'title' }, dailyTitle),
    s.streak > 0
      ? el('div', { class: 'streak' }, 'Серия: ', el('b', {}, String(s.streak)), ' дней подряд')
      : el('div', { class: 'streak' }, 'Решайте каждый день, чтобы набрать серию'),
  ) as HTMLButtonElement;
  dailyCard.addEventListener('click', () => void startPuzzle('daily', sudoku.difficultyForDate(today), today));

  const diffList = el('div', { class: 'difficulty-list' });
  for (const d of DIFFICULTIES) {
    const stats = s.practice[d];
    const inProgress = resumableProgress('practice', d);
    const statusLine = inProgress
      ? 'Продолжить'
      : stats.best
        ? `${'⭐'.repeat(stats.best.stars)} · ${formatTime(stats.best.timeMs)}`
        : `${stats.played} партий`;
    const card = el(
      'button',
      { class: 'difficulty-card', type: 'button' },
      el('div', { class: 'name' }, DIFFICULTY_LABEL[d]),
      el('div', { class: 'best' }, statusLine),
    ) as HTMLButtonElement;
    card.addEventListener('click', () => void startPuzzle('practice', d));
    diffList.append(card);
  }

  const achievementsBox = el('div', { class: 'achievements' });
  for (const a of ACHIEVEMENTS) {
    const unlocked = s.achievements.includes(a.id);
    achievementsBox.append(
      el(
        'div',
        { class: `achievement${unlocked ? ' unlocked' : ''}` },
        el('div', { class: 'badge' }, unlocked ? '🏅' : '🔒'),
        el('div', { class: 'label' }, a.title),
      ),
    );
  }

  const screenChildren: HTMLElement[] = [
    el('h1', {}, 'Академия Sudoku'),
    academyCard(s.academy.completed.length),
    dailyCard,
    el('div', { class: 'section-label' }, 'Практика'),
    diffList,
    el('div', { class: 'section-label' }, 'Достижения'),
    achievementsBox,
  ];

  // Кнопка магазина — только если площадка реально умеет платежи (правило 2
  // из CLAUDE.md: скрываем, а не показываем мёртвую кнопку).
  if (app.platform.caps.payments) {
    const shopBtn = el('button', { class: 'btn ghost shop-btn', type: 'button' }, '🛍️ Магазин') as HTMLButtonElement;
    shopBtn.addEventListener('click', () => void showShop());
    screenChildren.push(shopBtn);
  }

  const screen = el('div', { class: 'screen menu' }, ...screenChildren);
  root.replaceChildren(screen);
}

function academyCard(completed: number): HTMLElement {
  const next = ACADEMY_LESSONS[Math.min(completed, ACADEMY_LESSONS.length - 1)];
  const done = completed >= ACADEMY_LESSONS.length;
  const card = el(
    'button',
    { class: 'academy-card', type: 'button' },
    el('div', { class: 'academy-kicker' }, '🎓 КУРС ЛОГИКИ'),
    el('div', { class: 'title' }, done ? 'Курс пройден' : `Урок ${completed + 1}: ${next.title}`),
    el('div', { class: 'academy-progress' }, `${completed} из ${ACADEMY_LESSONS.length} уроков`),
  ) as HTMLButtonElement;
  card.addEventListener('click', showAcademy);
  return card;
}

function showAcademy(): void {
  const completed = new Set(app.save.data.academy.completed);
  const list = el('div', { class: 'lesson-list' });
  ACADEMY_LESSONS.forEach((lesson, index) => {
    const done = completed.has(lesson.id);
    const unlocked = index === 0 || completed.has(ACADEMY_LESSONS[index - 1].id);
    const button = el(
      'button',
      { class: `lesson-card${done ? ' done' : ''}`, type: 'button', disabled: !unlocked },
      el('span', { class: 'lesson-number' }, done ? '✓' : unlocked ? String(index + 1) : '🔒'),
      el('span', { class: 'lesson-copy' }, el('b', {}, lesson.title), el('small', {}, lesson.short)),
    ) as HTMLButtonElement;
    if (unlocked) button.addEventListener('click', () => showLesson(lesson));
    list.append(button);
  });

  const back = el('button', { class: 'btn ghost', type: 'button' }, 'Меню') as HTMLButtonElement;
  back.addEventListener('click', showMenu);
  root.replaceChildren(
    el(
      'div',
      { class: 'screen academy' },
      el('div', { class: 'topbar' }, el('span', { class: 'title' }, 'Академия логики'), el('span', { class: 'spacer' }), back),
      el('div', { class: 'academy-intro' }, el('h2', {}, 'Не угадывай — доказывай'), el('p', {}, 'Каждый урок учит одному приёму на настоящей сетке. Обучение всегда бесплатно.')),
      list,
    ),
  );
}

function showLesson(lesson: (typeof ACADEMY_LESSONS)[number]): void {
  const prepared = prepareAcademyLesson(lesson);
  const grid = [...prepared.grid];
  const notes = Array.from({ length: 81 }, () => [] as number[]);
  let selected: number | null = null;
  let complete = false;

  const gridHandle = renderSudokuGrid(
    prepared.grid,
    () => ({ grid, notes, conflicts: new Set<number>(), hintedIndex: prepared.hint.index, selected }),
    (index) => { selected = index; gridHandle.refresh(); },
  );
  const feedback = el('div', { class: 'lesson-feedback' }, prepared.hint.text);
  const numpad = el('div', { class: 'numpad lesson-numpad' });
  for (let digit = 1; digit <= 9; digit += 1) {
    const button = el('button', { class: 'digit-btn', type: 'button' }, String(digit)) as HTMLButtonElement;
    button.addEventListener('click', () => {
      if (complete) return;
      if (selected !== prepared.hint.index) {
        toast('Сначала выберите подсвеченную клетку');
        return;
      }
      if (digit !== prepared.hint.value) {
        toast('Проверьте объяснение: эта цифра ещё не доказана');
        return;
      }
      complete = true;
      grid[prepared.hint.index] = digit;
      gridHandle.refresh();
      if (!app.save.data.academy.completed.includes(lesson.id)) {
        app.save.data.academy.completed.push(lesson.id);
        app.save.markDirty();
      }
      app.track('academy_lesson_complete', { lesson: lesson.id, technique: lesson.technique });
      const nextIndex = ACADEMY_LESSONS.findIndex((item) => item.id === lesson.id) + 1;
      const next = ACADEMY_LESSONS[nextIndex];
      feedback.replaceChildren(
        el('b', {}, 'Верно. Приём освоен.'),
        el('span', {}, next ? ` Следующий урок: «${next.title}».` : ' Вы прошли базовый курс.'),
      );
      nextButton.hidden = false;
    });
    numpad.append(button);
  }

  const nextIndex = ACADEMY_LESSONS.findIndex((item) => item.id === lesson.id) + 1;
  const nextButton = el('button', { class: 'btn primary', type: 'button' }, nextIndex < ACADEMY_LESSONS.length ? 'Следующий урок' : 'К списку уроков') as HTMLButtonElement;
  nextButton.hidden = true;
  nextButton.addEventListener('click', () => {
    const next = ACADEMY_LESSONS[nextIndex];
    if (next) showLesson(next);
    else showAcademy();
  });
  const back = el('button', { class: 'btn ghost', type: 'button' }, 'К урокам') as HTMLButtonElement;
  back.addEventListener('click', showAcademy);

  root.replaceChildren(
    el(
      'div',
      { class: 'screen academy-lesson' },
      el('div', { class: 'topbar' }, el('span', { class: 'title' }, lesson.title), el('span', { class: 'spacer' }), back),
      el('div', { class: 'lesson-instruction' }, el('span', {}, 'ПРИЁМ'), feedback),
      el('div', { class: 'board-wrap' }, gridHandle.root),
      el('div', { class: 'controls-wrap' }, numpad, nextButton),
    ),
  );
  app.track('academy_lesson_start', { lesson: lesson.id, technique: lesson.technique });
}

// --- экран 2: партия ----------------------------------------------------------

function resumableProgress(mode: Mode, difficulty: Difficulty, dateIso?: string): ProgressState | null {
  const p = app.save.data.progress;
  if (!p || p.mode !== mode) return null;
  if (mode === 'daily' && p.dateIso !== dateIso) return null;
  if (mode === 'practice' && p.difficulty !== difficulty) return null;
  return p;
}

async function startPuzzle(mode: Mode, difficulty: Difficulty, dateIso?: string): Promise<void> {
  app.track('puzzle_start', { mode, difficulty });
  app.startRound();

  const existing = resumableProgress(mode, difficulty, dateIso);
  const seed = existing?.seed ?? (mode === 'daily' ? sudoku.dailySeed(dateIso!) : freshPracticeSeed());

  let puzzle: sudoku.Puzzle;
  try {
    puzzle = sudoku.generatePuzzle(seed, difficulty);
  } catch {
    // Предохранитель генератора сработал — не должно случаться на этих
    // диапазонах сложности, но честная деградация лучше зависшей вкладки.
    toast('Не удалось собрать пазл — попробуйте ещё раз');
    void app.abandonRound();
    showMenu();
    return;
  }

  const grid: number[] = existing ? [...existing.grid] : [...puzzle.givens];
  const notes: number[][] = existing ? existing.notes.map((n) => [...n]) : Array.from({ length: 81 }, () => []);
  let mistakes = existing?.mistakes ?? 0;
  let hintsUsed = existing?.hintsUsed ?? 0;
  const sessionStart = Date.now() - (existing?.elapsedMs ?? 0);

  let selected: number | null = null;
  let notesMode = false;
  let hintedIndex: number | null = null;
  let solved = false;
  // Клик/таймер после ухода игрока с экрана — тот же приём, что в «Дачных
  // тайнах»: без флага отложенный переход на развязку сработал бы поверх
  // того, куда игрок уже успел перейти.
  let left = false;

  function elapsed(): number {
    return Date.now() - sessionStart;
  }

  function persistProgress(): void {
    app.save.data.progress = {
      mode,
      difficulty,
      dateIso,
      seed,
      grid: [...grid],
      notes: notes.map((n) => [...n]),
      mistakes,
      hintsUsed,
      elapsedMs: elapsed(),
    };
    app.save.markDirty();
  }

  const statsBar = el(
    'div',
    { class: 'stats-bar' },
    el('span', { class: 'diff-label' }, DIFFICULTY_LABEL[difficulty]),
    el('span', { class: 'spacer' }),
    el('span', { class: 'mistakes' }, `Ошибки: ${mistakes}`),
    el('span', { class: 'timer' }, formatTime(elapsed())),
  );
  const mistakesLabel = statsBar.querySelector('.mistakes')!;
  const timerLabel = statsBar.querySelector('.timer')!;

  const gridHandle = renderSudokuGrid(
    puzzle.givens,
    () => ({ grid, notes, conflicts: sudoku.findConflicts(grid), hintedIndex, selected }),
    (index) => {
      selected = index;
      gridHandle.refresh();
    },
  );

  const numpad = el('div', { class: 'numpad' });
  for (let digit = 1; digit <= 9; digit += 1) {
    const btn = el('button', { class: 'digit-btn', type: 'button' }, String(digit)) as HTMLButtonElement;
    btn.addEventListener('click', () => enterDigit(digit));
    numpad.append(btn);
  }
  const eraseBtn = el('button', { class: 'digit-btn', type: 'button' }, '⌫') as HTMLButtonElement;
  eraseBtn.addEventListener('click', () => enterDigit(0));
  numpad.append(eraseBtn);

  const notesToggle = el('button', { class: 'tool-btn', type: 'button' }, '✏️ Заметки') as HTMLButtonElement;
  notesToggle.addEventListener('click', () => {
    notesMode = !notesMode;
    notesToggle.classList.toggle('active', notesMode);
  });

  const hintText = el('div', { class: 'hint-text', hidden: true });
  const hintBtn = el('button', { class: 'btn hint-btn', type: 'button' }, '💡 Подсказка') as HTMLButtonElement;
  hintBtn.addEventListener('click', () => void useHint());
  updateHintButtonLabel();

  const controls = el(
    'div',
    { class: 'controls-wrap' },
    numpad,
    el('div', { class: 'hint-bar' }, notesToggle, hintText, hintBtn),
  );

  const screen = el(
    'div',
    { class: 'screen puzzle' },
    el(
      'div',
      { class: 'topbar' },
      el('span', { class: 'title' }, mode === 'daily' ? 'Ежедневное судоку' : 'Практика'),
      el('span', { class: 'spacer' }),
      backButton(),
    ),
    statsBar,
    el('div', { class: 'board-wrap' }, gridHandle.root),
    controls,
  );
  root.replaceChildren(screen);

  const timerInterval = setInterval(() => {
    timerLabel.textContent = formatTime(elapsed());
  }, 1000);

  function stopTimer(): void {
    clearInterval(timerInterval);
  }

  function enterDigit(digit: number): void {
    if (solved || selected === null) return;
    const index = selected;
    if (puzzle.givens[index] !== 0) return; // защита — сетка это уже не даёт кликнуть, но на случай гонки

    if (notesMode && digit !== 0) {
      const cellNotes = notes[index];
      const at = cellNotes.indexOf(digit);
      if (at >= 0) cellNotes.splice(at, 1);
      else cellNotes.push(digit);
      gridHandle.refresh();
      persistProgress();
      return;
    }

    const wasEmpty = grid[index] === 0;
    grid[index] = digit;
    if (digit !== 0) notes[index] = []; // введённое число отменяет заметки в той же клетке — держать оба смысла незачем

    if (digit !== 0 && wasEmpty) app.track('puzzle_first_mark', { mode, difficulty });

    if (digit !== 0 && digit !== puzzle.solution[index]) {
      mistakes += 1;
      mistakesLabel.textContent = `Ошибки: ${mistakes}`;
      app.track('puzzle_mistake', { mode, difficulty });
    }

    gridHandle.refresh();
    persistProgress();
    checkSolved();
  }

  function updateHintButtonLabel(): void {
    if (hintsUsed === 0) {
      hintBtn.textContent = '💡 Подсказка';
    } else if (app.save.data.purchases.unlimitedHints) {
      hintBtn.textContent = '💡 Ещё подсказка';
    } else if (app.ads.rewardedAvailable) {
      hintBtn.textContent = '💡 Ещё подсказка за рекламу';
    } else {
      hintBtn.textContent = '💡 Ещё подсказка';
    }
  }

  async function useHint(): Promise<void> {
    if (solved) return; // экран уже сменился на развязку (переход идёт с задержкой в checkSolved())
    const hint = sudoku.nextHint(sudoku.gridForHint(grid, puzzle.solution));
    if (!hint) {
      toast('Больше подсказок нет — дальше только своим умом');
      return;
    }

    const needsAd = hintsUsed > 0 && app.ads.rewardedAvailable && !app.save.data.purchases.unlimitedHints;
    if (needsAd) {
      const granted = await app.offerReward('hint');
      if (!granted) {
        toast('Реклама не загрузилась — попробуйте ещё раз');
        return;
      }
    }

    app.track('puzzle_hint', { mode, difficulty, technique: hint.technique, viaAd: needsAd });
    hintsUsed += 1;
    grid[hint.index] = hint.value;
    notes[hint.index] = [];
    hintedIndex = hint.index;
    hintText.textContent = hint.text;
    hintText.hidden = false;
    updateHintButtonLabel();
    gridHandle.refresh();
    persistProgress();
    checkSolved();
  }

  function checkSolved(): void {
    for (let i = 0; i < 81; i += 1) {
      if (grid[i] !== puzzle.solution[i]) return;
    }
    solved = true;
    stopTimer();
    // Пока длится короткая пауза перед развязкой, нельзя уйти в меню и
    // отменить finishPuzzle() уже после очистки сохранённого прогресса.
    screen.querySelector<HTMLButtonElement>('.topbar .btn')!.disabled = true;
    app.save.data.progress = undefined; // пазл решён — возобновлять нечего
    app.save.markDirty();
    const timeMs = elapsed();
    app.track('puzzle_complete', { mode, difficulty, mistakes, hintsUsed, timeMs });
    setTimeout(() => {
      if (left) return;
      void finishPuzzle(mode, difficulty, dateIso, mistakes, hintsUsed, timeMs);
    }, 400);
  }

  function backButton(): HTMLButtonElement {
    const btn = el('button', { class: 'btn ghost', type: 'button' }, 'Меню') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      left = true;
      stopTimer();
      app.track('puzzle_exit', { mode, difficulty, solved });
      void (solved ? app.endRound() : app.abandonRound());
      showMenu();
    });
    return btn;
  }
}

// --- экран 3: развязка ---------------------------------------------------------

async function finishPuzzle(
  mode: Mode,
  difficulty: Difficulty,
  dateIso: string | undefined,
  mistakes: number,
  hintsUsed: number,
  timeMs: number,
): Promise<void> {
  const s = app.save.data;
  const stars = starsFor(mistakes, hintsUsed);

  let newStreak = s.streak;
  if (mode === 'daily' && dateIso) {
    s.daily[dateIso] = { stars, mistakes, hintsUsed, timeMs };
    newStreak = isConsecutiveDay(s.lastDailyDate, dateIso) ? s.streak + 1 : 1;
    s.streak = newStreak;
    s.lastDailyDate = dateIso;
  } else {
    const stats = s.practice[difficulty];
    stats.played += 1;
    if (!stats.best || stars > stats.best.stars || (stars === stats.best.stars && timeMs < stats.best.timeMs)) {
      stats.best = { stars, timeMs };
    }
  }

  const puzzlesCompletedCount =
    Object.keys(s.daily).length + DIFFICULTIES.reduce((sum, d) => sum + s.practice[d].played, 0);
  const flawlessCount =
    Object.values(s.daily).filter((r) => r.stars === 3).length +
    // Лучший результат по сложности учитывается как один «идеальный», если он идеален —
    // приближение: точное число идеальных партий в практике по отдельности не хранится,
    // чтобы не раздувать сохранение историей каждой партии.
    DIFFICULTIES.filter((d) => s.practice[d].best?.stars === 3).length;

  const newAchievements = checkNewAchievements(new Set(s.achievements), {
    mistakes,
    hintsUsed,
    puzzlesCompletedCount,
    streak: mode === 'daily' ? newStreak : 0,
    flawlessCount,
    difficultiesSeen: difficultiesSeen(s),
  });
  s.achievements.push(...newAchievements);
  app.save.markDirty();

  await app.endRound();

  const children: HTMLElement[] = [
    el('div', { class: 'topbar' }, el('span', { class: 'title' }, 'Пазл решён')),
    el(
      'div',
      { class: 'scene' },
      el('div', { class: 'stars-big' }, '⭐'.repeat(stars)),
      el('div', { class: 'time' }, `Время: ${formatTime(timeMs)} · Ошибки: ${mistakes} · Подсказки: ${hintsUsed}`),
    ),
  ];

  if (mode === 'daily') {
    children.push(el('div', { class: 'reward' }, `Серия: ${newStreak} ${newStreak === 1 ? 'день' : 'дней'} подряд`));
  }
  for (const id of newAchievements) {
    const a = ACHIEVEMENTS.find((x) => x.id === id)!;
    children.push(el('div', { class: 'reward achievement-unlocked' }, `🏅 Новое достижение: «${a.title}»`));
  }

  children.push(continueButton());

  const screen = el('div', { class: 'screen reveal' }, ...children);
  root.replaceChildren(screen);

  // Между партиями, не посреди решения — та же точка, что разрешает политика
  // рекламы. Купленное «Без рекламы» отменяет именно её; rewarded-подсказки
  // остаются добровольными и отдельно выключаются purchases.unlimitedHints.
  if (!s.purchases.noAds) await app.ads.interstitial();
}

function isConsecutiveDay(previous: string | undefined, current: string): boolean {
  if (!previous) return false;
  const prevDate = new Date(`${previous}T00:00:00Z`);
  const currDate = new Date(`${current}T00:00:00Z`);
  const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / 86_400_000);
  return diffDays === 1;
}

function continueButton(): HTMLElement {
  const wrap = el('div', { class: 'controls' });
  const btn = el('button', { class: 'btn primary', type: 'button' }, 'В меню') as HTMLButtonElement;
  btn.addEventListener('click', () => {
    app.track('app_exit_to_menu');
    showMenu();
  });
  wrap.append(btn);
  return wrap;
}

// --- магазин: разовые покупки -------------------------------------------------

const SKU_NO_ADS = 'sudoku_no_ads';
const SKU_UNLIMITED_HINTS = 'sudoku_unlimited_hints';

interface ShopItem {
  sku: string;
  title: string;
  description: string;
  owned: (s: Save) => boolean;
  apply: (s: Save) => void;
}

const SHOP_ITEMS: ShopItem[] = [
  {
    sku: SKU_NO_ADS,
    title: 'Без рекламы',
    description: 'Убирает рекламу между партиями навсегда. Подсказки за рекламу остаются по желанию.',
    owned: (s) => !!s.purchases.noAds,
    apply: (s) => {
      s.purchases.noAds = true;
    },
  },
  {
    sku: SKU_UNLIMITED_HINTS,
    title: 'Безлимитные подсказки',
    description: 'Все подсказки, кроме первой, становятся бесплатными — без рекламы.',
    owned: (s) => !!s.purchases.unlimitedHints,
    apply: (s) => {
      s.purchases.unlimitedHints = true;
    },
  },
];

/** Тот же паттерн, что showShop() в «Дачных тайнах»: свой экран, не dialog()
 * из @studio/ui — нескольким независимым кнопкам «Купить» на одном экране
 * dialog() не подходит по форме, переиспользуются только его CSS-классы. */
async function showShop(): Promise<void> {
  const s = app.save.data;
  const box = el('div', { class: 'dialog shop' }, el('h2', {}, '🛍️ Магазин'));

  for (const item of SHOP_ITEMS) {
    const owned = item.owned(s);
    const btn = el(
      'button',
      { class: `btn ${owned ? 'ghost' : 'primary'}`, type: 'button', disabled: owned },
      owned ? 'Куплено' : 'Купить',
    ) as HTMLButtonElement;
    if (!owned) btn.addEventListener('click', () => void buy(item, btn));

    box.append(
      el(
        'div',
        { class: 'shop-item' },
        el('div', { class: 'shop-item-text' }, el('b', {}, item.title), el('span', {}, item.description)),
        btn,
      ),
    );
  }

  const closeBtn = el('button', { class: 'btn ghost', type: 'button' }, 'Закрыть') as HTMLButtonElement;
  box.append(el('div', { class: 'actions' }, closeBtn));

  const overlay = el('div', { class: 'overlay' }, box);
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    showMenu();
  });
  document.body.append(overlay);
}

async function buy(item: ShopItem, btn: HTMLButtonElement): Promise<void> {
  if (!app.platform.payments) return; // защита для TypeScript — кнопка «Магазин» уже проверила caps.payments
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const result = await app.platform.payments.buy(item.sku);
    if (!result.ok) throw new Error('not ok');
    item.apply(app.save.data);
    app.save.markDirty();
    app.track('purchase', { sku: item.sku });
    btn.textContent = 'Куплено';
  } catch {
    btn.textContent = original;
    btn.disabled = false;
    toast('Покупка не завершилась — попробуйте ещё раз');
  }
}
