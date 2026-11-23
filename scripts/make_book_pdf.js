// Печатает раздел «Книга» сайта в PDF: docs/QAZAQ_BOOK.pdf
// Запуск (нужен Node и Playwright):  python scripts/build_site.py && node scripts/make_book_pdf.js
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const root = path.join(__dirname, '..');
  const url = 'file://' + path.join(root, 'site', 'dist', 'index.html') + '#book';
  const out = path.join(root, 'docs', 'QAZAQ_BOOK.pdf');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1400 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => (/^(file|data|blob):/.test(r.request().url()) ? r.continue() : r.abort()));
  await page.goto(url);
  await page.waitForSelector('#bookBody .chapter');
  await page.evaluate(() => { document.title = 'Qazaq — Книга: как это сделано'; document.documentElement.dataset.theme = 'light'; document.querySelectorAll('details.check').forEach((d) => { d.open = true; }); });
  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  await page.pdf({
    path: out, format: 'A4', printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#555"><span class="pageNumber"></span> / <span class="totalPages"></span> · Qazaq — Книга</div>',
  });
  await browser.close();
  console.log('PDF:', out);
})().catch((e) => { console.error(e); process.exit(1); });
