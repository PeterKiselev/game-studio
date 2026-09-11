import { GameApp } from '@studio/game-kit';
import { markKey, nextHint, uniqueSolution } from '@studio/rules';
import type { Case, PlayerMarks, Ref, Solution } from '@studio/rules';
import { dialog, el, toast } from '@studio/ui';
import { renderPairGrid } from './grid';
import { cases, tutorialCase } from './cases';
import './theme.css';
import './style.css';

interface Save {
  casesCompleted: string[];
  plotStage: number;
  /**
   * Незаконченный прогресс по каждому делу отдельно, по caseId. Раньше
   * это было одно поле inProgress на всё сохранение сразу — работало,
   * пока в игре было одно дело. Как только их стало три, переключение
   * между незаконченными делами тихо стирало прогресс: открыл третье,
   * вернулся во второе — там пусто, потому что inProgress успел
   * перезаписаться. Теперь у каждого дела свой ключ, и они не мешают
   * друг другу.
   */
  progress: Record<string, { marks: PlayerMarks; hintsUsed: number }>;
  /** Обучение цели и жесту ✓/✕ показано один раз, не перед каждым делом. */
  onboardingSeen?: boolean;
}

interface SaveV1 {
  casesCompleted: string[];
  plotStage: number;
  inProgress?: { caseId: string; marks: PlayerMarks; hintsUsed: number };
  onboardingSeen?: boolean;
}

const DEFAULTS: Save = { casesCompleted: [], plotStage: 0, progress: {} };

const root = document.getElementById('app')!;
let app!: GameApp<Save>;

async function main(): Promise<void> {
  app = await GameApp.boot<Save>({
    gameId: 'dachnye-tainy',
    saveVersion: 2,
    defaults: DEFAULTS,
    adPolicy: { firstAdAfterRounds: 1, minSecondsBetween: 180 },
    // v1 хранил ровно одно незаконченное дело в inProgress — переносим его
    // в progress[caseId] под тем же ключом, остальное копируем как есть.
    migrate: (old, fromVersion) => {
      if (fromVersion !== 1) return null;
      const legacy = old as Partial<SaveV1>;
      const progress: Save['progress'] = {};
      if (legacy.inProgress) {
        progress[legacy.inProgress.caseId] = {
          marks: legacy.inProgress.marks,
          hintsUsed: legacy.inProgress.hintsUsed,
        };
      }
      return {
        casesCompleted: legacy.casesCompleted ?? [],
        plotStage: legacy.plotStage ?? 0,
        progress,
        onboardingSeen: legacy.onboardingSeen,
      };
    },
  });

  app.track('app_start');
  showPlot();
  app.ready();
}

void main();

// --- экран 1: участок -------------------------------------------------------

function showPlot(): void {
  const s = app.save.data;

  // Порядок важен: расследование должно читаться первым и на первом же
  // экране — это правило записано в CLAUDE.md буквально из-за отказа VK
  // по крестикам-ноликам. Участок — награда и метаигра, второй план,
  // не витрина. Карточки дел идут выше сетки участка, а не ниже.
  const cardsBox = el('div', { class: 'case-list' });
  for (const c of cases) {
    const done = s.casesCompleted.includes(c.id);
    const card = el(
      'button',
      { class: 'case-card', type: 'button' },
      el('div', { class: 'stamp' }, done ? '✓' : '?'),
      el(
        'div',
        { class: 'text' },
        el('b', {}, c.title),
        el('span', {}, done ? 'Раскрыто' : 'Ждёт расследования'),
      ),
    ) as HTMLButtonElement;
    card.addEventListener('click', () => void startCase(c));
    cardsBox.append(card);
  }

  const plotItems: Array<{ icon: string; name: string; stage: number }> = [
    { icon: '🍓', name: 'Грядка клубники', stage: 0 },
    { icon: '🐈', name: 'Кот Барсик', stage: 1 },
    { icon: '🏡', name: 'Беседка', stage: 2 },
    { icon: '💧', name: 'Пруд', stage: 3 },
  ];

  const grid = el('div', { class: 'plot-grid' });
  for (const item of plotItems) {
    const locked = s.plotStage < item.stage;
    grid.append(
      el(
        'div',
        { class: `plot-cell${locked ? ' locked' : ''}` },
        el('div', { class: 'icon' }, locked ? '🔒' : item.icon),
        el('div', { class: 'name' }, item.name),
      ),
    );
  }

  const screen = el(
    'div',
    { class: 'screen plot' },
    el('h1', {}, 'Дачные тайны'),
    cardsBox,
    el('div', { class: 'plot-label' }, 'Ваш участок'),
    grid,
  );

  root.replaceChildren(screen);
}

