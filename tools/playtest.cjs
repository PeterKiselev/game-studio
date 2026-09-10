/**
 * Автопрохождение вертикального среза «Дачных тайн» — не картинка,
 * а реальный клик по реальным кнопкам через настоящий движок. Если тут
 * что-то сломано, скриншот это покажет, а не только зелёные тесты рассуждения.
 */
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

const BASE = process.argv[2] || 'http://127.0.0.1:4175/';
const OUT = join(__dirname, '..', 'tools', '_playtest');

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 800 } });

  const logs = [];
  page.on('console', (msg) => {
    if (msg.text().startsWith('[analytics]')) logs.push(msg.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.plot');
  await page.screenshot({ path: join(OUT, '1-plot.png') });

  await page.getByRole('button', { name: /Ждёт расследования/ }).click();
  await page.waitForSelector('.case');
  await page.screenshot({ path: join(OUT, '2-case-empty.png') });

  // Кликаем клетки, соответствующие настоящему решению tutorialCase:
  // Ирина — грядка/лейка, Михаил — беседка/пирог, Олег — калитка/зонт.
  const clickCell = async (rowLabel, colLabel) => {
    const btn = page.locator(`button[aria-label="${rowLabel} — ${colLabel}"]`).first();
    if ((await btn.count()) === 0) {
      const alt = page.locator(`button[aria-label="${colLabel} — ${rowLabel}"]`).first();
      await alt.click();
      return;
    }
    await btn.click();
  };

  await clickCell('Ирина', 'грядка');
  await clickCell('Михаил', 'беседка');
  await clickCell('Олег', 'калитка');
  await page.screenshot({ path: join(OUT, '3-case-partial.png') });

  // Подсказку — проверить, что она вообще работает и не требует рекламы на первый раз.
  await page.getByRole('button', { name: /Подсказка/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '4-case-hint.png') });

  await clickCell('Ирина', 'лейка');
  await clickCell('Михаил', 'пирог');
  await clickCell('Олег', 'зонт');
  await page.waitForTimeout(700); // авто-переход на развязку
  await page.screenshot({ path: join(OUT, '5-reveal.png') });

  await browser.close();

  console.log('--- события аналитики ---');
  for (const l of logs) console.log(l);
  console.log('готово:', OUT);
})().catch((err) => {
  console.error('плейтест упал:', err.message);
  process.exit(1);
});
