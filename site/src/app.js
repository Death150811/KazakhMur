(function () {
'use strict';

const DATA = window.QAZ_DATA;
const LANGUAGE = DATA.LANGUAGE;
const engine = createQazaqEngine(LANGUAGE);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const IS_MAC = /Mac|iPhone|iPad/.test((navigator.platform || '') + (navigator.userAgent || ''));

// ---------------------------------------------------------------------------
// Хранилище (может быть недоступно — тогда сайт работает без него)
// ---------------------------------------------------------------------------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
};

// ---------------------------------------------------------------------------
// Локализация
// ---------------------------------------------------------------------------
const I18N = {
  ru: {
    nav_play: 'Редактор', nav_about: 'О языке', nav_tour: 'Тур', nav_library: 'Функции', nav_keywords: 'Слова',
    eyebrow: 'Язык программирования на казахском',
    lead: 'Пишите код по-казахски и запускайте его прямо здесь. Без установки и без сервера.',
    fact1: 'Точка завершает инструкцию', fact2: 'Казахские буквы везде: ә ғ қ ң ө ұ ү һ і', fact3: 'Работает в браузере, результат мгновенный',
    cta_tour: 'Тур по языку', cta_lib: 'Все функции',
    examples: 'Примеры', stdin_btn: 'Ввод', more: 'Ещё', copy_code: 'Копировать код', open_file: 'Открыть файл .qaz', reset: 'Сбросить',
    stdin_label: 'Ввод для енгіз(): каждая строка — один вызов', run: 'Запустить', stop: 'Остановить', clear: 'Очистить', output: 'Вывод',
    about_kicker: 'Язык', about_title: 'Простота снаружи, мощность внутри',
    about_sub: 'Шесть идей, ради которых Qazaq сделан именно таким. Каждый пример можно запустить на месте или открыть в редакторе.',
    tour_kicker: 'Тур', tour_title: 'Язык за десять минут',
    tour_sub: 'Выберите тему: слева текст, справа код и его настоящий вывод. Результат вычисляет тот же движок, что запускает ваш код.',
    lib_kicker: 'Стандартная библиотека', lib_title: 'Встроенные функции',
    lib_sub: 'Одно слово: одно действие. Нажмите «Вставить», и имя функции появится в редакторе.',
    search: 'Поиск', search_ph: 'Поиск по названию и описанию…',
    kw_kicker: 'Словарь', kw_title: 'Ключевые слова',
    kw_sub: 'Двадцать два слова и два полных написания: используйте то, что удобнее. Оба варианта работают одинаково.',
    kw_word: 'Слово', kw_alias: 'Полное написание', kw_like: 'Аналог', kw_desc: 'Назначение',
    foot_note: 'Сайт работает целиком в браузере: код не отправляется на сервер. Функции шеш, туын, интегр, сыз, оқы, сақта доступны только в локальной версии: qaz run main.qaz.',
    // динамические
    engine_ready: 'Движок готов', engine_worker: 'в фоновом потоке', engine_inline: 'в браузере', engine_server: 'на сервере (Python)', engine_browser: 'Браузер (JS)', engine_pyserver: 'Сервер (Python)',
    running: 'Выполняется…', stopped: 'Остановлено', st_ok: 'Успешно', st_error: 'Ошибка', st_limit: 'Лимит', st_run: 'Идёт',
    syntax_ok: 'Синтаксис в порядке', syntax_bad: 'Строка {line}: {msg}', empty: 'Пока ничего нет. Нажмите «Запустить» (', empty2: ').',
    no_output: '(программа завершилась без вывода)', line: 'строка', column: 'столбец', hint: 'Подсказка', trace: 'Цепочка вызовов',
    copy_report: 'Копировать отчёт', copied: 'Скопировано', copy_failed: 'Не удалось скопировать',
    insert: 'Вставить', inserted: 'Вставлено в редактор', open_in_editor: 'Открыть в редакторе', local_only: 'только локально',
    synonym: 'синоним', no_match: 'Ничего не найдено', all: 'Все', time: 'время', steps: 'шагов', result: 'Результат',
    file_loaded: 'Файл загружен', file_error: 'Не удалось прочитать файл', stopped_msg: 'Выполнение остановлено',
    docs_ru_only: '',
    cat_core: 'Основные', cat_math: 'Математика', cat_data: 'Данные', cat_ai: 'Прогноз', cat_science: 'Наука', cat_io: 'Файлы',
    lib_local_note: 'Функции с пометкой «только локально» работают в установленном Qazaq (qaz run), но не в браузере.',
    none: '—',
  },
  kk: {
    nav_play: 'Редактор', nav_about: 'Тіл туралы', nav_tour: 'Шолу', nav_library: 'Функциялар', nav_keywords: 'Сөздер',
    eyebrow: 'Қазақ тіліндегі бағдарламалау тілі',
    lead: 'Кодты қазақша жазыңыз да, дәл осы жерде іске қосыңыз. Орнату да, сервер де қажет емес.',
    fact1: 'Нүкте нұсқауды аяқтайды', fact2: 'Қазақ әріптері барлық жерде: ә ғ қ ң ө ұ ү һ і', fact3: 'Браузерде жұмыс істейді, нәтиже лезде шығады',
    cta_tour: 'Тілге шолу', cta_lib: 'Барлық функциялар',
    examples: 'Мысалдар', stdin_btn: 'Енгізу', more: 'Тағы', copy_code: 'Кодты көшіру', open_file: '.qaz файлын ашу', reset: 'Қайта қою',
    stdin_label: 'енгіз() үшін деректер: әр жол — бір шақыру', run: 'Іске қосу', stop: 'Тоқтату', clear: 'Тазалау', output: 'Нәтиже',
    about_kicker: 'Тіл', about_title: 'Қарапайымдылық сыртында, қуат ішінде',
    about_sub: 'Qazaq дәл осылай жасалуының алты идеясы. Әр мысалды сол жерде іске қосуға немесе редакторда ашуға болады.',
    tour_kicker: 'Шолу', tour_title: 'Тіл он минутта',
    tour_sub: 'Тақырыпты таңдаңыз: сол жақта мәтін, оң жақта код пен оның нақты нәтижесі. Нәтижені кодыңызды іске қосатын қозғалтқыштың өзі есептейді.',
    lib_kicker: 'Стандартты кітапхана', lib_title: 'Ішкі функциялар',
    lib_sub: 'Бір сөз: бір әрекет. «Қою» түймесін басыңыз, функция атауы редакторда пайда болады.',
    search: 'Іздеу', search_ph: 'Атауы мен сипаттамасы бойынша іздеу…',
    kw_kicker: 'Сөздік', kw_title: 'Кілт сөздер',
    kw_sub: 'Жиырма екі сөз және екі толық жазылу: қолайлысын қолданыңыз. Екі нұсқа бірдей жұмыс істейді.',
    kw_word: 'Сөз', kw_alias: 'Толық жазылуы', kw_like: 'Баламасы', kw_desc: 'Мақсаты',
    foot_note: 'Сайт толығымен браузерде жұмыс істейді: код серверге жіберілмейді. шеш, туын, интегр, сыз, оқы, сақта функциялары тек жергілікті нұсқада жұмыс істейді: qaz run main.qaz.',
    engine_ready: 'Қозғалтқыш дайын', engine_worker: 'фондық ағында', engine_inline: 'браузерде', engine_server: 'серверде (Python)', engine_browser: 'Браузер (JS)', engine_pyserver: 'Сервер (Python)',
    running: 'Орындалуда…', stopped: 'Тоқтатылды', st_ok: 'Сәтті', st_error: 'Қате', st_limit: 'Шектеу', st_run: 'Жүріп жатыр',
    syntax_ok: 'Синтаксис дұрыс', syntax_bad: '{line}-жол: {msg}', empty: 'Әзірге нәтиже жоқ. «Іске қосу» түймесін басыңыз (', empty2: ').',
    no_output: '(бағдарлама ештеңе шығармады)', line: 'жол', column: 'баған', hint: 'Кеңес', trace: 'Шақырулар тізбегі',
    copy_report: 'Есепті көшіру', copied: 'Көшірілді', copy_failed: 'Көшіру мүмкін болмады',
    insert: 'Қою', inserted: 'Редакторға қойылды', open_in_editor: 'Редакторда ашу', local_only: 'тек жергілікті',
    synonym: 'синоним', no_match: 'Ештеңе табылмады', all: 'Барлығы', time: 'уақыт', steps: 'қадам', result: 'Нәтиже',
    file_loaded: 'Файл жүктелді', file_error: 'Файлды оқу мүмкін болмады', stopped_msg: 'Орындау тоқтатылды',
    docs_ru_only: 'Функциялар сипаттамасы әзірге орыс тілінде.',
    cat_core: 'Негізгі', cat_math: 'Математика', cat_data: 'Деректер', cat_ai: 'Болжам', cat_science: 'Ғылым', cat_io: 'Файлдар',
    lib_local_note: '«тек жергілікті» белгісі бар функциялар орнатылған Qazaq-та (qaz run) жұмыс істейді, браузерде емес.',
    none: '—',
  },
};
const KW_KK = {
  'айным': 'айнымалыны жариялау', 'функ': 'функцияны жариялау', 'егер': 'шарт', 'әйтпесе': 'әйтпесе; «әйтпесе егер» — әйтпесе, егер',
  'қайтар': 'функциядан мәнді қайтару', 'әзір': 'шартты цикл', 'әрбір': 'тізбекті айналу: әрбір x ішінде тізім:', 'ішінде': 'ішінде: айналу және тиесілік тексеру',
  'ақиқат': 'логикалық ақиқат', 'жалған': 'логикалық жалған', 'бос': 'мәннің болмауы', 'сынып': 'сыныпты жариялау', 'тоқта': 'циклден шығу',
  'жалғас': 'келесі итерацияға өту', 'және': 'логикалық ЖӘНЕ', 'немесе': 'логикалық НЕМЕСЕ', 'емес': 'логикалық ЕМЕС', 'байқа': 'қателерді өңдейтін блок',
  'қате': 'қате өңдегіші: қате e:', 'соңында': 'әрқашан орындалатын блок', 'лақтыр': 'қате шақыру', 'өткіз': 'бос нұсқау',
};

const state = {
  lang: store.get('qazaq.lang') === 'kk' ? 'kk' : 'ru',
  theme: null,
  err: null,
  tourId: null,
  libCat: 'all',
  libQuery: '',
  running: false,
};
const t = (key, vars) => {
  let s = (I18N[state.lang][key] ?? I18N.ru[key] ?? key);
  if (vars) for (const k of Object.keys(vars)) s = s.replace('{' + k + '}', vars[k]);
  return s;
};
const pick = (obj) => obj[state.lang] || obj.ru;

function applyI18n() {
  document.documentElement.lang = state.lang;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $('#langBtn').textContent = state.lang === 'ru' ? 'RU' : 'ҚАЗ';
  updateEngineChip();
  renderConsoleEmpty();
}

// ---------------------------------------------------------------------------
// Подсветка синтаксиса (отражает правила лексера)
// ---------------------------------------------------------------------------
const KEYWORDS = new Set();
LANGUAGE.keywords.forEach((k) => { KEYWORDS.add(k.name); (k.aliases || []).forEach((a) => KEYWORDS.add(a)); });
const LITERALS = new Set([...LANGUAGE.literals, ...LANGUAGE.constants]);
KEYWORDS.delete('ақиқат'); KEYWORDS.delete('жалған'); KEYWORDS.delete('бос');
const BUILTIN_NAMES = new Set();
LANGUAGE.builtins.forEach((b) => { BUILTIN_NAMES.add(b.name); (b.aliases || []).forEach((a) => BUILTIN_NAMES.add(a)); });
const METHOD_NAMES = new Set(LANGUAGE.methods);
const RE_LATIN = /\p{Script=Latin}/u, RE_CYR = /\p{Script=Cyrillic}/u;
const RE_IDENT = /[\p{L}_][\p{L}\p{N}_\p{M}]*/uy;
const RE_NUM = /\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?/y;
const RE_OP = /\*\*|\/\/|==|!=|<=|>=|\+=|-=|\*=|\/=|[-+*\/%<>=]/y;

function scanString(text, i0, q, isF, out) {
  const n = text.length;
  const triple = text.startsWith(q.repeat(3), i0);
  let i = i0 + (triple ? 3 : 1);
  let buf = text.slice(i0, i);
  const flush = () => { if (buf) { out.push({ c: 't-str', s: buf }); buf = ''; } };
  while (i < n) {
    const ch = text[i];
    if (triple ? text.startsWith(q.repeat(3), i) : ch === q) { buf += triple ? q.repeat(3) : q; i += triple ? 3 : 1; flush(); return i; }
    if (ch === '\n' && !triple) { flush(); return i; }
    if (ch === '\\' && i + 1 < n && text[i + 1] !== '\n') { flush(); out.push({ c: 't-esc', s: text.slice(i, i + 2) }); i += 2; continue; }
    if (isF && ch === '{') {
      if (text[i + 1] === '{') { buf += '{{'; i += 2; continue; }
      flush(); out.push({ c: 't-interp', s: '{' }); i++;
      let depth = 0, j = i, quote = null, specAt = -1;
      while (j < n) {
        const c = text[j];
        if (quote) { if (c === quote) quote = null; }
        else if (c === '"' || c === "'") quote = c;
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
        else if (c === ':' && depth === 0 && specAt < 0) specAt = j;
        else if (c === '\n') break;
        j++;
      }
      const expr = text.slice(i, specAt >= 0 ? specAt : j);
      tokenize(expr, true).forEach((tok) => out.push(tok));
      if (specAt >= 0) { out.push({ c: 't-op', s: ':' }); out.push({ c: 't-str', s: text.slice(specAt + 1, j) }); }
      i = j;
      if (text[i] === '}') { out.push({ c: 't-interp', s: '}' }); i++; }
      continue;
    }
    if (isF && ch === '}' && text[i + 1] === '}') { buf += '}}'; i += 2; continue; }
    buf += ch; i++;
  }
  flush();
  return i;
}

function tokenize(text, inInterp = false) {
  const out = [];
  const n = text.length;
  let i = 0, prevDot = false;
  while (i < n) {
    const ch = text[i];
    if (ch === '\n') { out.push({ c: null, s: '\n' }); i++; continue; }
    if (ch === ' ' || ch === '\t') { let j = i; while (j < n && (text[j] === ' ' || text[j] === '\t')) j++; out.push({ c: null, s: text.slice(i, j) }); i = j; continue; }
    if (ch === '#' && !inInterp) { let j = text.indexOf('\n', i); if (j < 0) j = n; out.push({ c: 't-com', s: text.slice(i, j) }); i = j; continue; }
    if (ch === '"' || ch === "'") { i = scanString(text, i, ch, false, out); prevDot = false; continue; }
    if (ch === 'ф' && (text[i + 1] === '"' || text[i + 1] === "'")) { out.push({ c: 't-str', s: 'ф' }); i = scanString(text, i + 1, text[i + 1], true, out); prevDot = false; continue; }
    if (ch >= '0' && ch <= '9') { RE_NUM.lastIndex = i; const m = RE_NUM.exec(text); out.push({ c: 't-num', s: m[0] }); i += m[0].length; prevDot = false; continue; }
    if (ch === '.') {
      const nx = text[i + 1];
      if (nx === undefined || nx === ' ' || nx === '\t' || nx === '\n' || nx === '#') { out.push({ c: 't-end', s: '.' }); prevDot = false; }
      else { out.push({ c: 't-dot', s: '.' }); prevDot = true; }
      i++; continue;
    }
    if (ch === ':') {
      const rest = text.slice(i + 1, i + 200);
      const endOfLine = /^[ \t]*(?:#[^\n]*)?(?:\n|$)/.test(rest);
      out.push({ c: endOfLine && !inInterp ? 't-colon' : 't-op', s: ':' }); i++; prevDot = false; continue;
    }
    RE_IDENT.lastIndex = i;
    const m = RE_IDENT.exec(text);
    if (m) {
      const word = m[0];
      const norm = word.normalize('NFC');
      let c = null;
      if (RE_LATIN.test(word) && RE_CYR.test(word)) c = 't-bad';
      else if (prevDot) c = METHOD_NAMES.has(norm) && text[i + word.length] === '(' ? 't-method' : null;
      else if (KEYWORDS.has(norm)) c = 't-kw';
      else if (LITERALS.has(norm)) c = 't-const';
      else if (BUILTIN_NAMES.has(norm)) c = 't-fn';
      out.push({ c, s: word }); i += word.length; prevDot = false; continue;
    }
    RE_OP.lastIndex = i;
    const o = RE_OP.exec(text);
    if (o) { out.push({ c: 't-op', s: o[0] }); i += o[0].length; prevDot = false; continue; }
    out.push({ c: '()[]{},'.includes(ch) ? 't-op' : null, s: ch }); i++; prevDot = false;
  }
  return out;
}

const cpLen = (s) => { let n = 0; for (const _ of s) n++; return n; };

// Разбивает токены по переводам строк и возвращает HTML каждой строки
function toLines(tokens, err) {
  const lines = [[]];
  for (const tok of tokens) {
    if (tok.s.indexOf('\n') < 0) { lines[lines.length - 1].push(tok); continue; }
    const parts = tok.s.split('\n');
    parts.forEach((p, idx) => {
      if (idx > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ c: tok.c, s: p });
    });
  }
  return lines.map((toks, idx) => {
    const lineNo = idx + 1;
    let badIdx = -1;
    if (err && err.line === lineNo) {
      let col = 1, last = -1;
      const col0 = err.column || 1;
      for (let k = 0; k < toks.length; k++) {
        const len = cpLen(toks[k].s);
        const isWs = toks[k].c === null && /^\s+$/.test(toks[k].s);
        if (!isWs && col <= col0 && col0 < col + len) { badIdx = k; break; }
        if (!isWs && col + len <= col0) last = k;
        col += len;
      }
      if (badIdx < 0) badIdx = last;
    }
    const html = toks.map((tok, k) => {
      const cls = [tok.c, k === badIdx ? 't-bad' : null].filter(Boolean).join(' ');
      return cls ? `<span class="${cls}">${esc(tok.s)}</span>` : esc(tok.s);
    }).join('');
    return html;
  });
}

function staticHtml(text) {
  return tokenize(text).map((tok) => (tok.c ? `<span class="${tok.c}">${esc(tok.s)}</span>` : esc(tok.s))).join('');
}
function codeBlock(text) {
  const pre = document.createElement('pre');
  pre.className = 'codeblock';
  pre.innerHTML = '<code>' + staticHtml(text.replace(/\n$/, '')) + '</code>';
  return pre;
}

// ---------------------------------------------------------------------------
// Тосты и буфер обмена
// ---------------------------------------------------------------------------
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}
function copyText(text) {
  const done = () => toast(t('copied'));
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      ok ? done() : toast(t('copy_failed'));
    } catch (e) { toast(t('copy_failed')); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

// ---------------------------------------------------------------------------
// Редактор
// ---------------------------------------------------------------------------
const ta = $('#code'), hl = $('#hl'), hlCode = $('#hlCode'), gutter = $('#gutter'), gutterIn = $('#gutterIn');
const ed = { lines: 1 };

function renderEditor() {
  const text = ta.value;
  const lines = toLines(tokenize(text), state.err);
  const curLine = text.slice(0, ta.selectionStart).split('\n').length;
  hlCode.innerHTML = lines.map((h, i) => `<span class="ln${state.err && state.err.line === i + 1 ? ' err' : ''}">${h}</span>`).join('');
  if (lines.length !== ed.lines || true) {
    gutterIn.innerHTML = lines.map((_, i) => `<div class="${state.err && state.err.line === i + 1 ? 'err' : i + 1 === curLine ? 'cur' : ''}">${i + 1}</div>`).join('');
    ed.lines = lines.length;
  }
  syncScroll();
}
function syncScroll() {
  hl.scrollTop = ta.scrollTop;
  hl.scrollLeft = ta.scrollLeft;
  gutterIn.style.transform = `translateY(${-ta.scrollTop}px)`;
  const sbw = ta.offsetWidth - ta.clientWidth, sbh = ta.offsetHeight - ta.clientHeight;
  hl.style.right = sbw + 'px';
  hl.style.bottom = sbh + 'px';
}
function updatePos() {
  const before = ta.value.slice(0, ta.selectionStart);
  const ln = before.split('\n').length;
  const col = cpLen(before.slice(before.lastIndexOf('\n') + 1)) + 1;
  $('#pos').textContent = ln + ':' + col;
}

function setCode(code, opts = {}) {
  ta.value = code;
  state.err = null;
  store.set('qazaq.code', code);
  renderEditor();
  scheduleCheck(0);
  if (opts.focus) ta.focus();
  if (opts.top) { ta.scrollTop = 0; syncScroll(); }
}

function insertText(text) {
  ta.focus();
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
  if (!ok) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.setRangeText(text, s, e, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function lineRange() {
  const v = ta.value;
  const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
  let e = v.indexOf('\n', ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === '\n' ? ta.selectionEnd - 1 : ta.selectionEnd);
  if (e < 0) e = v.length;
  return [s, e];
}
function transformLines(fn) {
  const [s, e] = lineRange();
  const block = ta.value.slice(s, e);
  const out = block.split('\n').map(fn).join('\n');
  ta.setSelectionRange(s, e);
  insertText(out);
  ta.setSelectionRange(s, s + out.length);
}

const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
const CLOSERS = new Set([')', ']', '}', '"', "'"]);

ta.addEventListener('keydown', (e) => {
  if (ac.open) {
    if (e.key === 'ArrowDown') { e.preventDefault(); acMove(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); acMove(-1); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acAccept(); return; }
    if (e.key === 'Escape') { e.preventDefault(); acHide(); return; }
  }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'Enter') { e.preventDefault(); run(); return; }
  if (mod && e.key === '/') {
    e.preventDefault();
    const [s, en] = lineRange();
    const lines = ta.value.slice(s, en).split('\n');
    const allCommented = lines.every((l) => !l.trim() || /^\s*#/.test(l));
    transformLines((l) => (allCommented ? l.replace(/^(\s*)# ?/, '$1') : (l.trim() ? l.replace(/^(\s*)/, '$1# ') : l)));
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    const multi = ta.value.slice(ta.selectionStart, ta.selectionEnd).includes('\n');
    if (e.shiftKey) transformLines((l) => l.replace(/^( {1,4}|\t)/, ''));
    else if (multi) transformLines((l) => '    ' + l);
    else insertText('    '.slice(0, 4 - ((ta.selectionStart - (ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1)) % 4)));
    return;
  }
  if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    const v = ta.value, s = ta.selectionStart;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    const before = v.slice(ls, s);
    const indent = before.match(/^[ \t]*/)[0];
    const code = before.replace(/#.*$/, '').trimEnd();
    insertText('\n' + indent + (code.endsWith(':') ? '    ' : ''));
    return;
  }
  if (e.key === 'Backspace' && ta.selectionStart === ta.selectionEnd && !mod) {
    const v = ta.value, s = ta.selectionStart;
    if (s > 0 && PAIRS[v[s - 1]] && v[s] === PAIRS[v[s - 1]]) {
      e.preventDefault();
      ta.setSelectionRange(s - 1, s + 1);
      insertText('');
      return;
    }
  }
  if (!mod && !e.altKey && e.key.length === 1) {
    const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
    if (CLOSERS.has(e.key) && s === en && v[s] === e.key && (e.key !== '"' && e.key !== "'" || true)) {
      // перешагнуть через уже стоящую закрывающую скобку/кавычку
      if (!(PAIRS[e.key] && e.key !== PAIRS[e.key])) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); return; }
    }
    if (PAIRS[e.key]) {
      const next = v[s] || '';
      const prev = v[s - 1] || '';
      const quote = e.key === '"' || e.key === "'";
      if (s !== en) {
        e.preventDefault();
        const sel = v.slice(s, en);
        insertText(e.key + sel + PAIRS[e.key]);
        ta.setSelectionRange(s + 1, s + 1 + sel.length);
        return;
      }
      if (quote && (/[\p{L}\p{N}_]/u.test(prev) || prev === '\\')) return;
      if (!next || /[\s)\]}.,:;]/.test(next)) {
        e.preventDefault();
        insertText(e.key + PAIRS[e.key]);
        ta.setSelectionRange(s + 1, s + 1);
      }
    }
  }
});

let checkTimer = null;
function scheduleCheck(delay = 280) {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(checkSyntax, delay);
}
function checkSyntax() {
  const err = engine.check(ta.value);
  const el = $('#syntax');
  if (!err) {
    el.className = 'syntax';
    el.innerHTML = `<span class="sdot"></span><span class="stext">${esc(t('syntax_ok'))}</span>`;
    if (state.err && state.err.syntax) { state.err = null; renderEditor(); }
    return;
  }
  el.className = 'syntax bad';
  const msg = err.message.length > 90 ? err.message.slice(0, 88) + '…' : err.message;
  el.innerHTML = `<span class="sdot"></span><span class="stext">${esc(t('syntax_bad', { line: err.line ?? '?', msg }))}</span>`;
  if (err.line != null) { state.err = { line: err.line, column: err.column, syntax: true }; renderEditor(); }
}

ta.addEventListener('input', () => {
  store.set('qazaq.code', ta.value);
  if (state.err && !state.err.syntax) state.err = null;
  renderEditor();
  updatePos();
  scheduleCheck();
  acUpdate();
});
ta.addEventListener('scroll', () => { syncScroll(); acHide(); });
['keyup', 'click', 'select'].forEach((ev) => ta.addEventListener(ev, () => { updatePos(); renderGutterCur(); }));
ta.addEventListener('blur', () => setTimeout(acHide, 120));
window.addEventListener('resize', syncScroll);
function renderGutterCur() {
  const curLine = ta.value.slice(0, ta.selectionStart).split('\n').length;
  $$('div', gutterIn).forEach((d, i) => { if (!d.classList.contains('err')) d.className = i + 1 === curLine ? 'cur' : ''; });
}

function jumpTo(line, column) {
  const lines = ta.value.split('\n');
  let pos = 0;
  for (let i = 0; i < Math.min(line - 1, lines.length); i++) pos += lines[i].length + 1;
  pos += Math.max((column || 1) - 1, 0);
  ta.focus();
  ta.setSelectionRange(pos, pos);
  const lh = 22;
  ta.scrollTop = Math.max(0, (line - 4) * lh);
  syncScroll(); updatePos(); renderGutterCur();
  $('#pg').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---------------------------------------------------------------------------
// Автодополнение
// ---------------------------------------------------------------------------
const ac = { open: false, items: [], sel: 0, start: 0 };
const acEl = $('#ac');
const AC_ITEMS = [];
LANGUAGE.keywords.forEach((k) => { AC_ITEMS.push({ name: k.name, kind: 'kw', detail: k.equivalent }); (k.aliases || []).forEach((a) => AC_ITEMS.push({ name: a, kind: 'kw', detail: k.equivalent })); });
LANGUAGE.builtins.forEach((b) => { AC_ITEMS.push({ name: b.name, kind: 'fn', detail: b.signature }); (b.aliases || []).forEach((a) => AC_ITEMS.push({ name: a, kind: 'fn', detail: b.signature })); });
LANGUAGE.constants.forEach((c) => AC_ITEMS.push({ name: c, kind: 'const', detail: 'константа' }));
function caretXY() {
  const mirror = document.createElement('div');
  const cs = getComputedStyle(ta);
  ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'paddingLeft', 'paddingTop', 'tabSize'].forEach((p) => { mirror.style[p] = cs[p]; });
  mirror.style.cssText += ';position:absolute;visibility:hidden;white-space:pre;top:0;left:0;';
  mirror.textContent = ta.value.slice(0, ta.selectionStart);
  const mark = document.createElement('span');
  mark.textContent = '​';
  mirror.appendChild(mark);
  ta.parentNode.appendChild(mirror);
  const x = mark.offsetLeft - ta.scrollLeft, y = mark.offsetTop - ta.scrollTop;
  ta.parentNode.removeChild(mirror);
  return { x, y };
}
function acUpdate() {
  const s = ta.selectionStart;
  if (s !== ta.selectionEnd) return acHide();
  const before = ta.value.slice(Math.max(0, s - 40), s);
  const lineBefore = ta.value.slice(ta.value.lastIndexOf('\n', s - 1) + 1, s);
  if (/#/.test(lineBefore) || ((lineBefore.match(/"/g) || []).length % 2 === 1 && !/ф"[^"]*\{[^}]*$/.test(lineBefore))) return acHide();
  const m = before.match(/[\p{L}_][\p{L}\p{N}_]*$/u);
  if (!m || m[0].length < 2) return acHide();
  const word = m[0].normalize('NFC').toLowerCase();
  const memberCtx = before.slice(0, before.length - m[0].length).endsWith('.');
  let items = AC_ITEMS.filter((it) => !memberCtx && it.name.toLowerCase().includes(word) && it.name.toLowerCase() !== word);
  if (memberCtx) items = LANGUAGE.methods.filter((n) => n.toLowerCase().startsWith(word) && n.toLowerCase() !== word).map((n) => ({ name: n, kind: 'm', detail: 'метод' }));
  items.sort((a, b) => (b.name.toLowerCase().startsWith(word) - a.name.toLowerCase().startsWith(word)) || a.name.length - b.name.length);
  items = items.slice(0, 7);
  if (!items.length) return acHide();
  ac.items = items; ac.sel = 0; ac.start = s - m[0].length; ac.open = true;
  acEl.innerHTML = items.map((it, i) => `<li role="option" aria-selected="${i === 0}" data-i="${i}"><span class="k">${it.kind === 'kw' ? 'k' : it.kind === 'fn' ? 'ƒ' : it.kind === 'm' ? '.' : 'π'}</span><span>${esc(it.name)}</span><span class="d">${esc(it.detail || '')}</span></li>`).join('');
  const { x, y } = caretXY();
  const wrap = ta.parentNode;
  acEl.hidden = false;
  const left = Math.min(Math.max(x, 4), Math.max(wrap.clientWidth - acEl.offsetWidth - 8, 4));
  const below = y + 30, h = acEl.offsetHeight;
  acEl.style.left = left + 'px';
  acEl.style.top = (below + h > wrap.clientHeight ? Math.max(y - h - 4, 4) : below) + 'px';
}
function acHide() { ac.open = false; acEl.hidden = true; }
function acMove(d) {
  ac.sel = (ac.sel + d + ac.items.length) % ac.items.length;
  $$('li', acEl).forEach((li, i) => li.setAttribute('aria-selected', String(i === ac.sel)));
}
function acAccept() {
  const it = ac.items[ac.sel];
  if (!it) return acHide();
  const s = ta.selectionStart;
  ta.setSelectionRange(ac.start, s);
  const next = ta.value[s] || '';
  if (it.kind === 'fn' && next !== '(') { insertText(it.name + '()'); const p = ta.selectionStart - 1; ta.setSelectionRange(p, p); }
  else insertText(it.name);
  acHide();
}
acEl.addEventListener('mousedown', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  e.preventDefault();
  ac.sel = Number(li.dataset.i);
  acAccept();
});

// ---------------------------------------------------------------------------
// Запуск программ: фоновый поток (Worker) с запасным вариантом в основном потоке
// ---------------------------------------------------------------------------
const RUN_OPTS = { timeout: 5, maxSteps: 20000000, maxOutput: 200000, maxDepth: 200 };
const runner = {
  worker: null, mode: 'inline', seq: 0, pending: null, watchdog: null,
  start() {
    try {
      const src = 'const createQazaqEngine = ' + createQazaqEngine.toString() + ';\n' +
        'let engine = null;\n' +
        'self.onmessage = function (e) { var m = e.data;\n' +
        '  if (m.type === "init") { engine = createQazaqEngine(m.lang); self.postMessage({ type: "ready" }); }\n' +
        '  else if (m.type === "run") { var r = engine.run(m.code, m.opts); self.postMessage({ type: "result", id: m.id, result: r }); } };';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      this.worker = w;
      w.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'ready') { this.mode = 'worker'; updateEngineChip(); }
        else if (m.type === 'result' && this.pending && this.pending.id === m.id) this.finish(m.result);
      };
      w.onerror = () => { this.fallback(); };
      w.postMessage({ type: 'init', lang: LANGUAGE });
    } catch (e) { this.fallback(); }
  },
  fallback() {
    if (this.worker) { try { this.worker.terminate(); } catch (e) { /* ignore */ } }
    this.worker = null; this.mode = 'inline'; updateEngineChip();
    if (this.pending && this.pending.viaWorker) { const p = this.pending; this.pending = null; this.exec(p.code, p.stdin, p.resolve); }
  },
  finish(result) {
    clearTimeout(this.watchdog);
    const p = this.pending; this.pending = null;
    if (p) p.resolve(result);
  },
  run(code, stdin) {
    if (server.selected) return runOnServer(code, stdin);
    return new Promise((resolve) => this.exec(code, stdin, resolve));
  },
  exec(code, stdin, resolve) {
    const opts = Object.assign({ stdin }, RUN_OPTS);
    if (this.worker && this.mode === 'worker') {
      const id = ++this.seq;
      this.pending = { id, code, stdin, resolve, viaWorker: true };
      this.watchdog = setTimeout(() => {
        this.restart();
        resolve({ status: 'limit', stdout: '', steps: 0, error: { title: 'Превышен лимит', message: 'Превышено время исполнения (' + RUN_OPTS.timeout + ' с). Возможно, бесконечный цикл.', line: null, column: null, hint: null, trace: [] } });
      }, (RUN_OPTS.timeout + 2) * 1000);
      this.worker.postMessage({ type: 'run', id, code, opts });
    } else {
      setTimeout(() => resolve(engine.run(code, opts)), 20);
    }
  },
  stop() {
    if (this.mode === 'worker' && this.pending) {
      const p = this.pending; this.pending = null;
      clearTimeout(this.watchdog);
      this.restart();
      p.resolve({ status: 'stopped', stdout: '', steps: 0, error: null });
    }
  },
  restart() {
    try { this.worker.terminate(); } catch (e) { /* ignore */ }
    this.worker = null; this.mode = 'inline'; this.pending = null;
    this.start();
  },
};

