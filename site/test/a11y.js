// Аудит доступности сайта (axe-core, WCAG 2 A и AA) в светлой и тёмной темах, на десктопе и телефоне.
// Код возврата 77 — Playwright или axe-core недоступны (тест пропускается).
const path = require('path');
const fs = require('fs');
let chromium, axeSrc;
try { ({ chromium } = require('playwright')); axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); }
catch (e) { console.log('playwright или axe-core не найдены'); process.exit(77); }
const URL = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  for (const [label, scheme, w, h] of [['light-desktop', 'light', 1360, 860], ['dark-desktop', 'dark', 1360, 860], ['light-mobile', 'light', 390, 844], ['dark-mobile', 'dark', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.route('**/*', (r) => { const u = r.request().url(); (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort(); });
    await page.goto(URL);
    await page.waitForSelector('#runBtn');
    await page.click('#runBtn');
    await page.waitForSelector('#consoleBody .stdout');
    await page.evaluate(axeSrc);
    const res = await page.evaluate(async () => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] }));
    const report = (where, r) => {
      for (const v of r.violations) {
        failed++;
        console.log(`${label} / ${where}: ${v.id} (${v.impact}) — ${v.help}`);
        v.nodes.slice(0, 3).forEach((n) => console.log('   ', n.target.join(' '), '|', ((n.any[0] && n.any[0].message) || '').slice(0, 120)));
      }
    };
    report('главная', res);
    // вкладки лаборатории и меню настроек
    await page.click('#tabTree');
    await page.waitForSelector('#labTree .tree');
    report('дерево', await page.evaluate(async () => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })));
    await page.click('#tabTokens');
    await page.waitForSelector('#labTokens .tok');
    report('токены', await page.evaluate(async () => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })));
    await page.click('#tabSteps');
    await page.waitForFunction(() => document.querySelector('#stInfo').textContent.length > 0);
    await page.click('#stNext');
    report('шаги', await page.evaluate(async () => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })));
    await page.click('#tabOut');
    await page.click('#settingsBtn');
    report('настройки', await page.evaluate(async () => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })));
    await page.keyboard.press('Escape');
    // книга: все главы, словарь и открытая подсказка термина
    await page.goto(URL + '#book');
    await page.waitForSelector('#bookBody .chapter');
    report('книга', await page.evaluate(async () => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })));
    await page.click('#ch-parser .term >> nth=0');
    await page.waitForSelector('#termPop:not([hidden])');
    report('подсказка термина', await page.evaluate(async () => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })));
  }
  await browser.close();
  if (failed) { console.error('A11Y FAIL: нарушений ' + failed); process.exit(1); }
  console.log('A11Y OK');
})().catch((e) => { console.error('A11Y FAIL:', e.message); process.exit(1); });
