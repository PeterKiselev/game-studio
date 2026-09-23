/**
 * Генератор иконки студии. Без единой зависимости: рисуем в буфер,
 * сглаживаем суперсэмплингом и кодируем PNG через встроенный zlib.
 *
 * Запуск: node tools/make-icon.mjs [игра=gomoku]
 * Результат: games/<игра>/store/icons/icon-{576,512,278,200,150,128,64,32}.png
 * 32 — фавикон вкладки браузера, отдельное требование VK (JPG/PNG/GIF, ≤50 КБ)
 * Размеры под VK: 576 — универсальная, 278 — каталог, 150 — маленькая
 *
 * Композиция своя для каждой игры (см. SHADERS ниже), но общая идея одна:
 * иконка должна читаться как кадр самой игры, а не как отдельная картинка,
 * поэтому берём формы и цвета прямо из неё (клетки, отметки, печать).
 */

import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Материалы витрины принадлежат конкретной игре, не студии целиком —
// иначе вторая игра либо перезапишет иконки первой, либо свалится
// в общую кучу без пометки, чья она.
const GAME = process.argv[2] || 'gomoku';
const OUT_DIR = join(ROOT, 'games', GAME, 'store', 'icons');

// --- гомоку: поле три на три, диагональ из трёх кругов (выигрышная линия)
// и один ромб соперника — те же формы, что и в самой игре. -----------------

function makeGomokuShader() {
  const FELT_TOP = [0x24, 0x78, 0x56];
  const FELT_BOTTOM = [0x14, 0x4c, 0x36];
  const GRID = [0xff, 0xff, 0xff];
  const GRID_ALPHA = 0.2;
  const MARK_O = [0xea, 0xf4, 0xee];
  const MARK_X = [0xe8, 0x75, 0x6a];

  const cell = (i) => (2 * i + 1) / 6; // центр клетки i (0..2)
  const LINE_T = 0.020;
  const O_RADIUS = 0.088;
  const O_STROKE = 0.040;
  const X_RADIUS = 0.098;

  const CIRCLES = [
    [cell(0), cell(0)],
    [cell(1), cell(1)],
    [cell(2), cell(2)],
  ];
  const DIAMONDS = [[cell(2), cell(0)]];

  return function shade(x, y) {
    // фон: мягкий вертикальный градиент, чтобы иконка не выглядела плоской
    const t = y;
    let r = FELT_TOP[0] + (FELT_BOTTOM[0] - FELT_TOP[0]) * t;
    let g = FELT_TOP[1] + (FELT_BOTTOM[1] - FELT_TOP[1]) * t;
    let b = FELT_TOP[2] + (FELT_BOTTOM[2] - FELT_TOP[2]) * t;

    // сетка
    const onGrid =
      Math.abs(x - 1 / 3) < LINE_T ||
      Math.abs(x - 2 / 3) < LINE_T ||
      Math.abs(y - 1 / 3) < LINE_T ||
      Math.abs(y - 2 / 3) < LINE_T;
    // линии не доходят до самых краёв — так поле выглядит нарисованным, а не обрезанным
    const inField = x > 0.08 && x < 0.92 && y > 0.08 && y < 0.92;
    if (onGrid && inField) {
      r = r + (GRID[0] - r) * GRID_ALPHA;
      g = g + (GRID[1] - g) * GRID_ALPHA;
      b = b + (GRID[2] - b) * GRID_ALPHA;
    }

    for (const [cx, cy] of CIRCLES) {
      const d = Math.hypot(x - cx, y - cy);
      if (Math.abs(d - O_RADIUS) < O_STROKE / 2) return MARK_O;
    }

    for (const [cx, cy] of DIAMONDS) {
      if (Math.abs(x - cx) + Math.abs(y - cy) < X_RADIUS) return MARK_X;
    }

    return [r, g, b];
  };
}

// --- «Дачные тайны»: печать «дело раскрыто» — кольцо сургучной печати
// и жирная галочка внутри, те же цвета --stamp/--paper/--felt, что и в
// самой игре (games/dachnye-tainy/src/theme.css). Ровно то, что игрок
// видит на развязке после каждого дела, только крупно и по центру. ---------

