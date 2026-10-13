import { GameApp } from '@studio/game-kit';
import { markKey, nextHint, uniqueSolution } from '@studio/rules';
import type { Case, Contradiction, PlayerMarks, Ref, Solution } from '@studio/rules';
import { dialog, el, toast } from '@studio/ui';
import { renderPairGrid } from './grid';
import { CASE_REQUIRES, PLOT_CASE_IDS, VALUE_RENAMES, cases, nextChapterCase, tutorialCase } from './cases';
import { claimedFact, testimonyHolds } from './contradiction';
import { marksFitCase, renameMarks } from './progress';
import { ACHIEVEMENTS, checkNewAchievements, starsFor } from './achievements';
import { SHOP_ITEMS, SKU_NO_ADS, SKU_UNLIMITED_HINTS, buyLabel, votes } from './shop';
import type { ShopItem } from './shop';
import { fetchConfirmedSkus, mergePurchases, restoreUrl } from './restore';
import './theme.css';
import './style.css';

interface Save {
  casesCompleted: string[];
  /**
   * Незаконченный прогресс по каждому делу отдельно, по caseId. Раньше
   * это было одно поле inProgress на всё сохранение сразу — работало,
   * пока в игре было одно дело. Как только их стало три, переключение
   * между незаконченными делами тихо стирало прогресс: открыл третье,
   * вернулся во второе — там пусто, потому что inProgress успел
   * перезаписаться. Теперь у каждого дела свой ключ, и они не мешают
   * друг другу.
   */
  progress: Record<string, CaseProgress>;
  /** Обучение цели и жесту ✓/✕ показано один раз, не перед каждым делом. */
  onboardingSeen?: boolean;
  /**
   * Вступления, которые уже показаны (досмотрены или пропущены): ключ
   * storyKey() — id дела, а для новой редакции кадров «id#редакция». Так
   * обновлённое вступление один раз увидят и те, кто видел прежнее, а
   * отметки других дел не сбрасываются. Сам показ — один раз, дальше — по
   * кнопке. Необязательное поле: старые сохранения читаются без миграции.
   */
  storySeen?: string[];
  /**
   * Звёзды за качество раскрытия (1-3, по числу подсказок), по каждому
   * делу — только за первое раскрытие. Участок растёт по сумме звёзд,
   * не по числу раскрытых дел: так переигранное без подсказок дело
   * даёт что-то новое, а не просто повторяет уже полученную награду.
   */
  stars: Record<string, 1 | 2 | 3>;
  /** Открытые достижения — id из ACHIEVEMENTS. */
  achievements: string[];
  /** Разовые покупки, per-SKU. VK payments — см. showShop(). */
  purchases: { noAds?: boolean; unlimitedHints?: boolean };
}

interface CaseProgress {
  marks: PlayerMarks;
  hintsUsed: number;
  /**
   * Таблицы решены, но шаг «противоречие» ещё не пройден. Дело не раскрыто,
   * пока не найдено противоречие: вернувшись, игрок попадает сразу на этот шаг,
   * а не к пустым или повторно заполняемым таблицам. Поле необязательное —
   * старые сохранения читаются без миграции.
   */
  gridSolved?: boolean;
}

interface SaveV1 {
  casesCompleted: string[];
  plotStage: number;
  inProgress?: { caseId: string; marks: PlayerMarks; hintsUsed: number };
  onboardingSeen?: boolean;
}

interface SaveV2 {
  casesCompleted: string[];
  plotStage: number;
  progress: Record<string, { marks: PlayerMarks; hintsUsed: number }>;
  onboardingSeen?: boolean;
}

/**
 * Дела, раскрытые до появления звёзд, не могут получить настоящую оценку
 * задним числом — мы не знаем, сколько подсказок тогда ушло. 2 звезды —
 * нейтральное предположение: не штрафуем как за худшее прохождение,
 * не выдумываем идеальное.
 */
function backfillStars(casesCompleted: string[]): Save['stars'] {
  return Object.fromEntries(casesCompleted.map((id) => [id, 2]));
}

const DEFAULTS: Save = { casesCompleted: [], progress: {}, stars: {}, achievements: [], purchases: {} };

/**
 * Адрес платёжного сервера для восстановления покупок задаётся при сборке
 * (`VITE_PAYMENTS_URL`). Пусто — восстановление выключено, игра не делает ни
 * одного запроса и ведёт себя как раньше. Так новая логика включается только
 * сборкой, которую явно собрали с адресом (сначала — тестовой).
 */
declare const __PAYMENTS_URL__: string;

const root = document.getElementById('app')!;
let app!: GameApp<Save>;