// Серверный режим: если страницу отдаёт бэкенд Qazaq (/api/health), можно запускать настоящий Python-интерпретатор
// (с SymPy: шеш, туын, интегр). На статическом хостинге и в браузере без сервера этот переключатель скрыт.
const server = { available: false, selected: false };
async function runOnServer(code, stdin) {
  const fail = (msg) => ({ status: 'error', stdout: '', steps: 0, error: { title: 'Ошибка сервера', message: msg, line: null, column: null, hint: null, trace: [] } });
  try {
    const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, stdin }) });
    if (res.status === 429) return fail('Слишком много запусков. Подождите минуту.');
    if (!res.ok) return fail('Сервер вернул ошибку ' + res.status);
    const r = await res.json();
    r.steps = r.steps || 0;
    return r;
  } catch (e) { return fail('Сервер недоступен'); }
}
function detectServer() {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl && ctrl.abort(), 1500);
  fetch('/api/health', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no'))))
    .then((j) => {
      clearTimeout(timer);
      if (j && j.status === 'ok') { server.available = true; $('#engineSelWrap').hidden = false; labelEngineSel(); }
    })
    .catch(() => { clearTimeout(timer); });
}
function labelEngineSel() {
  const sel2 = $('#engineSel');
  sel2.options[0].textContent = t('engine_browser');
  sel2.options[1].textContent = t('engine_pyserver');
}
$('#engineSel').addEventListener('change', (e) => { server.selected = e.target.value === 'server'; updateEngineChip(); });

