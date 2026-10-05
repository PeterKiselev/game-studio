import { el, initTheme } from '@studio/ui';
import { PackingGame } from './game';
import type { TapResult } from './game';
import { glyphSvg } from './glyphs';
import { DICTS, detectLocale } from './i18n';
import type { Locale } from './i18n';
import { ORDERS, ORDER_IDS } from './orders';
import { bounds, footprint, rotateCells } from './rules';
import type { ItemDef, Kind } from './rules';
import { appendLog, loadCompleted, saveCompleted } from './storage';
import type { KV, LogEventName } from './storage';
import './theme.css';
import './style.css';

const KIND_MARK: Record<Kind, string> = { fragile: '◇', heavy: '■', plain: '○' };

function safeStorage(): KV | null {
  try {
    const s = window.localStorage;
    s.getItem('packing-proto:probe');
    return s;
  } catch {
    return null;
  }
}

const storage = safeStorage();
const locale: Locale = detectLocale(window.location.search, navigator.language || 'en');
const t = DICTS[locale];
document.documentElement.lang = locale;
document.title = t.title;
initTheme();

const root = document.getElementById('app')!;
const completedIds: string[] = loadCompleted(storage, ORDER_IDS);

let orderIndex = Math.max(0, ORDERS.findIndex((o) => !completedIds.includes(o.id)));
let game = new PackingGame(ORDERS[orderIndex]);
let hover: { x: number; y: number } | null = null;
let statusText = t.hintStart;

function log(e: LogEventName): void {
  appendLog(storage, { t: Math.round(performance.now()), e, order: ORDERS[orderIndex].id });
}

const isUnlocked = (index: number): boolean =>
  index === 0 || completedIds.includes(ORDERS[index].id) || completedIds.includes(ORDERS[index - 1].id);

// --- каркас экрана, который не пересоздаётся при каждом ходе -----------------

const title = el('h1', { class: 'title' }, t.title);
const nav = el('nav', { class: 'order-nav' });
nav.setAttribute('aria-label', t.title);
const goalLine = el('p', { class: 'goal' });
const ruleLine = el('p', { class: 'rule' });
const board = el('div', { class: 'board' });
board.setAttribute('role', 'group');
board.setAttribute('aria-label', t.boardLabel);
const tray = el('div', { class: 'tray' });
const trayHead = el('div', { class: 'tray-head' }, t.tray);
const rotateBtn = el('button', { class: 'btn primary rotate-btn', type: 'button' }, `↻ ${t.rotate}`);
const putDownBtn = el('button', { class: 'btn ghost put-down-btn', type: 'button' }, t.deselect);
const resetBtn = el('button', { class: 'btn ghost reset-btn', type: 'button' }, t.reset);
const status = el('p', { class: 'status' });
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');
const nextBtn = el('button', { class: 'btn primary next-btn', type: 'button' }, t.next);
const result = el('div', { class: 'result' }, nextBtn);
result.hidden = true;

const legend = el('div', { class: 'legend' });
for (const kind of ['fragile', 'heavy', 'plain'] as const) {
  legend.append(el('span', { class: `kind-badge k-${kind}` }, `${KIND_MARK[kind]} ${t.kinds[kind]}`));
}

root.replaceChildren(
  el(
    'div',
    { class: 'screen packing' },
    el('header', { class: 'topbar' }, title, el('span', { class: 'spacer' }), nav),
    el('section', { class: 'brief' }, goalLine, ruleLine, legend),
    el(
      'div',
      { class: 'play' },
      el('div', { class: 'board-wrap' }, board),
      el(
        'div',
        { class: 'side' },
        trayHead,
        tray,
        el('div', { class: 'actions' }, rotateBtn, putDownBtn, resetBtn),
        status,
        result,
      ),
    ),
  ),
);

// --- построение доски под текущий заказ ------------------------------------

let cellButtons: HTMLButtonElement[] = [];

function buildBoard(): void {
  const { width, height } = game.order;
  board.style.setProperty('--cols', String(width));
  board.style.setProperty('--rows', String(height));
  (board.parentElement as HTMLElement).style.setProperty('--cols', String(width));
  (board.parentElement as HTMLElement).style.setProperty('--rows', String(height));
  cellButtons = [];
  const nodes: HTMLButtonElement[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const btn = el('button', { class: 'cell', type: 'button' });
      btn.setAttribute('data-x', String(x));
      btn.setAttribute('data-y', String(y));
      btn.addEventListener('click', () => handleTap(x, y));
      btn.addEventListener('mouseenter', () => setHover({ x, y }));
      btn.addEventListener('focus', () => setHover({ x, y }));
      cellButtons.push(btn);
      nodes.push(btn);
    }
  }
  board.replaceChildren(...nodes);
}

