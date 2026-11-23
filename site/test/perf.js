// Метрики производительности сайта (Chromium, без сети): вес страницы, FCP, LCP, CLS, долгие задачи.
// Бюджеты заданы с запасом; тест не должен падать на медленной машине, поэтому время считаем по CPU-замедлению ×4.
// Код возврата 77 — Playwright недоступен (тест пропускается).
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('playwright не найден'); process.exit(77); }
const FILE = path.join(__dirname, '..', 'dist', 'index.html');
const BUDGET = { htmlKB: 1500, fcpMs: 2500, lcpMs: 4000, cls: 0.1, longTaskMs: 800 };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    window.__perf = { cls: 0, lcp: 0, long: [] };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
  });
  await page.route('**/*', (r) => { const u = r.request().url(); (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort(); });
  await page.goto('file://' + FILE);
  await page.waitForSelector('#runBtn');
  await page.waitForFunction(() => /готов/i.test(document.querySelector('#engineText').textContent));
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0;
    return { fcp, ...window.__perf, nodes: document.getElementsByTagName('*').length };
  });
  const htmlKB = Math.round(fs.statSync(FILE).size / 1024);
  const maxLong = m.long.length ? Math.max(...m.long) : 0;
  console.log(`вес страницы: ${htmlKB} КБ · узлов DOM: ${m.nodes} · FCP: ${Math.round(m.fcp)} мс · LCP: ${Math.round(m.lcp)} мс · CLS: ${m.cls.toFixed(3)} · долгих задач: ${m.long.length} (макс. ${maxLong} мс)  [CPU ×4 медленнее]`);
  const bad = [];
  if (htmlKB > BUDGET.htmlKB) bad.push('вес страницы');
  if (m.fcp > BUDGET.fcpMs) bad.push('FCP');
  if (m.lcp > BUDGET.lcpMs) bad.push('LCP');
  if (m.cls > BUDGET.cls) bad.push('CLS');
  if (maxLong > BUDGET.longTaskMs) bad.push('долгие задачи');
  await browser.close();
  if (bad.length) { console.error('PERF FAIL: превышен бюджет: ' + bad.join(', ')); process.exit(1); }
  console.log('PERF OK');
})().catch((e) => { console.error('PERF FAIL:', e.message); process.exit(1); });