async function main(): Promise<void> {
  app = await GameApp.boot<Save>({
    gameId: 'dachnye-tainy',
    saveVersion: 3,
    defaults: DEFAULTS,
    adPolicy: { firstAdAfterRounds: 1, minSecondsBetween: 180 },
    // v1 хранил одно незаконченное дело в inProgress, v2 добавил progress
    // по caseId, но плоскую награду plotStage вместо звёзд. v3 убирает
    // plotStage совсем — прогресс участка теперь считается из stars
    // на лету (см. totalStars() ниже), одного источника правды достаточно.
    migrate: (old, fromVersion) => {
      if (fromVersion === 1) {
        const legacy = old as Partial<SaveV1>;
        const progress: Save['progress'] = {};
        if (legacy.inProgress) {
          progress[legacy.inProgress.caseId] = {
            marks: legacy.inProgress.marks,
            hintsUsed: legacy.inProgress.hintsUsed,
          };
        }
        const casesCompleted = legacy.casesCompleted ?? [];
        return {
          casesCompleted,
          progress,
          onboardingSeen: legacy.onboardingSeen,
          stars: backfillStars(casesCompleted),
          achievements: [],
          purchases: {},
        };
      }
      if (fromVersion === 2) {
        const legacy = old as Partial<SaveV2>;
        const casesCompleted = legacy.casesCompleted ?? [];
        return {
          casesCompleted,
          progress: legacy.progress ?? {},
          onboardingSeen: legacy.onboardingSeen,
          stars: backfillStars(casesCompleted),
          achievements: [],
          purchases: {},
        };
      }
      return null;
    },
  });

  app.track('app_start');
  showPlot();
  app.ready();
  // Не ждём: игра уже на экране, восстановление только добавит права, если они есть.
  void restorePurchases('launch');
}

/**
 * Запрашивает у сервера подтверждённые покупки и добавляет недостающие права.
 * Ошибка сети или сервера ничего не меняет и игроку не показывается.
 */
async function restorePurchases(reason: 'launch' | 'after_purchase'): Promise<void> {
  const url = restoreUrl(__PAYMENTS_URL__, location.search);
  if (!url) return;
  const skus = await fetchConfirmedSkus(url, (u, init) => fetch(u, init));
  if (!skus) {
    app.track('purchase_restore_failed', { reason });
    return;
  }
  const added = mergePurchases(app.save.data.purchases, skus);
  if (added.length > 0) {
    app.save.markDirty();
    app.track('purchase_restored', { reason, count: added.length });
    notifyPurchasesChanged();
  }
}

/**
 * Ответ сервера может прийти, когда игрок уже в магазине или в деле. Экраны,
 * которые показывают права (кнопки покупки, подпись подсказки), подписываются
 * здесь и обновляются без перезагрузки. Подписка живёт, пока узел в документе:
 * экраны заменяются целиком, отписываться вручную негде.
 */
const purchaseListeners = new Set<() => void>();

function onPurchasesChanged(node: Element, refresh: () => void): void {
  const listener = (): void => {
    if (!node.isConnected) {
      purchaseListeners.delete(listener);
      return;
    }
    refresh();
  };
  purchaseListeners.add(listener);
}

function notifyPurchasesChanged(): void {
  for (const listener of [...purchaseListeners]) listener();
}

void main();

// --- экран 1: участок -------------------------------------------------------

/** Сумма звёзд по всем раскрытым делам — единственный источник прогресса участка. */
function totalStars(s: Save): number {
  return Object.values(s.stars).reduce((sum, v) => sum + v, 0);
}

const PLOT_ITEMS: Array<{ icon: string; name: string; stars: number }> = [
  { icon: '🍓', name: 'Грядка клубники', stars: 0 },
  { icon: '🐈', name: 'Кот Барсик', stars: 2 },
  { icon: '🏡', name: 'Беседка', stars: 5 },
  { icon: '💧', name: 'Пруд', stars: 8 },
  { icon: '🌻', name: 'Клумба', stars: 12 },
  { icon: '🐔', name: 'Курятник', stars: 16 },
];