/**
 * Игрок открывает первое в жизни дело без устного объяснения — сам экран
 * обязан рассказать, что происходит. Показываем один раз, до самого первого
 * дела: и цель расследования, и жест по клеткам, который нигде больше
 * не объясняется (клик циклит пусто → ✓ → ✕ → пусто).
 */
async function maybeShowOnboarding(): Promise<void> {
  if (app.save.data.onboardingSeen) return;
  app.track('onboarding_shown');
  await dialog({
    title: 'Как раскрыть дело',
    text:
      'Слева — улики соседей. Справа — таблицы: сопоставьте, кто где был ' +
      'и что при нём было. Нажимайте на клетку: первый клик — ✓ (точно да), ' +
      'второй — ✕ (точно нет), третий — снова пусто. Заполните верно все ' +
      'клетки по каждому соседу — и дело раскрыто.',
    actions: [{ label: 'Понятно, начинаем', kind: 'primary', value: 'ok' }],
  });
  app.save.data.onboardingSeen = true;
  app.save.markDirty();
}

// --- экран 2: расследование --------------------------------------------------

async function startCase(source: Case): Promise<void> {
  await maybeShowOnboarding();

  app.track('case_start', { caseId: source.id });
  app.startRound();

  const maybeSolution = uniqueSolution(source);
  if (!maybeSolution) {
    // Не должно случиться — validateCase() гоняется в тестах на каждое дело
    // из cases[]. Если всё-таки случилось, честно останавливаемся,
    // а не показываем игроку неразрешимую головоломку.
    toast('Это дело собрано неверно — сообщите разработчику');
    showPlot();
    return;
  }
  // Отдельная константа: TypeScript не сужает solution до non-null внутри
  // вложенной function-декларации (checkSolved), захватывающей внешнюю
  // переменную через замыкание — а сюда она передаётся именно так.
  const solution: Solution = maybeSolution;

  // Для проверки ответа хватает пар «категория × якорь»: если для каждого
  // соседа верно найдены место и предмет, дело раскрыто. Пара «места ×
  // предметы» логически следует из этого (Ирина=грядка и Ирина=лейка уже
  // говорят, что грядка=лейка) — рисуем её для удобства рассуждения,
  // но не требуем отдельно заполнять: это была бы лишняя, неочевидная
  // работа сверх уже решённой головоломки.
  const groundTruthYes = buildGroundTruthYes(source, solution);
  const requiredYes = new Set(
    [...groundTruthYes].filter((key) => key.startsWith(`${source.anchor}|`) || key.includes(`~${source.anchor}|`)),
  );

  const saved = app.save.data.progress[source.id];
  const marks: PlayerMarks = saved ? { ...saved.marks } : {};
  let hintedKey: string | null = null;
  let markCount = Object.keys(marks).length;
  let hintsUsed = saved?.hintsUsed ?? 0;
  let solved = false;
  // Клик после того, как игрок уже ушёл с экрана: без этого флага
  // отложенный переход на развязку срабатывает поверх того, куда игрок
  // успел перейти за эти 500 мс (например, уже открыл другое дело).
  let left = false;

  function persistProgress(): void {
    app.save.data.progress[source.id] = { marks: { ...marks }, hintsUsed };
    app.save.markDirty();
  }

  const cluesBox = el('div', { class: 'clues' });
  for (const clue of source.clues) {
    cluesBox.append(el('div', { class: 'clue' }, el('b', {}, '•'), el('span', {}, clue.text)));
  }

  const gridsBox = el('div', { class: 'grids-stack' });
  const grids: Array<ReturnType<typeof renderPairGrid>> = [];

  for (let i = 0; i < source.categories.length; i += 1) {
    for (let j = i + 1; j < source.categories.length; j += 1) {
      const handle = renderPairGrid(
        source.categories[i],
        source.categories[j],
        marks,
        onCellChange,
        hintedKey,
      );
      grids.push(handle);
      gridsBox.append(handle.root);
    }
  }

  const hintText = el('div', { class: 'hint-text', hidden: true });
  const hintBtn = el('button', { class: 'btn hint-btn', type: 'button' }, '💡 Подсказка') as HTMLButtonElement;
  hintBtn.addEventListener('click', () => void useHint());

  // Подсказка живёт в закреплённой нижней панели, а не в конце страницы:
  // при трёх сетках подряд кнопка внизу потока не видна без прокрутки —
  // ровно то место, где она действительно нужна игроку в тупике.
  const hintBar = el('div', { class: 'hint-bar' }, hintText, hintBtn);

  const screen = el(
    'div',
    { class: 'screen case' },
    el(
      'div',
      { class: 'topbar' },
      el('span', { class: 'title' }, source.title),
      el('span', { class: 'spacer' }),
      backButton(),
    ),
    el('div', { class: 'case-scroll' }, cluesBox, gridsBox),
    hintBar,
  );
  root.replaceChildren(screen);
  updateHintButtonLabel(); // на случай восстановленного saved.hintsUsed > 0

  function refreshAll(): void {
    for (const g of grids) g.refresh();
  }

  function onCellChange(a: Ref, b: Ref, next: 'yes' | 'no' | null): void {
    if (solved) return;
    const key = markKey(a, b);

    if (markCount === 0 && next !== null) app.track('case_first_mark', { caseId: source.id });

    if (next === null) {
      delete marks[key];
    } else {
      const wasSet = marks[key] !== undefined;
      marks[key] = next;
      if (!wasSet) markCount += 1;

      const isTrue = groundTruthYes.has(key);
      const correct = (next === 'yes') === isTrue;
      if (!correct) app.track('case_mistake', { caseId: source.id, key });

      // Отметка «да» гасит остальную строку и столбец в этой сетке —
      // подсказка интерфейса «одна сущность — одно значение», не вывод движка.
      if (next === 'yes') autoExclude(a, b);
    }

    refreshAll();
    persistProgress();
    checkSolved();
  }

  function autoExclude(a: Ref, b: Ref): void {
    const catA = source.categories.find((c) => c.id === a.category)!;
    const catB = source.categories.find((c) => c.id === b.category)!;
    // Безусловная перезапись, а не «только если пусто»: отметка «да»
    // отменяет любую прежнюю отметку в той же строке/столбце, включая
    // ошибочное «да», поставленное раньше по той же сетке. Раньше
    // условие «только если undefined» позволяло неверной галочке
    // пережить верную — и дело раскрывалось при внутренне противоречивой
    // сетке, потому что проверка завершения смотрела только на нужные
    // клетки, не на отсутствие лишних.
    for (const value of catB.values) {
      if (value === b.value) continue;
      marks[markKey(a, { category: catB.id, value })] = 'no';
    }
    for (const value of catA.values) {
      if (value === a.value) continue;
      marks[markKey({ category: catA.id, value }, b)] = 'no';
    }
  }

  /**
   * Кнопка должна честно говорить, что будет, ДО клика — «игрок всегда
   * заранее видит, что получит» (CLAUDE.md, политика рекламы). Первая
   * подсказка free, дальше — за рекламу, но только если она на этой
   * площадке вообще есть: caps.rewarded проверяем один раз и подписываем
   * кнопку соответственно, а не молча ловим отказ уже после клика.
   */
  function updateHintButtonLabel(): void {
    if (hintsUsed === 0) {
      hintBtn.textContent = '💡 Подсказка';
    } else if (app.ads.rewardedAvailable) {
      hintBtn.textContent = '💡 Ещё подсказка за рекламу';
    } else {
      hintBtn.textContent = '💡 Ещё подсказка';
    }
  }

  async function useHint(): Promise<void> {
    const needsAd = hintsUsed > 0 && app.ads.rewardedAvailable;
    if (needsAd) {
      const granted = await app.offerReward('hint');
      if (!granted) {
        toast('Реклама не загрузилась — попробуйте ещё раз');
        return;
      }
    }
    // hintsUsed > 0 и rewardedAvailable === false: подсказка бесплатна,
    // площадка просто не даёт рекламы — это не повод запирать игрока,
    // а не наша политика показов; см. правило 2 в CLAUDE.md про caps.

    const hint = nextHint(source, marks);
    if (!hint) {
      toast('Больше подсказок нет — вы и так близко к разгадке');
      return;
    }

    app.track('case_hint', { caseId: source.id, rule: hint.reason.rule, viaAd: needsAd });
    hintsUsed += 1;
    persistProgress();
    updateHintButtonLabel();
    hintedKey = markKey(hint.a, hint.b);
    hintText.textContent = hint.text;
    hintText.hidden = false;
    for (const g of grids) g.root.querySelectorAll('.cell.hinted').forEach((c) => c.classList.remove('hinted'));
    const target = gridsBox.querySelector(
      `button[aria-label="${hint.a.value} — ${hint.b.value}"], button[aria-label="${hint.b.value} — ${hint.a.value}"]`,
    );
    target?.classList.add('hinted');
  }

  function checkSolved(): void {
    for (const key of requiredYes) {
      if (marks[key] !== 'yes') return;
    }
    // Обязательных пар хватает только тогда, когда сетка в целом
    // непротиворечива. autoExclude чистит лишь свою собственную сетку:
    // ошибочное «да» в неякорной паре (например, «беседка — зонт» в
    // местах×предметах) никак не связано с тем, что персонажи×места
    // и персонажи×предметы уже верно заполнены, и остаётся висеть.
    // Раньше checkSolved это не видел — дело раскрывалось при внутренне
    // противоречивой сетке. Сверяем КАЖДУЮ отметку «да», не только
    // обязательные: лишнего верного «да» относительно решения быть не
    // должно нигде, а не только там, где мы обязаны проверить.
    for (const [key, value] of Object.entries(marks)) {
      if (value === 'yes' && !groundTruthYes.has(key)) return;
    }
    solved = true;
    delete app.save.data.progress[source.id]; // дело раскрыто — возобновлять нечего
    app.save.markDirty();
    app.track('case_complete', { caseId: source.id, hintsUsed, markCount });
    setTimeout(() => {
      if (left) return; // игрок уже ушёл с экрана — не выдёргиваем его обратно
      void finishCase(source, solution);
    }, 500);
  }

  function backButton(): HTMLButtonElement {
    const btn = el('button', { class: 'btn ghost', type: 'button' }, 'Участок') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      left = true;
      app.track('case_exit', { caseId: source.id, solved });
      // Раунд засчитывается для политики рекламы только при настоящем
      // завершении. Ушёл на середине — гейм-плей стопаем и сохраняем,
      // но это не партия, и в счётчик показов она попадать не должна.
      void (solved ? app.endRound() : app.abandonRound());
      showPlot();
    });
    return btn;
  }
}

