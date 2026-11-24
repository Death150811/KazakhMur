// Печатает веб-версию руководства (site/dist/manual.html) в docs/MANUAL.pdf.
// Запуск:  python scripts/gen_manual.py && python scripts/make_manual_html.py && node scripts/make_manual_pdf.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const root = path.join(__dirname, '..');
  const fragment = fs.readFileSync(path.join(root, 'site', 'dist', 'manual.html'), 'utf-8');
  const page_html = '<!doctype html><html lang="ru" data-theme="light"><head><meta charset="utf-8"></head><body style="margin:0">' + fragment + '</body></html>';
  const tmp = path.join(root, 'site', 'dist', 'manual_print.html');
  fs.writeFileSync(tmp, page_html, 'utf-8');
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 1400 }, colorScheme: 'light' })).newPage();
  await page.route('**/*', (r) => (/^(file|data|blob):/.test(r.request().url()) ? r.continue() : r.abort()));
  await page.goto('file://' + tmp);
  // внутренние ссылки и якоря с длинными русскими именами в PDF не нужны (и вызывают предупреждения просмотрщиков)
  await page.evaluate(() => { document.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id')); document.querySelectorAll('a[href^="#"]').forEach((a) => a.removeAttribute('href')); });
  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  const out = path.join(root, 'docs', 'MANUAL.pdf');
  await page.pdf({
    path: out, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#555"><span class="pageNumber"></span> / <span class="totalPages"></span> · Qazaq — руководство</div>',
    margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
  });
  await browser.close();
  fs.unlinkSync(tmp);
  console.log('PDF:', out, Math.round(fs.statSync(out).size / 1024) + ' КБ');
})().catch((e) => { console.error(e); process.exit(1); });