function updateEngineChip() {
  const chip = $('#engineChip');
  chip.classList.add('ok');
  const where = server.selected ? t('engine_server') : (runner.mode === 'worker' ? t('engine_worker') : t('engine_inline'));
  $('#engineText').textContent = t('engine_ready') + ' · ' + where;
  if (server.available) labelEngineSel();
}

// ---------------------------------------------------------------------------
// Вывод результата
// ---------------------------------------------------------------------------
function errorCard(result, code, opts = {}) {
  const e = result.error;
  const card = document.createElement('div');
  card.className = 'errcard';
  let html = `<p class="err-title">${esc(e.title)}</p><p class="err-msg">${esc(e.message)}</p>`;
  const lines = code.replace(/\r\n/g, '\n').split('\n');
  if (e.line != null && lines[e.line - 1] !== undefined) {
    const num = String(e.line);
    const src = lines[e.line - 1];
    const caret = e.column != null ? ' '.repeat(num.length) + ' | ' + ' '.repeat(Math.max(e.column - 1, 0)) + '<span class="caret">^</span>' : '';
    html += `<pre class="err-src"><code>${esc(num + ' | ' + src)}${caret ? '\n' + caret : ''}</code></pre>`;
  }
  if (e.line != null && opts.jump) {
    html += `<button type="button" class="err-line">${esc(t('line'))} ${e.line}${e.column != null ? ', ' + esc(t('column')) + ' ' + e.column : ''}</button>`;
  }
  if (e.hint) html += `<p class="err-hint"><strong>${esc(t('hint'))}:</strong> ${esc(e.hint)}</p>`;
  if (e.trace && e.trace.length) {
    html += `<ul class="err-trace" aria-label="${esc(t('trace'))}">` + e.trace.map((f) => `<li>${esc(f.function)}() — ${esc(t('line'))} ${f.line ?? '?'}</li>`).join('') + '</ul>';
  }
  card.innerHTML = html;
  if (opts.jump) { const b = $('.err-line', card); if (b) b.addEventListener('click', () => jumpTo(e.line, e.column)); }
  if (opts.report) {
    const row = document.createElement('div');
    row.className = 'err-actions';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn btn-sm'; btn.textContent = t('copy_report');
    btn.addEventListener('click', () => copyText(buildReport(result, code)));
    row.appendChild(btn);
    card.appendChild(row);
  }
  return card;
}
function buildReport(result, code) {
  const e = result.error;
  let r = `Qazaq ${LANGUAGE.version} (сайт, движок JS)\n\n--- код ---\n${code}\n--- результат: ${result.status} ---\n`;
  if (result.stdout) r += `вывод:\n${result.stdout}\n`;
  if (e) r += `${e.title}: ${e.message}${e.line != null ? ` (строка ${e.line}${e.column != null ? ', столбец ' + e.column : ''})` : ''}\n${e.hint ? 'Подсказка: ' + e.hint + '\n' : ''}`;
  return r;
}
function renderOutput(container, result, code, opts = {}) {
  container.innerHTML = '';
  if (result.stdout !== '') {
    const pre = document.createElement('pre');
    pre.className = 'stdout';
    pre.textContent = result.stdout;
    container.appendChild(pre);
  }
  if (result.error) container.appendChild(errorCard(result, code, opts));
  else if (result.stdout === '') {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = t('no_output');
    container.appendChild(p);
  }
}