board.addEventListener('mouseleave', () => setHover(null));

function setHover(next: { x: number; y: number } | null): void {
  hover = next;
  paintBoard();
}

// --- отрисовка состояния ----------------------------------------------------

function itemName(id: string): string {
  return t.items[id] ?? id;
}

function paintNav(): void {
  const chips = ORDERS.map((order, index) => {
    const done = completedIds.includes(order.id);
    const label = `${index + 1}${done ? ' ✓' : ''}`;
    const chip = el('button', { class: 'order-chip', type: 'button' }, label);
    chip.setAttribute('data-order', order.id);
    chip.setAttribute('aria-label', `${t.orderOf(index + 1, ORDERS.length)}${done ? `, ${t.doneMark}` : ''}`);
    if (index === orderIndex) chip.setAttribute('aria-current', 'step');
    const unlocked = isUnlocked(index);
    chip.disabled = !unlocked;
    if (!unlocked) chip.title = t.lockedOrder;
    chip.classList.toggle('done', done);
    chip.addEventListener('click', () => openOrder(index));
    return chip;
  });
  nav.replaceChildren(...chips);
}

function paintBoard(): void {
  const eval_ = game.evaluation();
  const conflictIds = new Set(eval_.touches.flat());
  const ownerOf = new Map<string, string>();
  const glyphAt = new Map<string, string>();
  for (const p of game.placements) {
    const item = game.item(p.itemId);
    const cells = footprint(item, p);
    cells.forEach(([cx, cy], i) => {
      ownerOf.set(`${cx},${cy}`, p.itemId);
      if (i === 0) glyphAt.set(`${cx},${cy}`, p.itemId);
    });
  }

  const preview = hover ? game.previewAt(hover.x, hover.y) : null;
  const ghost = new Map<string, boolean>();
  if (preview) {
    const ok = preview.problem === null;
    for (const [gx, gy] of footprint(game.item(preview.placement.itemId), preview.placement)) {
      ghost.set(`${gx},${gy}`, ok);
    }
  }

  const { width, height } = game.order;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const btn = cellButtons[y * width + x];
      const key = `${x},${y}`;
      const id = ownerOf.get(key);
      const kind = id ? game.item(id).kind : null;
      const same = (dx: number, dy: number): boolean => ownerOf.get(`${x + dx},${y + dy}`) === id;

      btn.className = 'cell';
      if (id && kind) {
        btn.classList.add('filled', `k-${kind}`);
        if (!same(0, -1)) btn.classList.add('edge-t');
        if (!same(1, 0)) btn.classList.add('edge-r');
        if (!same(0, 1)) btn.classList.add('edge-b');
        if (!same(-1, 0)) btn.classList.add('edge-l');
        if (conflictIds.has(id)) btn.classList.add('conflict');
      }
      if (ghost.has(key)) btn.classList.add(ghost.get(key) ? 'ghost-ok' : 'ghost-bad');

      // Содержимое клетки подменяем только когда оно действительно изменилось.
      // Иначе наведение или фокус от самого нажатия перерисовывали бы значок
      // между mousedown и mouseup — браузер терял клик, и уложенный предмет
      // нельзя было взять мышью, нажав на его значок.
      const glyphOwner = glyphAt.get(key);
      const warn = Boolean(id && conflictIds.has(id) && glyphOwner);
      const signature = `${glyphOwner ?? ''}|${warn ? 1 : 0}`;
      if (btn.getAttribute('data-sig') !== signature) {
        btn.innerHTML = (glyphOwner ? glyphSvg(glyphOwner) : '') + (warn ? '<span class="warn" aria-hidden="true">!</span>' : '');
        btn.setAttribute('data-sig', signature);
      }

      const content = id ? `${itemName(id)} (${t.kinds[kind as Kind].toLowerCase()})` : t.empty;
      btn.setAttribute('aria-label', t.cellLabel(y + 1, x + 1, content));
    }
  }
}

function miniItem(item: ItemDef, rot: number): HTMLElement {
  const cells = rotateCells(item.cells, rot);
  const { w, h } = bounds(cells);
  const mini = el('div', { class: 'mini' });
  mini.style.setProperty('--mw', String(w));
  mini.style.setProperty('--mh', String(h));
  cells.forEach(([cx, cy], i) => {
    const cell = el('div', { class: `mini-cell k-${item.kind}` });
    cell.style.gridColumn = String(cx + 1);
    cell.style.gridRow = String(cy + 1);
    if (i === 0) cell.innerHTML = glyphSvg(item.id);
    mini.append(cell);
  });
  return mini;
}

