/**
 * Генератор иконки студии. Без единой зависимости: рисуем в буфер,
 * сглаживаем суперсэмплингом и кодируем PNG через встроенный zlib.
 *
 * Запуск: node tools/make-icon.mjs
 * Результат: static/icons/icon-{512,278,128,64}.png
 *
 * Композиция: поле три на три, диагональ из трёх кругов (выигрышная линия)
 * и один ромб соперника. Круг и ромб — те же формы, что и в самой игре,
 * поэтому иконка читается как её кадр, а не как отдельная картинка.
 */

import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'static', 'icons');

// --- палитра студии -------------------------------------------------------

const FELT_TOP = [0x24, 0x78, 0x56];
const FELT_BOTTOM = [0x14, 0x4c, 0x36];
const GRID = [0xff, 0xff, 0xff];
const GRID_ALPHA = 0.2;
const MARK_O = [0xea, 0xf4, 0xee];
const MARK_X = [0xe8, 0x75, 0x6a];

// --- геометрия в единичных координатах ------------------------------------

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

function shade(x, y) {
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
}

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

for (const size of [512, 278, 200, 128, 64]) {
  const png = encodePng(size, render(size));
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`${file}  ${(png.length / 1024).toFixed(1)} КБ`);
}