const consoleBody = $('#consoleBody');
let lastResult = null;
function renderConsoleEmpty() {
  if (lastResult || state.running) return;
  consoleBody.innerHTML = `<p class="empty">${esc(t('empty'))}${IS_MAC ? '⌘' : 'Ctrl'} + Enter${esc(t('empty2'))}</p>`;
}
function setStatus(kind, label) {
  const chip = $('#statusChip');
  if (!kind) { chip.hidden = true; return; }
  chip.hidden = false;
  chip.className = 'status ' + kind;
  chip.textContent = label;
}

async function run() {
  if (state.running) return;
  state.running = true;
  acHide();
  $('#runBtn').disabled = true;
  $('#runBtn').classList.add('busy');
  $('#stopBtn').hidden = false;
  setStatus('run', t('st_run'));
  $('#runMeta').textContent = '';
  state.err = null;
  renderEditor();
  const code = ta.value;
  const started = performance.now();
  const result = await runner.run(code, $('#stdinArea').value);
  const ms = Math.max(1, Math.round(performance.now() - started));
  state.running = false;
  $('#runBtn').disabled = false;
  $('#runBtn').classList.remove('busy');
  $('#stopBtn').hidden = true;
  if (result.status === 'stopped') {
    lastResult = null;
    setStatus('limit', t('stopped'));
    consoleBody.innerHTML = `<p class="empty">${esc(t('stopped_msg'))}</p>`;
    return;
  }
  lastResult = result;
  const label = result.status === 'ok' ? t('st_ok') : result.status === 'limit' ? t('st_limit') : t('st_error');
  setStatus(result.status === 'ok' ? 'ok' : result.status === 'limit' ? 'limit' : 'error', label);
  $('#runMeta').textContent = `${ms} ms · ${result.steps.toLocaleString('en-US')} ${t('steps')}`;
  renderOutput(consoleBody, result, code, { jump: true, report: true });
  if (result.error && result.error.line != null) { state.err = { line: result.error.line, column: result.error.column, syntax: false }; renderEditor(); }
}

