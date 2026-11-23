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
    for (const v of res.violations) {
      failed++;
      console.log(`${label}: ${v.id} (${v.impact}) — ${v.help}`);
      v.nodes.slice(0, 3).forEach((n) => console.log('   ', n.target.join(' '), '|', ((n.any[0] && n.any[0].message) || '').slice(0, 120)));
    }
  }
  await browser.close();
  if (failed) { console.error('A11Y FAIL: нарушений ' + failed); process.exit(1); }
  console.log('A11Y OK');
})().catch((e) => { console.error('A11Y FAIL:', e.message); process.exit(1); });
