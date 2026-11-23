// Сквозная проверка сайта в настоящем браузере (Playwright). Код возврата 77 — Playwright недоступен (тест пропускается).
const assert = require('assert');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('playwright не найден'); process.exit(77); }

const URL = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const offline = async (page) => page.route('**/*', (r) => {
  const u = r.request().url();
  (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort();
});

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await offline(page);
  await page.goto(URL);
  await page.waitForSelector('#runBtn');

  if (process.env.E2E_VERBOSE) console.log('шаг 1: движок и запуск программы по умолчанию');
  // 1. движок и запуск программы по умолчанию
  await page.waitForFunction(() => /готов/i.test(document.querySelector('#engineText').textContent));
  await page.click('#runBtn');
  await page.waitForSelector('#consoleBody .stdout');
  assert.strictEqual(await page.textContent('#consoleBody .stdout'), 'Сәлем, Әлем!\nҚазір 2026 жыл.\n13.14\n20 3 1 100\n');
  assert.match(await page.textContent('#syntax'), /Синтаксис в порядке/);

  if (process.env.E2E_VERBOSE) console.log('шаг 2: синтаксическая ошибка «на лету»');
  // 2. синтаксическая ошибка «на лету»
  await page.click('#code');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('айным x = 10\nжаз(x).');
  await page.waitForFunction(() => /Строка 1/.test(document.querySelector('#syntax').textContent));

  if (process.env.E2E_VERBOSE) console.log('шаг 3: авто-отступ после двоеточия');
  // 3. авто-отступ после двоеточия
  await page.keyboard.press('Control+A');
  await page.keyboard.type('функ f(n):\nегер n <= 1:\nқайтар 1.');
  assert.strictEqual(await page.inputValue('#code'), 'функ f(n):\n    егер n <= 1:\n        қайтар 1.');

  if (process.env.E2E_VERBOSE) console.log('шаг 4: ошибка выполнения: карточка, подчёркивание, подсветка строки');
  // 4. ошибка выполнения: карточка, подчёркивание, подсветка строки
  await page.keyboard.press('Control+A');
  await page.keyboard.type('жаз(1).\nжаз(1 / 0).');
  await page.keyboard.press('Control+Enter');
  await page.waitForSelector('#consoleBody .errcard');
  assert.match(await page.textContent('#consoleBody .errcard'), /деление на ноль/);
  assert.ok((await page.$$('.t-bad')).length >= 1, 'нет подчёркивания ошибки');
  assert.strictEqual(await page.$$eval('.ln.err', (e) => e.length), 1);

  if (process.env.E2E_VERBOSE) console.log('шаг 5: оба написания ключевых слов');
  // 5. оба написания ключевых слов
  await page.evaluate((c) => window.__qazaq.setCode(c), 'айнымалы а = 2.\nфункция кв(x):\n    қайтар x * x.\nжаз(кв(а)).');
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => document.querySelector('#consoleBody .stdout') && document.querySelector('#consoleBody .stdout').textContent === '4\n');

  if (process.env.E2E_VERBOSE) console.log('шаг 6: остановка долгой программы');
  // 6. остановка долгой программы
  await page.evaluate((c) => window.__qazaq.setCode(c), 'әзір ақиқат:\n    айным x = факториал(3000).');
  await page.click('#runBtn');
  await page.waitForSelector('#stopBtn:not([hidden])', { timeout: 4000 });
  await page.click('#stopBtn');
  await page.waitForFunction(() => document.querySelector('#runBtn') && !document.querySelector('#runBtn').disabled);
  assert.match(await page.textContent('#statusChip'), /Остановлено/);

  if (process.env.E2E_VERBOSE) console.log('шаг 7: примеры: запускаются все');
  // 7. примеры: запускаются все
  const count = await page.$$eval('#exampleSel option', (o) => o.length);
  assert.ok(count >= 9, 'мало примеров: ' + count);
  for (let i = 1; i < count; i++) {
    await page.selectOption('#exampleSel', { index: i });
    await page.click('#runBtn');
    await page.waitForFunction(() => { const c = document.querySelector('#statusChip'); return c && !c.hidden && c.textContent !== 'Идёт'; });
    assert.match(await page.textContent('#statusChip'), /Успешно/, 'пример #' + i);
  }

  if (process.env.E2E_VERBOSE) console.log('шаг 8: автодополнение');
  // 8. автодополнение
  await page.click('#code'); await page.keyboard.press('Control+A'); await page.keyboard.type('сұр');
  await page.waitForSelector('#ac:not([hidden])');
  await page.keyboard.press('Escape');

  if (process.env.E2E_VERBOSE) console.log('шаг 9: разделы');
  // 9. разделы
  assert.strictEqual(await page.$$eval('#cards .card', (c) => c.length), 6);
  assert.strictEqual(await page.$$eval('#tourTabs .tab', (c) => c.length), 9);
  assert.strictEqual(await page.$$eval('#kwBody tr', (c) => c.length), 22);
  assert.ok((await page.$$eval('#libGrid .fn', (c) => c.length)) >= 42);
  assert.strictEqual(await page.$$eval('#cards .result .errcard', (c) => c.length), 1);
  await page.fill('#libSearch', 'сұрып');
  assert.ok((await page.$$eval('#libGrid .fn', (c) => c.length)) >= 1);
  await page.fill('#libSearch', '');
  await page.click('#tourTabs .tab:has-text("Списки и словари")');
  assert.match(await page.textContent('#tourPanel .result pre'), /Астана: 1,350,000/);

  if (process.env.E2E_VERBOSE) console.log('шаг 10: демо-терминал печатает и показывает вывод');
  // 10. демо-терминал печатает и показывает вывод
  await page.waitForFunction(() => { const o = document.querySelector('#demoOut'); return o && !o.hidden && o.textContent.length > 0; }, null, { timeout: 12000 });

  if (process.env.E2E_VERBOSE) console.log('шаг 11: язык и тема');
  // 11. язык и тема
  await page.click('#langBtn');
  assert.strictEqual(await page.textContent('#runText'), 'Іске қосу');
  await page.click('#themeBtn');
  assert.ok(['dark', 'light'].includes(await page.evaluate(() => document.documentElement.dataset.theme)));

  if (process.env.E2E_VERBOSE) console.log('шаг 12: мобильная версия');
  // 12. мобильная версия
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push('mobile: ' + e.message));
  await offline(mp);
  await mp.goto(URL);
  await mp.waitForSelector('#runBtn');
  await mp.click('#runBtn');
  await mp.waitForSelector('#consoleBody .stdout');
  assert.strictEqual(await mp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'горизонтальная прокрутка на мобильном');

  assert.deepStrictEqual(errors, [], 'ошибки страницы: ' + errors.join('; '));
  await browser.close();
  console.log('E2E OK');
})().catch((e) => { console.error('E2E FAIL:', e.message); process.exit(1); });