$('#runBtn').addEventListener('click', run);
$('#stopBtn').addEventListener('click', () => runner.stop());
$('#clearBtn').addEventListener('click', () => { lastResult = null; setStatus(null); $('#runMeta').textContent = ''; state.err = null; renderEditor(); renderConsoleEmpty(); });
$('#runKbd').textContent = IS_MAC ? '⌘ ↵' : 'Ctrl ↵';

// ---------------------------------------------------------------------------
// Панель: примеры, меню, ввод, файл
// ---------------------------------------------------------------------------
const examples = DATA.EXAMPLES.filter((x) => !x.science);
const sel = $('#exampleSel');
examples.forEach((ex) => { const o = document.createElement('option'); o.value = ex.id; o.textContent = ex.title; sel.appendChild(o); });
sel.addEventListener('change', () => {
  const ex = examples.find((x) => x.id === sel.value);
  if (ex) { setCode(ex.code, { focus: false, top: true }); lastResult = null; setStatus(null); renderConsoleEmpty(); }
});
$('#inputBtn').addEventListener('click', () => {
  const box = $('#stdinBox');
  box.hidden = !box.hidden;
  $('#inputBtn').setAttribute('aria-expanded', String(!box.hidden));
});
const moreBtn = $('#moreBtn'), moreMenu = $('#moreMenu');
function closeMenu() { moreMenu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); }
moreBtn.addEventListener('click', (e) => { e.stopPropagation(); moreMenu.hidden = !moreMenu.hidden; moreBtn.setAttribute('aria-expanded', String(!moreMenu.hidden)); });
document.addEventListener('click', (e) => { if (!moreMenu.hidden && !moreMenu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
$('#copyBtn').addEventListener('click', () => { closeMenu(); copyText(ta.value); });
$('#resetBtn').addEventListener('click', () => { closeMenu(); sel.value = ''; setCode(examples[0].code, { top: true }); lastResult = null; setStatus(null); renderConsoleEmpty(); });
$('#openBtn').addEventListener('click', () => { closeMenu(); $('#fileInput').click(); });
$('#fileInput').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => { setCode(String(reader.result).replace(/\r\n/g, '\n'), { top: true }); toast(t('file_loaded')); };
  reader.onerror = () => toast(t('file_error'));
  reader.readAsText(f, 'utf-8');
  e.target.value = '';
});

function loadIntoEditor(code) {
  sel.value = '';
  setCode(code, { top: true });
  lastResult = null; setStatus(null); renderConsoleEmpty();
  $('#play').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => ta.focus({ preventScroll: true }), 350);
}

