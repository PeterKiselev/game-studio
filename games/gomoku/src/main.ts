import { GameApp } from '@studio/game-kit';
import { GOMOKU, TIC_TAC_TOE, bestMove, createGame, play, undo } from '@studio/rules';
import type { GameState, Level, RulesConfig } from '@studio/rules';
import { cycleTheme, dialog, el, toast } from '@studio/ui';
import { BoardView } from './board';
import './style.css';

type ModeId = 'tic3' | 'five' | 'duo';

interface Mode {
  id: ModeId;
  title: string;
  cfg: RulesConfig;
  bot: boolean;
}

const MODES: Record<ModeId, Mode> = {
  tic3: { id: 'tic3', title: 'Крестики-нолики', cfg: TIC_TAC_TOE, bot: true },
  five: { id: 'five', title: 'Пять в ряд', cfg: GOMOKU, bot: true },
  duo: { id: 'duo', title: 'Вдвоём на одном устройстве', cfg: GOMOKU, bot: false },
};

interface Save {
  games: number;
  wins: number;
  draws: number;
  level: Level;
  lastMode: ModeId;
}

const DEFAULTS: Save = { games: 0, wins: 0, draws: 0, level: 2, lastMode: 'tic3' };

const root = document.getElementById('app')!;
const board = new BoardView(handlePick);

// Не top-level await: он требует target es2022, а мы целимся в es2020,
// чтобы игра открывалась на старых телефонах и вебвью соцсетей.
let app!: GameApp<Save>;
let state: GameState = createGame(TIC_TAC_TOE);
let mode: Mode = MODES.tic3;
let thinking = false;

/* Пауза на время рекламы: поле блокируется, чтобы клик «сквозь» ролик не прошёл. */
document.addEventListener('studio:pause', () => board.setLocked(true));
document.addEventListener('studio:resume', () => board.setLocked(false));

async function main(): Promise<void> {
  app = await GameApp.boot<Save>({
    gameId: 'gomoku',
    defaults: DEFAULTS,
    adPolicy: { firstAdAfterRounds: 2, minSecondsBetween: 180 },
  });

  mode = MODES[app.save.data.lastMode] ?? MODES.tic3;
  showMenu();
  app.ready(); // меню на экране и кликабельно — только теперь снимаем лоадер площадки
}

void main();

// --- экраны -----------------------------------------------------------------

function showMenu(): void {
  const s = app.save.data;
  const winRate = s.games ? Math.round((s.wins / s.games) * 100) : 0;

  const menu = el(
    'div',
    { class: 'screen menu' },
    el('h1', {}, 'Пять в ряд'),
    el(
      'div',
      { class: 'stats' },
      el('div', {}, el('b', {}, String(s.games)), el('span', {}, 'партий')),
      el('div', {}, el('b', {}, String(s.wins)), el('span', {}, 'побед')),
      el('div', {}, el('b', {}, `${winRate}%`), el('span', {}, 'доля побед')),
    ),
  );

  for (const item of Object.values(MODES)) {
    menu.append(button(item.title, () => startGame(item), item.id === s.lastMode ? 'primary' : ''));
  }

  menu.append(
    button(`Сложность: ${levelName(s.level)}`, (btn) => {
      const next = ((s.level % 3) + 1) as Level;
      app.save.data.level = next;
      app.save.markDirty();
      btn.textContent = `Сложность: ${levelName(next)}`;
    }, 'ghost'),
    button('Оформление', () => cycleTheme(), 'ghost'),
  );

  root.replaceChildren(menu);
}