function showPlot(): void {
  const s = app.save.data;
  const stars = totalStars(s);

  // Порядок важен: расследование должно читаться первым и на первом же
  // экране — это правило записано в CLAUDE.md буквально из-за отказа VK
  // по крестикам-ноликам. Участок — награда и метаигра, второй план,
  // не витрина. Карточки дел идут выше сетки участка, а не ниже.
  const cardsBox = el('div', { class: 'case-list' });
  for (const c of cases) {
    const done = s.casesCompleted.includes(c.id);
    const earned = s.stars[c.id];
    // Дело главы без раскрытого предыдущего не имеет своего вопроса — карточка
    // видна (глава продолжается), но заперта и говорит, что открыть сначала.
    const required = CASE_REQUIRES[c.id];
    const locked = !!required && !s.casesCompleted.includes(required);
    const requiredCase = cases.find((x) => x.id === required);
    let status = 'Ждёт расследования';
    if (done) status = `Раскрыто · ${'⭐'.repeat(earned ?? 0)}`;
    else if (locked && requiredCase) status = `Сначала раскройте «${shortTitle(requiredCase)}»`;
    else if (s.progress[c.id]?.gridSolved && marksFitCase(c, s.progress[c.id].marks)) {
      status = 'Таблицы готовы — осталось сверить показания';
    }
    const card = el(
      'button',
      { class: `case-card${locked ? ' locked' : ''}`, type: 'button', disabled: locked },
      caseCardMark(c, done ? '✓' : locked ? '🔒' : '?'),
      el('div', { class: 'text' }, el('b', {}, c.title), el('span', {}, status)),
    ) as HTMLButtonElement;
    if (!locked) card.addEventListener('click', () => void startCase(c));
    cardsBox.append(card);
  }

  // Не просто «открыто/заперто по факту дела», а по сумме звёзд за качество
  // раскрытия — модератор VK просил интересную систему прогресса, не
  // прямую единицу-за-единицу награду. Запертый элемент показывает, сколько
  // звёзд не хватает, а не просто замок без объяснений.
  const grid = el('div', { class: 'plot-grid' });
  for (const item of PLOT_ITEMS) {
    const locked = stars < item.stars;
    grid.append(
      el(
        'div',
        { class: `plot-cell${locked ? ' locked' : ''}` },
        el('div', { class: 'icon' }, locked ? '🔒' : item.icon),
        el('div', { class: 'name' }, locked ? `Ещё ${item.stars - stars}⭐` : item.name),
      ),
    );
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
    el('h1', {}, 'Дачные тайны'),
    cardsBox,
    el('div', { class: 'plot-label' }, `Ваш участок · ${stars}⭐`),
    grid,
    el('div', { class: 'plot-label' }, 'Достижения'),
    achievementsBox,
  ];

  // Кнопка магазина — только если площадка реально умеет платежи (правило 2
  // из CLAUDE.md: скрываем, а не показываем мёртвую кнопку). На web/непроверенном
  // VK её никто не увидит, и это правильно — рано или поздно caps.payments
  // станет true, и кнопка появится сама, без правки экрана.
  if (app.platform.caps.payments) {
    const shopBtn = el('button', { class: 'btn ghost shop-btn', type: 'button' }, '🛍️ Магазин') as HTMLButtonElement;
    shopBtn.addEventListener('click', () => void showShop());
    screenChildren.push(shopBtn);
  }

  const screen = el('div', { class: 'screen plot' }, ...screenChildren);
  root.replaceChildren(screen);
}

/**
 * Левая часть карточки дела. С обложкой — маленькая картинка и печать
 * статуса в её углу (статус и звёзды остаются текстом справа); без
 * обложки — прежняя круглая печать. Картинка декоративная: alt пустой,
 * название дела уже в тексте кнопки.
 */