/** Все верные пары «да» из решения: для любых двух категорий, по каждой сущности. */
function buildGroundTruthYes(source: Case, solution: Solution): Set<string> {
  const yes = new Set<string>();
  const size = source.categories[0].values.length;

  for (let i = 0; i < source.categories.length; i += 1) {
    for (let j = i + 1; j < source.categories.length; j += 1) {
      const catA = source.categories[i];
      const catB = source.categories[j];
      for (let subject = 0; subject < size; subject += 1) {
        const a: Ref = { category: catA.id, value: catA.values[solution[catA.id][subject]] };
        const b: Ref = { category: catB.id, value: catB.values[solution[catB.id][subject]] };
        yes.add(markKey(a, b));
      }
    }
  }
  return yes;
}

// --- экран 3: развязка --------------------------------------------------------

async function finishCase(source: Case, solution: Solution): Promise<void> {
  const s = app.save.data;
  const isNew = !s.casesCompleted.includes(source.id);
  if (isNew) {
    s.casesCompleted.push(source.id);
    s.plotStage = Math.min(4, s.plotStage + 1);
    app.save.markDirty();
  }
  await app.endRound();

  const children = [
    el('div', { class: 'topbar' }, el('span', { class: 'title' }, 'Дело раскрыто')),
    el(
      'div',
      { class: 'scene' },
      el('div', { class: 'stamp-big' }, 'РАСКРЫТО'),
      el('div', { class: 'figure' }, '👩'),
      el('div', { class: 'figure b' }, '👨'),
      el('div', { class: 'figure' }, '🧑'),
    ),
    caseFileSummary(source, solution),
    el('div', { class: 'reveal-text' }, source.epilogue),
  ];

  // Сообщение о награде — только если участок правда пополнился. Дело
  // при повторном прохождении не должно врать про изменение, которого
  // не произошло: сохранение не меняется, значит и текст не должен.
  if (isNew) {
    children.push(el('div', { class: 'reward' }, '🌱 Участок пополнился новым уголком'));
  }

  children.push(continueButton());

  const screen = el('div', { class: 'screen reveal' }, ...children);
  root.replaceChildren(screen);

  // Между делами, не посреди расследования — ровно то место, что разрешает
  // наша политика рекламы.
  await app.ads.interstitial();
}