function startGame(next: Mode): void {
  mode = next;
  app.save.data.lastMode = next.id;
  app.save.markDirty();

  state = createGame(next.cfg);
  thinking = false;

  const status = el('div', { class: 'status' });
  const undoBtn = button('Отменить ход', onUndo, 'ghost');
  const controls = el('div', { class: 'controls' }, undoBtn, button('В меню', showMenu, 'ghost'));

  const screen = el(
    'div',
    { class: 'screen play' },
    el(
      'div',
      { class: 'topbar' },
      el('span', { class: 'title' }, next.title),
      el('span', { class: 'spacer' }),
      button('Заново', () => startGame(next), 'ghost'),
    ),
    status,
    board.root,
    controls,
  );

  root.replaceChildren(screen);
  app.startRound();

  redraw = () => {
    board.render(state);
    status.replaceChildren(
      el('span', { class: `dot s${state.turn}` }),
      el('span', {}, statusText()),
    );
    undoBtn.disabled = state.moves.length === 0 || thinking;
  };
  redraw();
}

let redraw: () => void = () => {};

function statusText(): string {
  if (state.outcome === 3) return 'Ничья';
  if (state.outcome !== 0) {
    if (!mode.bot) return `Победа игрока ${state.outcome}`;
    return state.outcome === 1 ? 'Вы победили' : 'Победил соперник';
  }
  if (!mode.bot) return `Ход игрока ${state.turn}`;
  return state.turn === 1 ? 'Ваш ход' : 'Соперник думает…';
}

// --- игровой цикл -----------------------------------------------------------

function handlePick(index: number): void {
  if (thinking || state.outcome !== 0) return;
  if (mode.bot && state.turn !== 1) return;

  const next = play(state, index);
  if (next === state) return;
  state = next;
  redraw();

  if (state.outcome !== 0) return void finish();

  if (mode.bot) {
    thinking = true;
    redraw();
    // Пауза не техническая, а «человеческая»: мгновенный ответ бота ощущается дёшево.
    setTimeout(() => {
      state = play(state, bestMove(state, app.save.data.level));
      thinking = false;
      redraw();
      if (state.outcome !== 0) void finish();
    }, 260);
  }
}

function onUndo(): void {
  if (thinking || state.moves.length === 0) return;
  state = undo(state, mode.bot ? 2 : 1);
  redraw();
}

async function finish(): Promise<void> {
  const s = app.save.data;
  s.games += 1;
  if (state.outcome === 3) s.draws += 1;
  else if (state.outcome === 1 || !mode.bot) s.wins += 1;
  app.save.markDirty();

  await app.endRound();

  const lost = mode.bot && state.outcome === 2;
  const title = state.outcome === 3 ? 'Ничья' : lost ? 'Поражение' : 'Победа';

  // Награда за рекламу предлагается только там, где она игроку правда нужна.
  const canOfferUndo = lost && app.ads.rewardedAvailable;

  const actions = [
    ...(canOfferUndo
      ? [{ label: 'Отменить два хода за рекламу', value: 'reward', kind: 'reward' as const }]
      : []),
    { label: 'Ещё партия', value: 'again', kind: 'primary' as const },
    { label: 'В меню', value: 'menu' as const },
  ];

  const choice = await dialog({ title, text: statusText(), actions });

  if (choice === 'reward') {
    const granted = await app.offerReward('undo-after-loss');
    if (granted) {
      state = undo(state, 2);
      redraw();
      toast('Два хода отменены');
      app.startRound();
    } else {
      toast('Реклама не загрузилась — награда не начислена');
      void finish();
    }
    return;
  }

  if (choice === 'again') {
    await app.ads.interstitial(); // политика сама решит, показывать или промолчать
    startGame(mode);
    return;
  }

  showMenu();
}

// --- мелочи -----------------------------------------------------------------

function button(
  label: string,
  onClick: (btn: HTMLButtonElement) => void,
  kind = '',
): HTMLButtonElement {
  const btn = el('button', { class: `btn ${kind}`.trim(), type: 'button' }) as HTMLButtonElement;
  btn.textContent = label;
  btn.addEventListener('click', () => onClick(btn));
  return btn;
}

function levelName(level: Level): string {
  return level === 1 ? 'лёгкая' : level === 2 ? 'обычная' : 'сложная';
}