function paintTray(): void {
  const ids = game.trayIds();
  if (ids.length === 0) {
    tray.replaceChildren(el('p', { class: 'tray-empty' }, t.trayEmpty));
  } else {
    tray.replaceChildren(
      ...ids.map((id) => {
        const item = game.item(id);
        const held = game.heldId === id;
        const btn = el(
          'button',
          { class: `tray-item${held ? ' held' : ''}`, type: 'button' },
          miniItem(item, game.rotationOf(id)),
          el('span', { class: 'tray-name' }, itemName(id)),
          el('span', { class: `kind-mark k-${item.kind}` }, `${KIND_MARK[item.kind]} ${t.kinds[item.kind]}`),
        );
        btn.setAttribute('data-item', id);
        btn.setAttribute('aria-pressed', String(held));
        btn.addEventListener('click', () => {
          game.select(id);
          statusText = game.heldId ? t.holding(itemName(id), t.kinds[item.kind]) : t.hintStart;
          paint();
        });
        return btn;
      }),
    );
  }
}

function paintControls(): void {
  const held = game.heldId !== null;
  rotateBtn.disabled = !held || game.completed;
  putDownBtn.disabled = !held;
  putDownBtn.hidden = !held;
  goalLine.textContent = `${t.orderOf(orderIndex + 1, ORDERS.length)}. ${t.goal(game.order.items.length)}`;
  ruleLine.textContent = t.rule;
  status.textContent = statusText;
  const last = orderIndex === ORDERS.length - 1;
  result.hidden = !game.completed;
  nextBtn.textContent = last ? t.backToStart : t.next;
}

function paint(): void {
  paintNav();
  paintBoard();
  paintTray();
  paintControls();
}

// --- действия ---------------------------------------------------------------

function describe(result_: TapResult): void {
  if (result_.type === 'rejected') {
    statusText = t.occupied;
    return;
  }
  if (result_.type === 'picked') {
    statusText = t.picked(itemName(result_.itemId));
    return;
  }
  if (result_.type !== 'placed') return;

  const ev = result_.evaluation;
  if (result_.first) log('first_place');
  if (ev.complete) {
    const id = game.order.id;
    if (!completedIds.includes(id)) completedIds.push(id);
    saveCompleted(storage, completedIds);
    log('order_complete');
    statusText = orderIndex === ORDERS.length - 1 ? `${t.completeAll} ${t.allDone}` : t.complete;
    return;
  }
  if (ev.touches.length > 0) {
    const [fragileId, heavyId] = ev.touches[0];
    statusText = t.touching(itemName(fragileId), itemName(heavyId));
    return;
  }
  statusText = t.placedMore(ev.missing.length);
}

function handleTap(x: number, y: number): void {
  describe(game.tapCell(x, y));
  // На сенсорном экране mouseleave не приходит — без сброса призрак предыдущего
  // касания висел бы над следующим предметом.
  hover = null;
  paint();
  // На телефоне панель с кнопкой «Следующий заказ» оказывается ниже экрана.
  if (game.completed) result.scrollIntoView({ block: 'nearest' });
}

function openOrder(index: number, event: LogEventName | null = null): void {
  if (!isUnlocked(index)) return;
  orderIndex = index;
  game = new PackingGame(ORDERS[index]);
  hover = null;
  statusText = t.hintStart;
  buildBoard();
  if (event) log(event);
  log('order_start');
  paint();
}

rotateBtn.addEventListener('click', () => {
  if (game.rotate()) paint();
});
putDownBtn.addEventListener('click', () => {
  game.deselect();
  statusText = t.hintStart;
  paint();
});
resetBtn.addEventListener('click', () => {
  game.reset();
  hover = null;
  statusText = t.hintStart;
  log('order_reset');
  paint();
});
nextBtn.addEventListener('click', () => {
  const last = orderIndex === ORDERS.length - 1;
  openOrder(last ? 0 : orderIndex + 1, 'next_order');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'r' || event.key === 'R') {
    if (game.rotate()) paint();
  } else if (event.key === 'Escape' && game.heldId) {
    game.deselect();
    statusText = t.hintStart;
    paint();
  }
});

openOrder(orderIndex);