// ---------------------------------------------------------------------------
// Карточки, тур, библиотека, таблица слов
// ---------------------------------------------------------------------------
function inlineResult(code, expectError) {
  const wrap = document.createElement('div');
  wrap.className = 'result';
  const lbl = document.createElement('span');
  lbl.className = 'lbl';
  lbl.textContent = t('result');
  wrap.appendChild(lbl);
  const res = engine.run(code, { timeout: 2, maxSteps: 2000000, maxOutput: 20000, maxDepth: 150 });
  const body = document.createElement('div');
  renderOutput(body, res, code, {});
  wrap.appendChild(body);
  return wrap;
}
function openBtn(code) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn btn-sm'; b.textContent = t('open_in_editor');
  b.addEventListener('click', () => loadIntoEditor(code));
  return b;
}

function renderCards() {
  const host = $('#cards');
  host.innerHTML = '';
  DATA.TOUR.cards.forEach((c) => {
    const el = document.createElement('article');
    el.className = 'card' + (c.wide ? ' wide' : '');
    const head = document.createElement('div');
    head.className = 'card-head';
    head.innerHTML = `<h3>${esc(pick(c.title))}</h3><p>${esc(pick(c.text))}</p>`;
    const body = document.createElement('div');
    body.className = 'card-code';
    body.style.display = 'grid'; body.style.gap = '10px'; body.style.minWidth = '0';
    body.appendChild(codeBlock(c.code));
    body.appendChild(inlineResult(c.code, c.expect === 'error'));
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.appendChild(openBtn(c.code));
    if (c.wide) { head.appendChild(actions); } else { el.appendChild(head); el.appendChild(body); el.appendChild(actions); }
    if (c.wide) { el.appendChild(head); el.appendChild(body); }
    host.appendChild(el);
  });
}