function caseCardMark(c: Case, stamp: string): HTMLElement {
  if (!c.cover) return el('div', { class: 'stamp' }, stamp);
  const img = el('img', { class: 'cover-image', src: c.cover, alt: '', width: 192, height: 144, decoding: 'async' });
  return el('div', { class: 'cover' }, img, el('div', { class: 'stamp badge' }, stamp));
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

/**
 * Вступление показывается само один раз — при открытии дела, если его ещё
 * нет в storySeen. Это касается и тех, кто начал или раскрыл дело до
 * появления кадров: прогресс при этом не трогается, а «Пропустить» сразу
 * ведёт к делу. Дальше — только по кнопке «Вступление».
 */
async function startCase(source: Case): Promise<void> {
  if (source.story && !app.save.data.storySeen?.includes(storyKey(source))) {
    await showStory(source);
  }
  await openCase(source);
}

/** Ключ просмотра вступления: «tutorial-1» для первой редакции, «tutorial-1#2» для второй. */
function storyKey(source: Case): string {
  return source.storyVersion && source.storyVersion > 1 ? `${source.id}#${source.storyVersion}` : source.id;
}

/**
 * Кадры вступления поверх текущего экрана. Promise разрешается, когда игрок
 * дошёл до конца или нажал «Пропустить»; оба случая считаются просмотром.
 *
 * Окно модальное: всё остальное в body на время показа inert (ни клик, ни Tab,
 * ни экранный диктор до фона не доходят), а Tab/Shift+Tab ходят по кругу
 * внутри окна. При закрытии фон возвращается в прежнее состояние, фокус —
 * на returnFocus (кнопку повтора), если вступление открывали вручную.
 */
function showStory(source: Case, returnFocus?: HTMLElement): Promise<void> {
  const frames = source.story ?? [];
  return new Promise((resolve) => {
    let index = 0;
    const img = el('img', { class: 'story-image', width: 1080, height: 810, decoding: 'async' }) as HTMLImageElement;
    const caption = el('p', { class: 'story-caption' });
    caption.setAttribute('aria-live', 'polite');
    const counter = el('span', { class: 'story-counter' });
    const next = el('button', { class: 'btn primary', type: 'button' }) as HTMLButtonElement;
    const skip = el('button', { class: 'btn ghost', type: 'button' }, 'Пропустить') as HTMLButtonElement;

    const overlay = el(
      'div',
      { class: 'story' },
      el('div', { class: 'topbar' }, el('span', { class: 'title' }, shortTitle(source)), el('span', { class: 'spacer' }), skip),
      el('div', { class: 'story-body' }, el('div', { class: 'story-frame' }, img), caption),
      el('div', { class: 'controls story-controls' }, counter, next),
    );

    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `Вступление: ${shortTitle(source)}`);

    function render(): void {
      const frame = frames[index];
      img.src = frame.image;
      img.alt = frame.alt;
      caption.textContent = frame.caption;
      counter.textContent = frames.length > 1 ? `${index + 1} / ${frames.length}` : '';
      next.textContent = index === frames.length - 1 ? 'К расследованию' : 'Дальше';
      // Следующий кадр подгружаем заранее, чтобы перелистывание не ждало сеть.
      if (frames[index + 1]) new Image().src = frames[index + 1].image;
    }

    function finish(skipped: boolean): void {
      app.track(skipped ? 'story_skipped' : 'story_done', { caseId: source.id, frame: index + 1 });
      const seen = (app.save.data.storySeen ??= []);
      if (!seen.includes(storyKey(source))) {
        seen.push(storyKey(source));
        app.save.markDirty();
      }
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      for (const [node, wasInert] of background) node.inert = wasInert;
      if (returnFocus?.isConnected) returnFocus.focus();
      resolve();
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Tab') {
        // Две кнопки окна по кругу; фокус, оказавшийся вне окна, возвращается внутрь.
        e.preventDefault();
        const order = [skip, next];
        const at = order.indexOf(document.activeElement as HTMLButtonElement);
        const step = e.shiftKey ? -1 : 1;
        order[at < 0 ? 0 : (at + step + order.length) % order.length].focus();
      } else if (e.key === 'Escape') finish(true);
      else if (e.key === 'ArrowRight') next.click();
      else if (e.key === 'ArrowLeft' && index > 0) {
        index -= 1;
        render();
      }
    }

    next.addEventListener('click', () => {
      if (index === frames.length - 1) {
        finish(false);
        return;
      }
      index += 1;
      render();
    });
    skip.addEventListener('click', () => finish(true));
    document.addEventListener('keydown', onKey);

    app.track('story_shown', { caseId: source.id });
    render();
    const background = [...document.body.children]
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .map((node) => [node, node.inert] as const);
    for (const [node] of background) node.inert = true;
    document.body.append(overlay);
    next.focus();
  });
}

