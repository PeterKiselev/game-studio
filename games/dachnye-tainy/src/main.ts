import { GameApp } from '@studio/game-kit';
import { markKey, nextHint, uniqueSolution } from '@studio/rules';
import type { Case, PlayerMarks, Ref, Solution } from '@studio/rules';
import { el, toast } from '@studio/ui';
import { renderPairGrid } from './grid';
import { cases, tutorialCase } from './cases';
import './theme.css';
import './style.css';

interface Save {
  casesCompleted: string[];
  plotStage: number;
}

const DEFAULTS: Save = { casesCompleted: [], plotStage: 0 };

const root = document.getElementById('app')!;
let app!: GameApp<Save>;

async function main(): Promise<void> {
  app = await GameApp.boot<Save>({
    gameId: 'dachnye-tainy',
    defaults: DEFAULTS,
    adPolicy: { firstAdAfterRounds: 1, minSecondsBetween: 180 },
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
    card.addEventListener('click', () => startCase(c));
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

// --- экран 2: расследование --------------------------------------------------

function startCase(source: Case): void {
  app.track('case_start', { caseId: source.id });
  app.startRound();

  const solution = uniqueSolution(source);
  if (!solution) {
    // Не должно случиться — validateCase() гоняется в тестах на каждое дело
    // из cases[]. Если всё-таки случилось, честно останавливаемся,
    // а не показываем игроку неразрешимую головоломку.
    toast('Это дело собрано неверно — сообщите разработчику');
    showPlot();
    return;
  }

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
  const marks: PlayerMarks = {};
  let hintedKey: string | null = null;
  let markCount = 0;
  let hintsUsed = 0;
  let solved = false;

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
    cluesBox,
    gridsBox,
    hintText,
    hintBtn,
  );
  root.replaceChildren(screen);

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
    checkSolved();
  }

  function autoExclude(a: Ref, b: Ref): void {
    const catA = source.categories.find((c) => c.id === a.category)!;
    const catB = source.categories.find((c) => c.id === b.category)!;
    for (const value of catB.values) {
      if (value === b.value) continue;
      const key = markKey(a, { category: catB.id, value });
      if (marks[key] === undefined) marks[key] = 'no';
    }
    for (const value of catA.values) {
      if (value === a.value) continue;
      const key = markKey({ category: catA.id, value }, b);
      if (marks[key] === undefined) marks[key] = 'no';
    }
  }

  async function useHint(): Promise<void> {
    if (hintsUsed > 0) {
      const granted = await app.offerReward('hint');
      if (!granted) {
        toast('Реклама не загрузилась — попробуйте ещё раз');
        return;
      }
    }

    const hint = nextHint(source, marks);
    if (!hint) {
      toast('Больше подсказок нет — вы и так близко к разгадке');
      return;
    }

    app.track('case_hint', { caseId: source.id, rule: hint.reason.rule });
    hintsUsed += 1;
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
    solved = true;
    app.track('case_complete', { caseId: source.id, hintsUsed, markCount });
    setTimeout(() => void finishCase(source), 500);
  }

  function backButton(): HTMLButtonElement {
    const btn = el('button', { class: 'btn ghost', type: 'button' }, 'Участок') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      app.track('case_exit', { caseId: source.id, solved });
      void app.endRound();
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

async function finishCase(source: Case): Promise<void> {
  const s = app.save.data;
  if (!s.casesCompleted.includes(source.id)) {
    s.casesCompleted.push(source.id);
    s.plotStage = Math.min(4, s.plotStage + 1);
    app.save.markDirty();
  }
  await app.endRound();

  const screen = el(
    'div',
    { class: 'screen reveal' },
    el(
      'div',
      { class: 'topbar' },
      el('span', { class: 'title' }, 'Дело раскрыто'),
    ),
    el(
      'div',
      { class: 'scene' },
      el('div', { class: 'stamp-big' }, 'РАСКРЫТО'),
      el('div', { class: 'figure' }, '👩'),
      el('div', { class: 'figure b' }, '👨'),
      el('div', { class: 'figure' }, '🧑'),
    ),
    el('div', { class: 'reveal-text' }, source.epilogue),
    el('div', { class: 'reward' }, '🌱 Участок пополнился новым уголком'),
    continueButton(),
  );
  root.replaceChildren(screen);

  // Между делами, не посреди расследования — ровно то место, что разрешает
  // наша политика рекламы.
  await app.ads.interstitial();
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