function renderTour() {
  const tabs = $('#tourTabs'), panel = $('#tourPanel');
  const sections = DATA.TOUR.sections;
  if (!state.tourId) state.tourId = sections[0].id;
  tabs.innerHTML = '';
  sections.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tab'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(s.id === state.tourId));
    b.textContent = pick(s.title);
    b.addEventListener('click', () => { state.tourId = s.id; renderTour(); });
    tabs.appendChild(b);
  });
  const s = sections.find((x) => x.id === state.tourId);
  panel.innerHTML = '';
  const text = document.createElement('div');
  text.className = 'tour-text';
  text.innerHTML = `<h3>${esc(pick(s.title))}</h3><p>${esc(pick(s.text))}</p>`;
  const actions = document.createElement('div');
  actions.className = 'tour-actions';
  actions.appendChild(openBtn(s.code));
  text.appendChild(actions);
  const code = document.createElement('div');
  code.className = 'tour-code';
  code.appendChild(codeBlock(s.code));
  code.appendChild(inlineResult(s.code, false));
  panel.appendChild(text);
  panel.appendChild(code);
}

function renderLibFilters() {
  const host = $('#libFilters');
  const cats = ['all', ...Array.from(new Set(LANGUAGE.builtins.map((b) => b.category)))];
  host.innerHTML = '';
  cats.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'filter'; b.setAttribute('aria-pressed', String(state.libCat === c));
    b.textContent = c === 'all' ? t('all') : t('cat_' + c);
    b.addEventListener('click', () => { state.libCat = c; renderLibFilters(); renderLib(); });
    host.appendChild(b);
  });
}
function isLocalOnly(b) { return b.category === 'science' || b.category === 'io' || b.unsafe; }
function renderLib() {
  const grid = $('#libGrid');
  const q = state.libQuery.trim().toLowerCase();
  const list = LANGUAGE.builtins.filter((b) => (state.libCat === 'all' || b.category === state.libCat) &&
    (!q || b.name.toLowerCase().includes(q) || (b.aliases || []).some((a) => a.toLowerCase().includes(q)) || b.doc.toLowerCase().includes(q) || b.signature.toLowerCase().includes(q)));
  grid.innerHTML = '';
  const note = $('#libNote');
  const notes = [];
  if (LANGUAGE.builtins.some(isLocalOnly)) notes.push(t('lib_local_note'));
  if (state.lang === 'kk') notes.push(t('docs_ru_only'));
  note.textContent = notes.join(' ');
  note.hidden = !notes.length;
  if (!list.length) { const p = document.createElement('p'); p.className = 'nothing'; p.textContent = t('no_match'); grid.appendChild(p); return; }
  list.forEach((b) => {
    const el = document.createElement('article');
    el.className = 'fn';
    const sig = document.createElement('div');
    sig.className = 'fn-sig';
    sig.innerHTML = '<code>' + staticHtml(b.signature) + '</code>';
    const doc = document.createElement('p');
    doc.className = 'fn-doc';
    doc.textContent = b.doc;
    const foot = document.createElement('div');
    foot.className = 'fn-foot';
    const cat = document.createElement('span');
    cat.className = 'tag'; cat.textContent = t('cat_' + b.category);
    foot.appendChild(cat);
    (b.aliases || []).forEach((a) => { const tg = document.createElement('span'); tg.className = 'tag alias'; tg.textContent = t('synonym') + ' ' + a; foot.appendChild(tg); });
    if (isLocalOnly(b)) { const tg = document.createElement('span'); tg.className = 'tag local'; tg.textContent = t('local_only'); foot.appendChild(tg); }
    const sp = document.createElement('span'); sp.className = 'spacer'; foot.appendChild(sp);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn btn-sm'; btn.textContent = t('insert');
    btn.addEventListener('click', () => {
      ta.focus();
      insertText(b.name + '(');
      toast(t('inserted'));
    });
    foot.appendChild(btn);
    el.appendChild(sig); el.appendChild(doc); el.appendChild(foot);
    grid.appendChild(el);
  });
}
$('#libSearch').addEventListener('input', (e) => { state.libQuery = e.target.value; renderLib(); });