async function openCase(source: Case): Promise<void> {
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

  let saved: CaseProgress | undefined = app.save.data.progress[source.id];
  const renames = VALUE_RENAMES[source.id];
  if (saved && renames) {
    // Переименованные значения (порядок «первой» → «1») — переносим отметки.
    const marks = renameMarks(saved.marks, renames);
    if (JSON.stringify(marks) !== JSON.stringify(saved.marks)) {
      saved = { ...saved, marks };
      app.save.data.progress[source.id] = saved;
      app.save.markDirty();
    }
  }
  if (saved && !marksFitCase(source, saved.marks)) {
    // Отметки от прежней версии дела — начинаем таблицы заново (см. progress.ts).
    app.track('case_progress_reset', { caseId: source.id });
    delete app.save.data.progress[source.id];
    app.save.markDirty();
    saved = undefined;
  }
  if (saved?.gridSolved && source.contradiction) {
    showContradiction(source, source.contradiction, solution, saved.hintsUsed, false);
    return;
  }
  const marks: PlayerMarks = saved ? { ...saved.marks } : {};
  let hintedKey: string | null = null;
  let markCount = Object.keys(marks).length;
  let hintsUsed = saved?.hintsUsed ?? 0;
  let solved = false;
  // Для достижения «Не с первой попытки» — сама ошибка не хранится
  // в сохранении (только событие аналитики), а этот флаг нужен только
  // на момент раскрытия дела в этой же сессии.
  let hadMistake = false;
  // Клик после того, как игрок уже ушёл с экрана: без этого флага
  // отложенный переход на развязку срабатывает поверх того, куда игрок
  // успел перейти за эти 500 мс (например, уже открыл другое дело).
  let left = false;

  function persistProgress(): void {
    app.save.data.progress[source.id] = { marks: { ...marks }, hintsUsed };
    app.save.markDirty();
  }

  const cluesBox = el('div', { class: 'clues' });
  // У дел главы улики — проверенные факты; спорные показания идут отдельным
  // блоком ниже, чтобы ложь не читалась как правило головоломки.
  if (source.intro) cluesBox.append(el('div', { class: 'clues-title' }, 'Факты'));
  for (const clue of source.clues) {
    cluesBox.append(el('div', { class: 'clue' }, el('b', {}, '•'), el('span', {}, clue.text)));
  }
  const testimoniesBox = source.contradiction ? testimoniesBlock(source.contradiction) : null;

  const gridsBox = el('div', { class: 'grids-stack' });
  const grids: Array<ReturnType<typeof renderPairGrid>> = [];

  // Сначала таблицы ответа (пары с якорем), затем вспомогательные: раскрытие
  // засчитывается по таблицам ответа (requiredYes), и они должны идти первыми.
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < source.categories.length; i += 1) {
    for (let j = i + 1; j < source.categories.length; j += 1) pairs.push([i, j]);
  }
  const isAnswer = ([i, j]: [number, number]): boolean =>
    source.categories[i].id === source.anchor || source.categories[j].id === source.anchor;
  pairs.sort((p, q) => Number(isAnswer(q)) - Number(isAnswer(p)));

  const answerCount = pairs.filter(isAnswer).length;
  gridsBox.append(
    el(
      'div',
      { class: 'grids-goal' },
      `Цель: в ${answerCount === 2 ? 'двух верхних таблицах' : `${answerCount} верхних таблицах`} ` +
        'поставьте по одной ✓ в каждой строке. ' +
        (source.contradiction
          ? 'Когда всё верно, останется сверить показания с таблицами.'
          : 'Когда всё верно, дело раскроется само.'),
    ),
  );

  for (const [i, j] of pairs) {
    const handle = renderPairGrid(
      source.categories[i],
      source.categories[j],
      marks,
      onCellChange,
      hintedKey,
      isAnswer([i, j]) ? 'answer' : 'helper',
    );
    grids.push(handle);
    gridsBox.append(handle.root);
  }

  // Длинное вступление и факты на маленьком экране уводят сетки за первый
  // экран. Текст не уменьшаем — даём явный переход, и только когда он нужен.
  const toGridsBtn = el('button', { class: 'btn ghost to-grids', type: 'button', hidden: true }, 'К таблицам ↓') as HTMLButtonElement;
  toGridsBtn.addEventListener('click', () => gridsBox.scrollIntoView({ behavior: 'smooth', block: 'start' }));

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
    el(
      'div',
      { class: 'case-scroll' },
      ...(source.intro ? [introBlock(source), toGridsBtn] : source.story ? [replayButton(source)] : []),
      cluesBox,
      ...(testimoniesBox ? [testimoniesBox] : []),
      gridsBox,
    ),
    hintBar,
  );
  root.replaceChildren(screen);
  if (source.intro) {
    const scroller = screen.querySelector('.case-scroll') as HTMLElement;
    const placeToGrids = (): void => {
      if (!toGridsBtn.isConnected) {
        window.removeEventListener('resize', placeToGrids);
        return;
      }
      // Кнопка нужна, если верх первой сетки ниже видимой области прокрутки.
      const visibleBottom = scroller.getBoundingClientRect().bottom;
      toGridsBtn.hidden = gridsBox.getBoundingClientRect().top < visibleBottom - 40;
    };
    placeToGrids();
    window.addEventListener('resize', placeToGrids);
  }
  updateHintButtonLabel(); // на случай восстановленного saved.hintsUsed > 0
  onPurchasesChanged(hintBtn, updateHintButtonLabel);

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
      if (!correct) {
        hadMistake = true;
        app.track('case_mistake', { caseId: source.id, key });
      }

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
    } else if (app.save.data.purchases.unlimitedHints) {
      hintBtn.textContent = '💡 Ещё подсказка';
    } else if (app.ads.rewardedAvailable) {
      hintBtn.textContent = '💡 Ещё подсказка за рекламу';
    } else {
      hintBtn.textContent = '💡 Ещё подсказка';
    }
  }

  async function useHint(): Promise<void> {
    // Купленные безлимитные подсказки перевешивают обычную политику
    // рекламы — игрок уже заплатил вперёд, второй раз с него не берём.
    const needsAd = hintsUsed > 0 && app.ads.rewardedAvailable && !app.save.data.purchases.unlimitedHints;
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
    const step = source.contradiction;
    if (step) {
      // Таблицы решены, но дело — ещё нет: впереди сверка показаний. Отметки
      // сохраняем вместе с флагом, чтобы вернуться прямо к этому шагу.
      app.save.data.progress[source.id] = { marks: { ...marks }, hintsUsed, gridSolved: true };
      app.save.markDirty();
      app.track('case_grid_solved', { caseId: source.id, hintsUsed, markCount });
      setTimeout(() => {
        if (left) return;
        showContradiction(source, step, solution, hintsUsed, hadMistake);
      }, 500);
      return;
    }
    delete app.save.data.progress[source.id]; // дело раскрыто — возобновлять нечего
    app.save.markDirty();
    app.track('case_complete', { caseId: source.id, hintsUsed, markCount });
    setTimeout(() => {
      if (left) return; // игрок уже ушёл с экрана — не выдёргиваем его обратно
      void finishCase(source, solution, hintsUsed, hadMistake);
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
      // У дела с шагом «противоречие» решённые таблицы — ещё не конец партии.
      void (solved && !source.contradiction ? app.endRound() : app.abandonRound());
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

/** Условия дела; у дела с кадрами — ещё кнопка повторить вступление. */
function introBlock(source: Case): HTMLElement {
  const box = el('div', { class: 'case-intro' }, source.intro ?? '');
  if (source.story) box.append(replayButton(source));
  return box;
}

/** «📖 Вступление»: повтор кадров поверх дела, фокус потом возвращается сюда. */
function replayButton(source: Case): HTMLButtonElement {
  const replay = el('button', { class: 'btn ghost story-replay', type: 'button' }, '📖 Вступление') as HTMLButtonElement;
  replay.addEventListener('click', () => {
    app.track('story_replay', { caseId: source.id });
    void showStory(source, replay);
  });
  return replay;
}

// --- экран 2б: противоречие в показаниях ---------------------------------------

/** Показания отдельно от фактов: подписаны как слова, которые ещё нужно проверить. */
function testimoniesBlock(step: Contradiction): HTMLElement {
  const box = el(
    'div',
    { class: 'testimonies' },
    el('div', { class: 'testimonies-title' }, 'Показания — проверьте по фактам'),
    el(
      'div',
      { class: 'testimonies-note' },
      'Это слова соседей, а не факты. Для таблиц они не нужны, и кто-то из соседей говорит неправду.',
    ),
  );
  for (const t of step.testimonies) {
    box.append(el('div', { class: 'testimony' }, el('b', {}, t.who.value), el('span', {}, t.text)));
  }
  return box;
}

/**
 * После таблиц игрок выбирает, чьи слова расходятся с фактами. Ответ
 * сверяется с решением сетки (testimonyHolds), а не с пометкой автора.
 * Неверный выбор — не проигрыш: игра показывает, что о человеке установили
 * таблицы, и предлагает подумать ещё. Подсказок здесь нет — итог таблиц
 * на экране и объяснение после ответа и есть помощь.
 */
function showContradiction(
  source: Case,
  step: Contradiction,
  solution: Solution,
  hintsUsed: number,
  hadMistake: boolean,
): void {
  let wrong = 0;
  const feedback = el('div', { class: 'step-feedback', hidden: true });
  const options = el('div', { class: 'step-options' });

  for (const t of step.testimonies) {
    const btn = el('button', { class: 'btn ghost', type: 'button' }, t.who.value) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      const correct = !testimonyHolds(source, solution, t);
      app.track('chapter_step', { caseId: source.id, step: 'contradiction', correct });
      feedback.hidden = false;
      if (!correct) {
        wrong += 1;
        btn.disabled = true;
        feedback.className = 'step-feedback';
        feedback.textContent =
          `${t.who.value}: ${t.text} Слова ${step.claimTopic} совпадают с таблицами: ${t.who.value} — ${claimedFact(source, solution, t)}. ` +
          'Остальное в этих словах таблицы не проверяют. Сверьте другие показания.';
        return;
      }
      for (const b of options.querySelectorAll('button')) b.disabled = true;
      btn.classList.add('chosen');
      feedback.className = 'step-feedback correct';
      feedback.textContent = `Верно. ${step.resolution}`;
      app.track('case_complete', { caseId: source.id, hintsUsed, wrongAnswers: wrong });
      const next = el('button', { class: 'btn primary', type: 'button' }, 'К развязке') as HTMLButtonElement;
      next.addEventListener('click', () => void finishCase(source, solution, hintsUsed, hadMistake));
      feedback.append(el('div', { class: 'step-next' }, next));
      next.scrollIntoView({ block: 'nearest' });
    });
    options.append(btn);
  }

  const back = el('button', { class: 'btn ghost', type: 'button' }, 'Участок') as HTMLButtonElement;
  back.addEventListener('click', () => {
    app.track('case_exit', { caseId: source.id, solved: false, step: 'contradiction' });
    void app.abandonRound();
    showPlot();
  });

  const screen = el(
    'div',
    { class: 'screen case step' },
    el('div', { class: 'topbar' }, el('span', { class: 'title' }, source.title), el('span', { class: 'spacer' }), back),
    el(
      'div',
      { class: 'case-scroll' },
      el('div', { class: 'step-title' }, 'Что установили таблицы'),
      caseFileSummary(source, solution),
      testimoniesBlock(step),
      el('div', { class: 'step-question' }, step.question),
      options,
      feedback,
    ),
  );
  root.replaceChildren(screen);
}

// --- экран 3: развязка --------------------------------------------------------

async function finishCase(
  source: Case,
  solution: Solution,
  hintsUsed: number,
  hadMistake: boolean,
): Promise<void> {
  const s = app.save.data;
  const isNew = !s.casesCompleted.includes(source.id);
  let newAchievements: ReturnType<typeof checkNewAchievements> = [];

  // У дела с шагом «противоречие» отметки хранились до верного ответа.
  if (s.progress[source.id]) {
    delete s.progress[source.id];
    app.save.markDirty();
  }

  if (isNew) {
    s.casesCompleted.push(source.id);
    s.stars[source.id] = starsFor(hintsUsed);
    newAchievements = checkNewAchievements(new Set(s.achievements), {
      hintsUsed,
      hadMistake,
      casesCompletedCount: s.casesCompleted.length,
      plotCasesCompleted: PLOT_CASE_IDS.filter((id) => s.casesCompleted.includes(id)).length,
      plotCasesTotal: PLOT_CASE_IDS.length,
      flawlessCount: Object.values(s.stars).filter((v) => v === 3).length,
    });
    s.achievements.push(...newAchievements);
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
  const nextCase = nextChapterCase(source.id);
  if (source.finding) {
    children.push(
      el(
        'div',
        { class: 'finding' },
        el('b', {}, `🔎 ${source.finding.title}`),
        el('p', {}, source.finding.text),
        el('span', { class: 'finding-next' }, nextCase ? `Дальше — дело «${shortTitle(nextCase)}».` : 'Продолжение следует.'),
      ),
    );
  }

  // Сообщение о награде — только если участок правда пополнился. Дело
  // при повторном прохождении не должно врать про изменение, которого
  // не произошло: сохранение не меняется, значит и текст не должен.
  if (isNew) {
    const stars = s.stars[source.id];
    children.push(
      el('div', { class: 'reward stars-reward' }, `${'⭐'.repeat(stars)} Участок пополнился новым уголком`),
    );
    for (const id of newAchievements) {
      const a = ACHIEVEMENTS.find((x) => x.id === id)!;
      children.push(el('div', { class: 'reward achievement-unlocked' }, `🏅 Новое достижение: «${a.title}»`));
    }
  }

  children.push(continueButton(source, nextCase));

  const screen = el('div', { class: 'screen reveal' }, ...children);
  root.replaceChildren(screen);

  // Между делами, не посреди расследования — ровно то место, что разрешает
  // наша политика рекламы. Купленное «Без рекламы» отменяет именно эту
  // рекламу — rewarded-подсказки остаются добровольными, их отдельно
  // выключает purchases.unlimitedHints в useHint().
  if (!s.purchases.noAds) await app.ads.interstitial();
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

  // Итог раскрытия с заголовками: «Соседи — Время у бака — Что принесли».
  box.append(
    el(
      'div',
      { class: 'case-file-row case-file-head' },
      el('b', {}, anchorCat.title),
      el('span', {}, others.map((cat) => cat.title).join(' · ')),
    ),
  );

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

// --- магазин: разовые покупки -------------------------------------------------

/** Кто из товаров уже куплен и что покупка меняет в сохранении. Название, описание и цена — в shop.ts. */
const SHOP_EFFECTS: Record<string, { owned: (s: Save) => boolean; apply: (s: Save) => void }> = {
  [SKU_NO_ADS]: {
    owned: (s) => !!s.purchases.noAds,
    apply: (s) => {
      s.purchases.noAds = true;
    },
  },
  [SKU_UNLIMITED_HINTS]: {
    owned: (s) => !!s.purchases.unlimitedHints,
    apply: (s) => {
      s.purchases.unlimitedHints = true;
    },
  },
};

/**
 * Свой экран, не dialog() из @studio/ui: тому нужен один-единственный
 * выход из диалога, а тут несколько независимых кнопок «Купить» на одном
 * экране — под это dialog() не подходит по форме, только переиспользуем
 * его CSS-классы (.overlay/.dialog), чтобы выглядело единообразно.
 */
async function showShop(): Promise<void> {
  const s = app.save.data;
  const box = el('div', { class: 'dialog shop' }, el('h2', {}, '🛍️ Магазин'));

  for (const item of SHOP_ITEMS) {
    const owned = SHOP_EFFECTS[item.sku].owned(s);
    const btn = el(
      'button',
      { class: `btn ${owned ? 'ghost' : 'primary'}`, type: 'button', disabled: owned },
      owned ? 'Куплено' : buyLabel(item),
    ) as HTMLButtonElement;
    if (!owned) btn.addEventListener('click', () => void buy(item, btn));
    onPurchasesChanged(btn, () => {
      if (!SHOP_EFFECTS[item.sku].owned(app.save.data)) return;
      btn.textContent = 'Куплено';
      btn.disabled = true;
      btn.classList.replace('primary', 'ghost');
    });

    box.append(
      el(
        'div',
        { class: 'shop-item' },
        el(
          'div',
          { class: 'shop-item-text' },
          el('b', {}, item.title),
          el('span', {}, item.description),
          // Цена отдельной строкой, а не только в подписи кнопки: у купленного
          // товара кнопка говорит «Куплено», и цена не должна исчезать с экрана
          // вместе с ней — модератор VK требует, чтобы стоимость была видна.
          el('span', { class: 'shop-price' }, votes(item.price)),
        ),
        btn,
      ),
    );
  }

  const closeBtn = el('button', { class: 'btn ghost', type: 'button' }, 'Закрыть') as HTMLButtonElement;
  box.append(el('div', { class: 'actions' }, closeBtn));

  const overlay = el('div', { class: 'overlay' }, box);
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    showPlot(); // обновить подписи/участок, если что-то куплено
  });
  document.body.append(overlay);
}

async function buy(item: ShopItem, btn: HTMLButtonElement): Promise<void> {
  if (!app.platform.payments) return; // защита для TypeScript — кнопка «Магазин» уже проверила caps.payments
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '…';
  let paid = false;
  try {
    const result = await app.platform.payments.buy(item.sku);
    paid = result.ok;
  } catch {
    paid = false;
  }
  if (paid) {
    SHOP_EFFECTS[item.sku].apply(app.save.data);
    app.save.markDirty();
    app.track('purchase', { sku: item.sku });
    btn.textContent = 'Куплено';
  }
  // После любой попытки сверяемся с журналом: если окно ответило ошибкой или
  // таймаутом, а оплата всё же прошла, сервер это знает. Ошибку игроку
  // показываем, только если и журнал покупку не подтвердил.
  await restorePurchases('after_purchase');
  if (SHOP_EFFECTS[item.sku].owned(app.save.data)) {
    btn.textContent = 'Куплено';
    btn.disabled = true;
  } else {
    btn.textContent = original;
    btn.disabled = false;
    toast('Покупка не завершилась — попробуйте ещё раз');
  }
}

/** «Шланг у водокачки» вместо «Глава 1. Шланг у водокачки» — для ссылок на дело в тексте. */
function shortTitle(c: Case): string {
  return c.title.replace(/^Глава \d+\.\s*/, '');
}

/**
 * У дела главы с продолжением главная кнопка ведёт сразу в следующее дело:
 * глава проверяет, хочется ли узнать, что дальше, — и путь туда не должен
 * идти через участок. Участок остаётся второй кнопкой.
 */
function continueButton(source: Case, nextCase?: Case): HTMLElement {
  const wrap = el('div', { class: 'controls' });
  const btn = el(
    'button',
    { class: `btn ${nextCase ? 'ghost' : 'primary'}`, type: 'button' },
    nextCase ? 'Участок' : 'Вернуться на участок',
  ) as HTMLButtonElement;
  btn.addEventListener('click', () => {
    app.track('app_exit_to_plot');
    showPlot();
  });
  wrap.append(btn);
  if (nextCase) {
    const next = el('button', { class: 'btn primary next-case', type: 'button' }, 'Следующее дело →') as HTMLButtonElement;
    next.addEventListener('click', () => {
      app.track('next_case', { from: source.id, to: nextCase.id });
      void startCase(nextCase);
    });
    wrap.append(next);
  }
  return wrap;
}

void tutorialCase; // используется через cases[], импорт оставлен для ясности
