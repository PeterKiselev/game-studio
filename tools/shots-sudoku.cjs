/** Реальные кадры «Академии Sudoku» для витрин VK/OK/Яндекс Игр. */
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

const BASE = process.argv[2] || 'https://peterkiselev.github.io/game-studio/sudoku/';
const OUT = join(__dirname, '..', 'games', 'sudoku', 'store', 'shots');
const STORE = { width: 1200, height: 600, deviceScaleFactor: 1 };
const LAUNCH = { width: 600, height: 1200, deviceScaleFactor: 1 };

async function openGame(browser, viewport, colorScheme = 'light') {
  const context = await browser.newContext({ viewport, colorScheme, locale: 'ru-RU' });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.menu', { timeout: 15000 });
  return { context, page };
}

async function shot(page, name) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}

function solveGrid(values) {
  const grid = [...values];
  function valid(index, digit) {
    const row = Math.floor(index / 9);
    const col = index % 9;
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 9; i += 1) {
      if (grid[row * 9 + i] === digit || grid[i * 9 + col] === digit) return false;
      const boxIndex = (boxRow + Math.floor(i / 3)) * 9 + boxCol + (i % 3);
      if (grid[boxIndex] === digit) return false;
    }
    return true;
  }
  function search() {
    const index = grid.indexOf(0);
    if (index < 0) return true;
    for (let digit = 1; digit <= 9; digit += 1) {
      if (!valid(index, digit)) continue;
      grid[index] = digit;
      if (search()) return true;
      grid[index] = 0;
    }
    return false;
  }
  if (!search()) throw new Error('Не удалось решить сетку со страницы');
  return grid;
}

async function solveLikePlayer(page) {
  const cells = page.locator('.sudoku-cell');
  const values = await cells.evaluateAll((nodes) => nodes.map((node) => Number(node.textContent?.trim()) || 0));
  const solution = solveGrid(values);
  for (let index = 0; index < 81; index += 1) {
    if (values[index] !== 0) continue;
    await cells.nth(index).click();
    await page.locator('.digit-btn').filter({ hasText: new RegExp(`^${solution[index]}$`) }).click();
  }
  await page.waitForSelector('.reveal', { timeout: 5000 });
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // Широкие витринные кадры 1200×600.
  {
    const { context, page } = await openGame(browser, STORE);
    await shot(page, 'vk-store-1-menu');
    await page.locator('.academy-card').click();
    await shot(page, 'vk-store-2-academy');
    await context.close();
  }
  {
    const { context, page } = await openGame(browser, STORE);
    await page.locator('.difficulty-card').first().click();
    await page.waitForSelector('.puzzle');
    await page.locator('.sudoku-cell:not(.given)').first().click();
    await page.locator('.tool-btn', { hasText: 'Заметки' }).click();
    await page.locator('.digit-btn', { hasText: '2' }).click();
    await page.locator('.digit-btn', { hasText: '7' }).click();
    await shot(page, 'vk-store-3-puzzle');
    await context.close();
  }

  // Портретные кадры запуска мини-приложения 600×1200.
  {
    const { context, page } = await openGame(browser, LAUNCH);
    await shot(page, 'vk-launch-1-menu');
    await page.locator('.academy-card').click();
    await shot(page, 'vk-launch-2-academy');
    await page.locator('.lesson-card').first().click();
    await shot(page, 'vk-launch-3-lesson');
    await context.close();
  }
  {
    const { context, page } = await openGame(browser, LAUNCH, 'dark');
    await page.locator('.difficulty-card').first().click();
    await page.waitForSelector('.puzzle');
    await page.locator('.sudoku-cell:not(.given)').first().click();
    await page.locator('.tool-btn', { hasText: 'Заметки' }).click();
    await page.locator('.digit-btn', { hasText: '2' }).click();
    await page.locator('.digit-btn', { hasText: '7' }).click();
    await shot(page, 'vk-launch-4-puzzle-dark');
    await context.close();
  }
  {
    const { context, page } = await openGame(browser, LAUNCH);
    await page.locator('.difficulty-card').first().click();
    await page.waitForSelector('.puzzle');
    await solveLikePlayer(page);
    await shot(page, 'vk-launch-5-mastery');
    await context.close();
  }

  await browser.close();
})().catch((error) => {
  console.error('Не удалось снять Sudoku:', error.message);
  process.exit(1);
});