function renderKeywords() {
  const body = $('#kwBody');
  body.innerHTML = '';
  LANGUAGE.keywords.forEach((k) => {
    const tr = document.createElement('tr');
    const alias = (k.aliases || []).map((a) => `<code class="al">${esc(a)}</code>`).join(', ') || `<span class="muted">${esc(t('none'))}</span>`;
    const desc = state.lang === 'kk' ? (KW_KK[k.name] || k.description) : k.description;
    tr.innerHTML = `<td><code>${esc(k.name)}</code></td><td>${alias}</td><td class="like">${esc(k.equivalent)}</td><td>${esc(desc)}</td>`;
    body.appendChild(tr);
  });
}

function renderDynamic() {
  renderCards();
  renderTour();
  renderLibFilters();
  renderLib();
  renderKeywords();
}

// ---------------------------------------------------------------------------
// Тема и язык
// ---------------------------------------------------------------------------
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  $('#themeBtn').textContent = theme === 'dark' ? '☾' : '☀';
  store.set('qazaq.theme', theme);
}
function initialTheme() {
  const saved = store.get('qazaq.theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
$('#themeBtn').addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'));
$('#langBtn').addEventListener('click', () => {
  state.lang = state.lang === 'ru' ? 'kk' : 'ru';
  store.set('qazaq.lang', state.lang);
  applyI18n();
  renderDynamic();
  checkSyntax();
});

// ---------------------------------------------------------------------------
// Старт
// ---------------------------------------------------------------------------
applyTheme(initialTheme());
$('#verTag').textContent = 'v' + LANGUAGE.version;
$('#footVer').textContent = 'Qazaq ' + LANGUAGE.version + ' · MIT';
ta.value = store.get('qazaq.code') || examples[0].code;
applyI18n();
renderDynamic();
renderEditor();
updatePos();
checkSyntax();
runner.start();
updateEngineChip();
detectServer();


// ---------------------------------------------------------------------------
// Демо-терминал: печатает настоящие фрагменты, точка «приземляется» последней,
// вывод вычисляет тот же движок
// ---------------------------------------------------------------------------
(function demoLoop() {
  const lineEl = $('#demoLine'), outEl = $('#demoOut');
  if (!lineEl) return;
  const SNIPPETS = [
    'жаз("Сәлем, әлем")',
    'жаз(2 ** 100)',
    'жаз(сұрып(["қарбыз", "алма", "өрік"]))',
    'жаз(талда([4, 8, 15, 16, 23, 42])["орташа"])',
    'жаз(ұзындық("Қазақстан"), "әріп")',
    'жаз(ф"{дөңгелекте(пи, 4)}")',
  ];
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const outputOf = (code) => { const r = engine.run(code + '.', { timeout: 1, maxSteps: 100000 }); return r.stdout.replace(/\n$/, ''); };
  const draw = (text, withDot, landed) => {
    lineEl.innerHTML = staticHtml(text) + (withDot ? `<span class="t-end${landed ? ' land' : ''}">.</span>` : '<span class="caret-blink"></span>');
  };
  if (reduced) {
    draw(SNIPPETS[0], true, false);
    outEl.hidden = false; outEl.textContent = outputOf(SNIPPETS[0]);
    return;
  }
  (async function loop() {
    let i = 0;
    for (;;) {
      const code = SNIPPETS[i % SNIPPETS.length];
      outEl.hidden = true; outEl.textContent = '';
      for (let k = 1; k <= code.length; k++) {
        while (document.hidden) await sleep(400);
        draw(code.slice(0, k), false, false);
        await sleep(code[k - 1] === ' ' ? 28 : 38 + Math.random() * 34);
      }
      await sleep(260);
      draw(code, true, true);
      await sleep(420);
      outEl.textContent = outputOf(code);
      outEl.hidden = false;
      await sleep(2600);
      i++;
    }
  })();
})();

// для отладки и автотестов
window.__qazaq = { engine, run, setCode, runner, state };
})();