function makeDachnyeTainyShader() {
  const PAPER_TOP = [0xff, 0xfa, 0xf0]; // --surface
  const PAPER_BOTTOM = [0xf3, 0xed, 0xe0]; // --paper
  const RING = [0x8a, 0x5a, 0x2b]; // --felt
  const STAMP = [0xa8, 0x32, 0x32]; // --stamp

  const CX = 0.5;
  const CY = 0.5;
  const RING_RADIUS = 0.40;
  const RING_STROKE = 0.05;

  // Галочка — две сегмента отрезка, чуть повёрнутые, как в настоящей печати.
  const CHECK_A = [0.30, 0.52];
  const CHECK_B = [0.44, 0.67];
  const CHECK_C = [0.72, 0.30];
  const CHECK_STROKE = 0.10;

  function distToSegment(px, py, [ax, ay], [bx, by]) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  return function shade(x, y) {
    const t = y;
    let r = PAPER_TOP[0] + (PAPER_BOTTOM[0] - PAPER_TOP[0]) * t;
    let g = PAPER_TOP[1] + (PAPER_BOTTOM[1] - PAPER_TOP[1]) * t;
    let b = PAPER_TOP[2] + (PAPER_BOTTOM[2] - PAPER_TOP[2]) * t;

    const distToCheck = Math.min(
      distToSegment(x, y, CHECK_A, CHECK_B),
      distToSegment(x, y, CHECK_B, CHECK_C),
    );
    if (distToCheck < CHECK_STROKE / 2) return STAMP;

    const distToRing = Math.abs(Math.hypot(x - CX, y - CY) - RING_RADIUS);
    if (distToRing < RING_STROKE / 2) return RING;

    return [r, g, b];
  };
}

// --- «Академия Sudoku»: академическая медаль с сеткой 3×3. На малых
// размерах читается как герб курса, на больших — как Sudoku благодаря
// девяти отдельным клеткам. Цвета связывают зелёно-латунный ключевой арт
// со сине-графитовым интерфейсом игры. ------------------------------------

function makeSudokuShader() {
  const PAPER_TOP = [0xf8, 0xf1, 0xdf];
  const PAPER_BOTTOM = [0xe6, 0xd5, 0xad];
  const GREEN = [0x1d, 0x4f, 0x4a];
  const GREEN_DARK = [0x12, 0x38, 0x36];
  const BRASS = [0xc4, 0x8a, 0x35];
  const IVORY = [0xff, 0xfa, 0xec];

  return function shade(x, y) {
    const t = y;
    let color = PAPER_TOP.map((v, i) => v + (PAPER_BOTTOM[i] - v) * t);
    const dx = x - 0.5;
    const dy = y - 0.5;
    const radius = Math.hypot(dx, dy);
    if (radius < 0.43) color = GREEN;
    if (radius > 0.365 && radius < 0.405) color = BRASS;
    if (radius < 0.34) color = GREEN_DARK;

    const left = 0.255;
    const top = 0.255;
    const span = 0.49;
    const cell = span / 3;
    const inside = x >= left && x <= left + span && y >= top && y <= top + span;
    if (inside) {
      const gx = (x - left) / cell;
      const gy = (y - top) / cell;
      const edge = Math.min(gx % 1, 1 - (gx % 1), gy % 1, 1 - (gy % 1));
      if (edge > 0.09) color = IVORY;

      const col = Math.min(2, Math.floor(gx));
      const row = Math.min(2, Math.floor(gy));
      if ((row === 0 && col === 2) || (row === 1 && col === 0) || (row === 2 && col === 1)) {
        if (edge > 0.14) color = BRASS;
      }
    }
    return color;
  };
}

const SHADERS = {
  gomoku: makeGomokuShader,
  'dachnye-tainy': makeDachnyeTainyShader,
  sudoku: makeSudokuShader,
};

const makeShader = SHADERS[GAME];
if (!makeShader) {
  console.error(`Нет композиции иконки для игры «${GAME}». Известные: ${Object.keys(SHADERS).join(', ')}`);
  process.exit(1);
}
const shade = makeShader();

// --- растеризация ---------------------------------------------------------

const SUPERSAMPLE = 4;

function render(size) {
  const out = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SUPERSAMPLE);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = (px * SUPERSAMPLE + sx + 0.5) * step;
          const y = (py * SUPERSAMPLE + sy + 0.5) * step;
          const c = shade(x, y);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }

      const n = SUPERSAMPLE * SUPERSAMPLE;
      const i = (py * size + px) * 4;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
      out[i + 3] = 255;
    }
  }

  return out;
}

// --- кодирование PNG ------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // фильтр None — картинка мелкая, экономить нечего
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 6; // truecolor + alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- запуск ---------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

for (const size of [576, 512, 278, 200, 150, 128, 64, 32]) {
  const png = encodePng(size, render(size));
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`${file}  ${(png.length / 1024).toFixed(1)} КБ`);
}
