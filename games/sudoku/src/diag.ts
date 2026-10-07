/**
 * Диагностика для проверки на настоящем ВКонтакте — включается только адресом
 * с `diag=1` (в строке запроса или после #). Обычные игроки её не видят и
 * поведение игры не меняется: без флага модуль ничего не делает.
 *
 * Зачем она нужна. Модератор VK сообщил, что после рекламы вёрстка ломается.
 * Реальную рекламу и реальное изменение области просмотра внутри VK заглушкой
 * не воспроизвести, поэтому на настоящей площадке игра сама записывает:
 * когда началась и закончилась реклама, чем она закончилась, как менялся
 * размер окна — и после каждого события проверяет, не пересеклись ли блоки
 * экрана партии. Результат виден на экране и годится как скриншот.
 */
import type { IPlatform } from '@studio/platform';

/** Блоки, которые не имеют права пересекаться (те же пары, что в playtest-sudoku). */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['.puzzle .topbar', '.sudoku-grid'],
  ['.stats-bar', '.sudoku-grid'],
  ['.sudoku-grid', '.numpad'],
  ['.sudoku-grid', '.hint-bar'],
  ['.numpad', '.hint-bar'],
];

export function diagEnabled(): boolean {
  return /[?&#]diag=1(?:&|$)/.test(location.search + location.hash);
}

/** Для проверки в тестах: чистая геометрия пересечения двух прямоугольников. */
export function overlapPx(a: DOMRect, b: DOMRect): number {
  const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return ix > 1 && iy > 1 ? Math.round(iy) : 0;
}

function geometryVerdict(): string {
  const grid = document.querySelector('.sudoku-grid');
  if (!grid) return 'нет экрана партии';
  const problems: string[] = [];
  for (const [a, b] of PAIRS) {
    const ea = document.querySelector(a);
    const eb = document.querySelector(b);
    if (!ea || !eb) continue;
    const ra = ea.getBoundingClientRect();
    const rb = eb.getBoundingClientRect();
    if (ra.width === 0 || rb.width === 0) continue;
    const o = overlapPx(ra, rb);
    if (o > 0) problems.push(`${a}×${b} ${o}px`);
  }
  const g = grid.getBoundingClientRect();
  if (g.right > window.innerWidth + 1 || g.left < -1) problems.push('сетка шире окна');
  if (document.documentElement.scrollWidth > window.innerWidth + 1) problems.push('горизонтальная прокрутка');
  return problems.length ? 'ПЕРЕСЕЧЕНИЕ: ' + problems.join('; ') : 'блоки не пересекаются';
}

export function installDiag(platform: IPlatform): void {
  if (!diagEnabled()) return;

  const box = document.createElement('pre');
  box.setAttribute('data-diag', '');
  box.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:99999;margin:0;padding:4px 6px;max-height:34vh;' +
    'overflow:hidden;pointer-events:none;font:10px/1.25 monospace;color:#0f0;background:rgba(0,0,0,.78);white-space:pre-wrap';
  document.body.appendChild(box);

  const lines: string[] = [];
  const t0 = Date.now();
  const size = (): string => {
    const vv = window.visualViewport;
    return `${window.innerWidth}×${window.innerHeight}` + (vv ? ` vv${Math.round(vv.width)}×${Math.round(vv.height)}` : '');
  };
  const log = (event: string): void => {
    lines.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${event} | окно ${size()} | ${geometryVerdict()}`);
    while (lines.length > 12) lines.shift();
    box.textContent = `diag ${platform.id}\n` + lines.join('\n');
    console.info(`[diag] ${lines[lines.length - 1]}`);
  };

  // resize и visualViewport приходят пачкой — склеиваем в одну запись.
  let timer = 0;
  const pending = new Set<string>();
  const later = (event: string): void => {
    pending.add(event);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      log([...pending].join('+'));
      pending.clear();
    }, 150);
  };
  window.addEventListener('resize', () => later('resize'));
  window.visualViewport?.addEventListener('resize', () => later('visualViewport'));
  document.addEventListener('studio:pause', () => log('реклама: пауза'));
  document.addEventListener('studio:resume', () => {
    log('реклама: конец');
    // Платформа возвращает размер окна не мгновенно — смотрим ещё раз позже.
    window.setTimeout(() => log('через 1 с после рекламы'), 1000);
    window.setTimeout(() => log('через 3 с после рекламы'), 3000);
  });

  // Итог показа: shown/no-fill/error и длительность — в самой рекламной обвязке их не видно.
  const ads = platform.ads as unknown as Record<string, (...a: unknown[]) => Promise<{ shown: boolean; reason?: string }>>;
  for (const kind of ['interstitial', 'rewarded'] as const) {
    const original = ads[kind].bind(platform.ads);
    ads[kind] = async (...args: unknown[]) => {
      const started = Date.now();
      const res = await original(...args);
      log(`${kind}: shown=${res.shown}${res.reason ? ' ' + res.reason : ''} за ${Date.now() - started} мс`);
      return res;
    };
  }

  // Только ИМЕНА параметров запуска, без значений: в значениях бывает подпись.
  const paramNames = [...new URLSearchParams(location.search).keys()].join(',');
  log(`параметры запуска: ${paramNames || 'нет'}`);
  log(`старт, caps: interstitial=${platform.caps.interstitial} rewarded=${platform.caps.rewarded} payments=${platform.caps.payments}`);
}