/**
 * Компактная сводка дела вместо пустого декоративного пространства:
 * кто где был и что при нём было — то, что игрок только что доказал.
 * Полноценные иллюстрации персонажей — отдельная, более поздняя работа
 * (переиспользуемые ассеты по плану Кодекса), а эта сводка не декорация,
 * а содержательный итог партии, который можно сделать уже сейчас.
 */
function caseFileSummary(source: Case, solution: Solution): HTMLElement {
  const box = el('div', { class: 'case-file' });
  const anchorCat = source.categories.find((c) => c.id === source.anchor)!;
  const others = source.categories.filter((c) => c.id !== source.anchor);

  anchorCat.values.forEach((name, subject) => {
    const parts = others.map((cat) => cat.values[solution[cat.id][subject]]);
    box.append(
      el(
        'div',
        { class: 'case-file-row' },
        el('b', {}, name),
        el('span', {}, parts.join(' · ')),
      ),
    );
  });

  return box;
}

function continueButton(): HTMLElement {
  const wrap = el('div', { class: 'controls' });
  const btn = el('button', { class: 'btn primary', type: 'button' }, 'Вернуться на участок') as HTMLButtonElement;
  btn.addEventListener('click', () => {
    app.track('app_exit_to_plot');
    showPlot();
  });
  wrap.append(btn);
  return wrap;
}

void tutorialCase; // используется через cases[], импорт оставлен для ясности
