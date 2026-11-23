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
    tab_steps: 'Шаги', steps_play: '▶ Авто', steps_pause: '❚❚ Пауза', steps_reload: '↻ Заново', steps_vars: 'Переменные', steps_stack: 'Вызовы', steps_out: 'Вывод к этому шагу',
    steps_note: 'Выполнение по шагам: золотая полоса в редакторе показывает строку, которая выполнится следующей. Таблица — значения переменных до этого шага.',
    steps_info: 'шаг {i} из {n}', steps_line: 'строка {line}', steps_end: 'программа завершена', steps_full: 'Показаны только первые {n} шагов.', steps_stale: 'Код изменён — нажмите «Заново».', steps_locals: 'в функции', steps_globals: 'глобальные', steps_novars: 'переменных пока нет', steps_top: 'главная программа',
    tab_tokens: 'Токены', tab_tree: 'Дерево', tokens_note: 'Токены — «слова», на которые лексер режет программу. Нажмите на токен — он выделится в редакторе.', tree_note: 'Дерево разбора (AST): так парсер понял программу. Каждый узел — действие, вложенные узлы — его части.', lab_empty: 'Введите код в редакторе.', lab_err: 'Код нельзя разобрать:', lab_more: 'Показаны первые {n} токенов.',
    nav_book: 'Книга', book_kicker: 'Книга', book_title: 'Как это сделано — простыми словами',
    book_sub: 'Каждая глава рассказана трижды: для ребёнка, подробнее и применительно к этому проекту. Подчёркнутые слова — термины: нажмите, и появится пояснение.',
    book_back: '← К редактору', book_print: 'Сохранить как PDF', toc: 'Содержание', chapter: 'Глава',
    lbl_kid: 'Простыми словами', lbl_more: 'Подробнее', lbl_here: 'В проекте', lbl_try: 'Попробуйте', lbl_check: 'Проверьте себя',
    run_it: 'Выполнить', glossary_title: 'Словарь терминов', glossary_sub: 'Все термины книги по алфавиту. Нажмите на слово в тексте — появится то же объяснение.',
    glossary_ph: 'Найти термин…', term_precise: 'Точнее', term_chapter: 'Глава', term_close: 'Закрыть', term_none: 'Ничего не найдено.',
    settings: 'Настройки', err_lang: 'Ошибки', brackets: 'Скобки', brackets_round: '( ) обычные', brackets_square: '[ ] шаршы', font_size: 'Шрифт', motion: 'Анимации', on: 'вкл', off: 'выкл',
    brackets_converted: 'Код преобразован: скобки поменялись местами',
    examples: 'Примеры', stdin_btn: 'Ввод', more: 'Ещё', copy_code: 'Копировать код', share_link: 'Скопировать ссылку на код', share_done: 'Ссылка на код скопирована', share_big: 'Код слишком длинный для ссылки (максимум 6000 знаков)', open_file: 'Открыть файл .qaz', reset: 'Сбросить',
    stdin_label: 'Ввод для енгіз(): каждая строка — один вызов', run: 'Запустить', stop: 'Остановить', clear: 'Очистить', output: 'Вывод',
    about_kicker: 'Язык', about_title: 'Простота снаружи, мощность внутри',
    about_sub: 'Шесть идей, ради которых Qazaq сделан именно таким. Каждый пример можно запустить на месте или открыть в редакторе.',
    tour_kicker: 'Тур', tour_title: 'Язык за десять минут',
    tour_sub: 'Выберите тему: слева текст, справа код и его настоящий вывод. Результат вычисляет тот же движок, что запускает ваш код.',
    lib_kicker: 'Стандартная библиотека', lib_title: 'Встроенные функции',
    lib_sub: 'Одно слово: одно действие. Нажмите «Вставить», и имя функции появится в редакторе.',
    search: 'Поиск', search_ph: 'Найти функцию…',
    kw_kicker: 'Словарь', kw_title: 'Ключевые слова',
    kw_sub: 'Двадцать два слова и два полных написания: используйте то, что удобнее. Оба варианта работают одинаково.',
    kw_word: 'Слово', kw_alias: 'Полное написание', kw_like: 'Аналог', kw_desc: 'Назначение',
    foot_note: 'Сайт работает целиком в браузере: код не отправляется на сервер. Функции сыз, оқы, сақта, а также шеш, туын, интегр за пределами многочленов (функции, корни выше второй степени, комплексные корни) доступны в локальной версии: qaz run main.qaz.',
    // динамические
    engine_ready: 'Движок готов', engine_worker: 'в фоновом потоке', engine_inline: 'в браузере', engine_server: 'на сервере (Python)', engine_browser: 'Браузер (JS)', engine_pyserver: 'Сервер (Python)',
    running: 'Выполняется…', stopped: 'Остановлено', st_ok: 'Успешно', st_error: 'Ошибка', st_limit: 'Лимит', st_run: 'Идёт',
    syntax_ok: 'Синтаксис в порядке', syntax_bad: 'Строка {line}: {msg}', empty: 'Пока ничего нет. Нажмите «Запустить» (', empty2: ').',
    no_output: '(программа завершилась без вывода)', line: 'строка', column: 'столбец', hint: 'Подсказка', trace: 'Цепочка вызовов',
    copy_report: 'Копировать отчёт', copied: 'Скопировано', copy_failed: 'Не удалось скопировать',
    insert: 'Вставить', inserted: 'Вставлено в редактор', open_in_editor: 'Открыть в редакторе', local_only: 'только локально',
    poly_only: 'в браузере: многочлены', synonym: 'синоним', no_match: 'Ничего не найдено', all: 'Все', time: 'время', steps: 'шагов', result: 'Результат',
    file_loaded: 'Файл загружен', file_error: 'Не удалось прочитать файл', stopped_msg: 'Выполнение остановлено',
    docs_ru_only: '',
    cat_core: 'Основные', cat_math: 'Математика', cat_data: 'Данные', cat_ai: 'Прогноз', cat_science: 'Наука', cat_io: 'Файлы',
    lib_local_note: 'Функции с пометкой «только локально» работают в установленном Qazaq (qaz run), но не в браузере. шеш, туын, интегр в браузере понимают многочлены с целыми коэффициентами.',
    none: '—',
  },
  kk: {
    nav_play: 'Редактор', nav_about: 'Тіл туралы', nav_tour: 'Шолу', nav_library: 'Функциялар', nav_keywords: 'Сөздер',
    eyebrow: 'Қазақ тіліндегі бағдарламалау тілі',
    lead: 'Кодты қазақша жазыңыз да, дәл осы жерде іске қосыңыз. Орнату да, сервер де қажет емес.',
    fact1: 'Нүкте нұсқауды аяқтайды', fact2: 'Қазақ әріптері барлық жерде: ә ғ қ ң ө ұ ү һ і', fact3: 'Браузерде жұмыс істейді, нәтиже лезде шығады',
    cta_tour: 'Тілге шолу', cta_lib: 'Барлық функциялар',
    tab_steps: 'Қадамдар', steps_play: '▶ Авто', steps_pause: '❚❚ Үзіліс', steps_reload: '↻ Қайта', steps_vars: 'Айнымалылар', steps_stack: 'Шақырулар', steps_out: 'Осы қадамға дейінгі шығыс',
    steps_note: 'Қадамдап орындау: редактордағы алтын жолақ келесі орындалатын жолды көрсетеді. Кесте — осы қадамға дейінгі айнымалы мәндері.',
    steps_info: '{n} қадамның {i}-і', steps_line: '{line}-жол', steps_end: 'бағдарлама аяқталды', steps_full: 'Тек алғашқы {n} қадам көрсетілген.', steps_stale: 'Код өзгерді — «Қайта» түймесін басыңыз.', steps_locals: 'функцияда', steps_globals: 'жаһандық', steps_novars: 'әзірге айнымалы жоқ', steps_top: 'басты бағдарлама',
    tab_tokens: 'Токендер', tab_tree: 'Ағаш', tokens_note: 'Токендер — лексер бағдарламаны бөлетін «сөздер». Токенді басыңыз — ол редакторда белгіленеді.', tree_note: 'Талдау ағашы (AST): парсер бағдарламаны осылай түсінді. Әр түйін — әрекет, ішкі түйіндер — оның бөліктері.', lab_empty: 'Редакторға код енгізіңіз.', lab_err: 'Кодты талдау мүмкін емес:', lab_more: 'Алғашқы {n} токен көрсетілген.',
    nav_book: 'Кітап', book_kicker: 'Кітап', book_title: 'Бұл қалай жасалған — қарапайым сөзбен',
    book_sub: 'Әр тарау үш рет айтылады: бала үшін, толығырақ және осы жоба бойынша. Сызылған сөздер — терминдер: басыңыз, түсіндірме шығады. (Кітап мәтіні орыс тілінде.)',
    book_back: '← Редакторға', book_print: 'PDF ретінде сақтау', toc: 'Мазмұны', chapter: 'Тарау',
    lbl_kid: 'Қарапайым сөзбен', lbl_more: 'Толығырақ', lbl_here: 'Жобада', lbl_try: 'Байқап көріңіз', lbl_check: 'Өзіңізді тексеріңіз',
    run_it: 'Орындау', glossary_title: 'Терминдер сөздігі', glossary_sub: 'Кітаптағы барлық терминдер әліпби бойынша. Мәтіндегі сөзді басыңыз — сол түсіндірме шығады.',
    glossary_ph: 'Терминді іздеу…', term_precise: 'Дәлірек', term_chapter: 'Тарау', term_close: 'Жабу', term_none: 'Ештеңе табылмады.',
    settings: 'Баптаулар', err_lang: 'Қателер', brackets: 'Жақшалар', brackets_round: '( ) әдеттегі', brackets_square: '[ ] шаршы', font_size: 'Қаріп', motion: 'Анимация', on: 'қосу', off: 'өшіру',
    brackets_converted: 'Код түрлендірілді: жақшалар орын ауыстырды',
    examples: 'Мысалдар', stdin_btn: 'Енгізу', more: 'Тағы', copy_code: 'Кодты көшіру', share_link: 'Кодқа сілтемені көшіру', share_done: 'Кодқа сілтеме көшірілді', share_big: 'Код сілтеме үшін тым ұзын (ең көбі 6000 таңба)', open_file: '.qaz файлын ашу', reset: 'Қайта қою',
    stdin_label: 'енгіз() үшін деректер: әр жол — бір шақыру', run: 'Іске қосу', stop: 'Тоқтату', clear: 'Тазалау', output: 'Нәтиже',
    about_kicker: 'Тіл', about_title: 'Қарапайымдылық сыртында, қуат ішінде',
    about_sub: 'Qazaq дәл осылай жасалуының алты идеясы. Әр мысалды сол жерде іске қосуға немесе редакторда ашуға болады.',
    tour_kicker: 'Шолу', tour_title: 'Тіл он минутта',
    tour_sub: 'Тақырыпты таңдаңыз: сол жақта мәтін, оң жақта код пен оның нақты нәтижесі. Нәтижені кодыңызды іске қосатын қозғалтқыштың өзі есептейді.',
    lib_kicker: 'Стандартты кітапхана', lib_title: 'Ішкі функциялар',
    lib_sub: 'Бір сөз: бір әрекет. «Қою» түймесін басыңыз, функция атауы редакторда пайда болады.',
    search: 'Іздеу', search_ph: 'Функцияны іздеу…',
    kw_kicker: 'Сөздік', kw_title: 'Кілт сөздер',
    kw_sub: 'Жиырма екі сөз және екі толық жазылу: қолайлысын қолданыңыз. Екі нұсқа бірдей жұмыс істейді.',
    kw_word: 'Сөз', kw_alias: 'Толық жазылуы', kw_like: 'Баламасы', kw_desc: 'Мақсаты',
    foot_note: 'Сайт толығымен браузерде жұмыс істейді: код серверге жіберілмейді. сыз, оқы, сақта функциялары, сондай-ақ көпмүшелерден тыс шеш, туын, интегр (функциялар, екінші дәрежеден жоғары түбірлер, комплекс түбірлер) жергілікті нұсқада жұмыс істейді: qaz run main.qaz.',
    engine_ready: 'Қозғалтқыш дайын', engine_worker: 'фондық ағында', engine_inline: 'браузерде', engine_server: 'серверде (Python)', engine_browser: 'Браузер (JS)', engine_pyserver: 'Сервер (Python)',
    running: 'Орындалуда…', stopped: 'Тоқтатылды', st_ok: 'Сәтті', st_error: 'Қате', st_limit: 'Шектеу', st_run: 'Жүріп жатыр',
    syntax_ok: 'Синтаксис дұрыс', syntax_bad: '{line}-жол: {msg}', empty: 'Әзірге нәтиже жоқ. «Іске қосу» түймесін басыңыз (', empty2: ').',
    no_output: '(бағдарлама ештеңе шығармады)', line: 'жол', column: 'баған', hint: 'Кеңес', trace: 'Шақырулар тізбегі',
    copy_report: 'Есепті көшіру', copied: 'Көшірілді', copy_failed: 'Көшіру мүмкін болмады',
    insert: 'Қою', inserted: 'Редакторға қойылды', open_in_editor: 'Редакторда ашу', local_only: 'тек жергілікті',
    poly_only: 'в браузере: многочлены', synonym: 'синоним', no_match: 'Ештеңе табылмады', all: 'Барлығы', time: 'уақыт', steps: 'қадам', result: 'Нәтиже',
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
// Язык сообщений об ошибках: выбранный явно или, пока не выбран, язык интерфейса.
const msgLang = () => { const v = store.get('qazaq.msglang'); return v === 'ru' || v === 'kk' ? v : state.lang; };

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
const RE_OP = /\*\*|\/\/|==|!=|<=|>=|\+=|-=|\*=|\/=|\|>|[-+*\/%<>=×÷≤≥≠−]/y;

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
    if ((ch === '#' || ch === ';') && !inInterp) { let j = text.indexOf('\n', i); if (j < 0) j = n; out.push({ c: 't-com', s: text.slice(i, j) }); i = j; continue; }
    if (ch === '"' || ch === "'") { i = scanString(text, i, ch, false, out); prevDot = false; continue; }
    if (ch === 'ф' && (text[i + 1] === '"' || text[i + 1] === "'")) { out.push({ c: 't-str', s: 'ф' }); i = scanString(text, i + 1, text[i + 1], true, out); prevDot = false; continue; }
    if (ch >= '0' && ch <= '9') { RE_NUM.lastIndex = i; const m = RE_NUM.exec(text); out.push({ c: 't-num', s: m[0] }); i += m[0].length; prevDot = false; continue; }
    if (ch === '.') {
      const nx = text[i + 1];
      if (nx === undefined || nx === ' ' || nx === '\t' || nx === '\n' || nx === '#' || nx === ';') { out.push({ c: 't-end', s: '.' }); prevDot = false; }
      else { out.push({ c: 't-dot', s: '.' }); prevDot = true; }
      i++; continue;
    }
    if ((ch === '?' || ch === '!') && text[i + 1] !== '=') {
      const nx = text[i + 1];
      if (nx === undefined || nx === ' ' || nx === '\t' || nx === '\n' || nx === '#' || nx === ';') { out.push({ c: 't-end', s: ch }); i++; prevDot = false; continue; }
    }
    if (ch === ':') {
      const rest = text.slice(i + 1, i + 200);
      const endOfLine = /^[ \t]*(?:[#;][^\n]*)?(?:\n|$)/.test(rest);
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
  pre.tabIndex = 0;
  pre.setAttribute('role', 'region');
  pre.setAttribute('aria-label', 'Qazaq');
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
  hlCode.innerHTML = lines.map((h, i) => `<span class="ln${state.err && state.err.line === i + 1 ? ' err' : ''}${state.stepLine === i + 1 ? ' step' : ''}">${h}</span>`).join('');
  if (lines.length !== ed.lines || true) {
    gutterIn.innerHTML = lines.map((_, i) => `<div class="${state.err && state.err.line === i + 1 ? 'err' : state.stepLine === i + 1 ? 'step' : i + 1 === curLine ? 'cur' : ''}">${i + 1}</div>`).join('');
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
  scheduleLab();
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
    const code = before.replace(/[#;].*$/, '').trimEnd();
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
  const err = engine.check(ta.value, msgLang());
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
  scheduleLab();
  acUpdate();
  refreshSettings();
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
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
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
  if (/[#;]/.test(lineBefore) || ((lineBefore.match(/"/g) || []).length % 2 === 1 && !/ф"[^"]*\{[^}]*$/.test(lineBefore))) return acHide();
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
  const e = engine.translateError(result.error, msgLang());
  const card = document.createElement('div');
  card.className = 'errcard';
  let html = `<p class="err-title">${esc(e.title)}</p><p class="err-msg">${esc(e.message)}</p>`;
  const lines = code.replace(/\r\n/g, '\n').split('\n');
  if (e.line != null && lines[e.line - 1] !== undefined) {
    const num = String(e.line);
    const src = lines[e.line - 1];
    const caret = e.column != null ? ' '.repeat(num.length) + ' | ' + ' '.repeat(Math.max(e.column - 1, 0)) + '<span class="caret">^</span>' : '';
    html += `<pre class="err-src" tabindex="0"><code>${esc(num + ' | ' + src)}${caret ? '\n' + caret : ''}</code></pre>`;
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
let lastCode = '';
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
  lastCode = code;
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
// Настройки: режим скобок (с преобразованием кода), размер шрифта, анимации
// ---------------------------------------------------------------------------
const PRAGMA_RE = /^[ \t]*[;#]![ \t]*(жақша[ \t]*=[ \t]*шаршы|brackets[ \t]*=[ \t]*square)[ \t]*(?:\n|$)/i;
const SWAP_BR = { '(': '[', ')': ']', '[': '(', ']': ')' };
function codeIsSquare(code) {
  for (const line of code.split('\n').slice(0, 8)) {
    const l = line.trim();
    if (!l) continue;
    if ((l[0] === ';' || l[0] === '#') && l[1] === '!') { if (/(жақша\s*=\s*шаршы|brackets\s*=\s*square)/i.test(l)) return true; continue; }
    if (l[0] === ';' || l[0] === '#') continue;
    break;
  }
  return false;
}
function convertBrackets(code, toSquare) {
  const swapped = tokenize(code).map((tok) => (tok.c === 't-op' && tok.s.length === 1 && SWAP_BR[tok.s] ? SWAP_BR[tok.s] : tok.s)).join('');
  if (toSquare) return codeIsSquare(code) ? code : ';! жақша = шаршы\n' + swapped;
  return swapped.replace(PRAGMA_RE, '');
}
function refreshSettings() {
  const sq = codeIsSquare(ta.value);
  $('#brRound').setAttribute('aria-pressed', String(!sq));
  $('#brSquare').setAttribute('aria-pressed', String(sq));
  $('#errRu').setAttribute('aria-pressed', String(msgLang() === 'ru'));
  $('#errKk').setAttribute('aria-pressed', String(msgLang() === 'kk'));
  const off = state.motionOff;
  $('#motionOn').setAttribute('aria-pressed', String(!off));
  $('#motionOff').setAttribute('aria-pressed', String(off));
}
function setBrackets(square) {
  if (codeIsSquare(ta.value) === square) { refreshSettings(); return; }
  let converted;
  try { converted = convertBrackets(ta.value, square); } catch (e) { return; }
  setCode(converted);
  toast(t('brackets_converted'));
  refreshSettings();
}
function applyFontSize(px) {
  px = Math.max(11, Math.min(22, px));
  state.fontPx = px;
  const ed = $('#editor');
  ed.style.setProperty('--fs', px + 'px');
  ed.style.setProperty('--lh', Math.round(px * 1.57) + 'px');
  store.set('qazaq.fs', String(px));
  renderEditor();
}
function setMsgLang(lang) {
  store.set('qazaq.msglang', lang);
  refreshSettings();
  checkSyntax();
  if (lastResult && lastResult.error) renderOutput(consoleBody, lastResult, lastCode, { jump: true, report: true });
}
function applyMotion(off) {
  state.motionOff = off;
  document.documentElement.dataset.motion = off ? 'off' : 'on';
  store.set('qazaq.motion', off ? 'off' : 'on');
  refreshSettings();
}
const settingsBtn = $('#settingsBtn'), settingsMenu = $('#settingsMenu');
function closeSettings() { settingsMenu.hidden = true; settingsBtn.setAttribute('aria-expanded', 'false'); }
settingsBtn.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); settingsMenu.hidden = !settingsMenu.hidden; settingsBtn.setAttribute('aria-expanded', String(!settingsMenu.hidden)); refreshSettings(); });
document.addEventListener('click', (e) => { if (!settingsMenu.hidden && !settingsMenu.contains(e.target) && e.target !== settingsBtn) closeSettings(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSettings(); });
$('#brRound').addEventListener('click', () => setBrackets(false));
$('#brSquare').addEventListener('click', () => setBrackets(true));
$('#fsDown').addEventListener('click', () => applyFontSize((state.fontPx || 14) - 1));
$('#fsUp').addEventListener('click', () => applyFontSize((state.fontPx || 14) + 1));
$('#errRu').addEventListener('click', () => setMsgLang('ru'));
$('#errKk').addEventListener('click', () => setMsgLang('kk'));
$('#motionOn').addEventListener('click', () => applyMotion(false));
$('#motionOff').addEventListener('click', () => applyMotion(true));

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

// Ссылка на код: код кодируется в адрес страницы (#code=…), сервер не нужен
const SHARE_MAX = 6000;
function b64urlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function shareUrl(code) {
  return location.href.split('#')[0] + '#code=' + b64urlEncode(code);
}
function codeFromHash() {
  const m = /^#code=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return null;
  try { return b64urlDecode(m[1]); } catch (e) { return null; }
}
$('#shareBtn').addEventListener('click', () => {
  closeMenu();
  if (ta.value.length > SHARE_MAX) { toast(t('share_big')); return; }
  const url = shareUrl(ta.value);
  copyText(url);
  toast(t('share_done'));
});

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
  if (document.body.dataset.view === 'book') { delete document.body.dataset.view; closeTerm(false); try { history.replaceState(null, '', '#play'); } catch (e) { /* ignore */ } }
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
const POLY_ONLY = new Set(['шеш', 'туын', 'интегр']);
function isLocalOnly(b) { return !POLY_ONLY.has(b.name) && (b.category === 'science' || b.category === 'io' || b.unsafe); }
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
    sig.tabIndex = 0;
    sig.setAttribute('role', 'region');
    sig.setAttribute('aria-label', b.name);
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
    if (POLY_ONLY.has(b.name)) { const tg = document.createElement('span'); tg.className = 'tag alias'; tg.textContent = t('poly_only'); foot.appendChild(tg); }
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
  renderBook();
}


// ---------------------------------------------------------------------------
// Лаборатория: токены и дерево разбора под редактором
// ---------------------------------------------------------------------------
const KIND_RU = { INT: 'целое', FLOAT: 'дробное', STR: 'строка', FSTR: 'ф-строка', NAME: 'имя', KW: 'слово', OP: 'знак', DOT: 'точка-член', END: 'конец', NL: 'новая строка', INDENT: 'отступ+', DEDENT: 'отступ−', EOF: 'конец файла' };
const NODE_RU = { Literal: 'значение', Name: 'имя', Binary: 'операция', Unary: 'унарная', Logical: 'логика', Compare: 'сравнение', Call: 'вызов', Attr: 'член', Index: 'индекс', ListLit: 'список', DictLit: 'словарь', TupleLit: 'кортеж', FString: 'ф-строка', Lambda: 'лямбда', Ternary: 'условие', Pipe: 'конвейер', ListComp: 'генератор списка', DictComp: 'генератор словаря', VarDecl: 'объявление', VarDeclMulti: 'объявление списком', TargetList: 'цели', ExprStmt: 'выражение', If: 'если', While: 'пока', For: 'цикл', FuncDef: 'функция', ClassDef: 'класс', Return: 'вернуть', Try: 'байқа', Raise: 'бросить', Assign: 'присваивание', Program: 'программа', Spread: 'раскрыть *' };
let labPane = 'out';
let labTimer = null;
function setLabPane(pane, focus) {
  labPane = pane;
  $$('#ctabs .ctab').forEach((b) => { const on = b.dataset.pane === pane; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
  $('#consoleBody').hidden = pane !== 'out';
  $('#labTokens').hidden = pane !== 'tokens';
  $('#labTree').hidden = pane !== 'tree';
  $('#labSteps').hidden = pane !== 'steps';
  if (pane !== 'steps') leaveSteps();
  renderLab();
}
function scheduleLab() {
  if (labPane === 'out') return;
  if (labPane === 'steps') { if (steps.data) $('#stNote').textContent = steps.code !== ta.value ? t('steps_stale') : $('#stNote').textContent; return; }
  clearTimeout(labTimer); labTimer = setTimeout(renderLab, 250);
}
function renderLab() {
  if (labPane === 'tokens') renderTokens();
  else if (labPane === 'tree') renderTree();
  else if (labPane === 'steps') enterSteps();
}
function labError(host, err) {
  const e = engine.translateError(err, msgLang());
  host.innerHTML = `<p class="lab-note">${esc(t('lab_err'))}</p><p class="err-msg" style="margin:0;color:var(--danger)">${esc(e.message)}${e.line != null ? ' (' + esc(t('line')) + ' ' + e.line + ')' : ''}</p>`;
}
function renderTokens() {
  const host = $('#labTokens');
  if (!ta.value.trim()) { host.innerHTML = `<p class="empty">${esc(t('lab_empty'))}</p>`; return; }
  const r = engine.tokens(ta.value);
  if (r.error) { labError(host, r.error); return; }
  const LIMIT = 600;
  const toks = r.tokens.slice(0, LIMIT);
  host.innerHTML = `<p class="lab-note">${esc(t('tokens_note'))}</p><div class="tok-list">` + toks.map((k, i) => {
    const shown = k.kind === 'NL' ? '↵' : k.kind === 'INDENT' ? '→' : k.kind === 'DEDENT' ? '←' : k.kind === 'EOF' ? '∎' : k.value;
    return `<button type="button" class="tok k-${k.kind}" data-i="${i}" title="${esc(t('line'))} ${k.line}, ${esc(t('column'))} ${k.col}"><span class="v">${esc(shown)}</span><small>${esc(KIND_RU[k.kind] || k.kind)}</small></button>`;
  }).join('') + '</div>' + (r.tokens.length > LIMIT ? `<p class="lab-note" style="margin-top:8px">${esc(t('lab_more', { n: LIMIT }))}</p>` : '');
  $$('#labTokens .tok', host).forEach((b) => b.addEventListener('click', () => {
    const k = toks[Number(b.dataset.i)];
    selectRange(k.line, k.col, k.endLine, k.endCol);
  }));
}
// выделяет в редакторе диапазон «строка/столбец → строка/столбец» (столбцы считаются с 1, в символах Unicode)
function selectRange(l1, c1, l2, c2) {
  const lines = ta.value.split('\n');
  const offset = (l, c) => { let o = 0; for (let i = 0; i < l - 1 && i < lines.length; i++) o += lines[i].length + 1; const line = lines[l - 1] || ''; return o + Array.from(line).slice(0, Math.max(c - 1, 0)).join('').length; };
  const a = offset(l1, c1), b = offset(l2 || l1, c2 || c1);
  ta.focus({ preventScroll: false });
  ta.setSelectionRange(a, Math.max(a, b));
  updatePos();
}
function treeNode(n, depth) {
  if (depth > 40) return '<li><span class="n">…</span></li>';
  const type = n.t || (Array.isArray(n) ? 'список' : 'узел');
  const prims = [], kids = [];
  for (const [k, v] of Object.entries(n)) {
    if (k === 't' || k === 'line' || k === 'col') continue;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) { if (v.length) kids.push([k, v]); }
    else if (typeof v === 'object') kids.push([k, v]);
    else prims.push([k, v]);
  }
  const chips = prims.map(([k, v]) => `<span class="f"><i>${esc(k)}=</i>${esc(typeof v === 'string' ? JSON.stringify(v) : String(v))}</span>`).join('');
  let out = `<li><span class="n">${esc(NODE_RU[type] || type)}<em>${esc(type)}</em></span>${chips}`;
  if (kids.length) {
    out += '<ul>' + kids.map(([k, v]) => {
      const items = Array.isArray(v) ? v : [v];
      return items.map((it, i) => {
        const label = `<span class="k">${esc(k)}${Array.isArray(v) && v.length > 1 ? '[' + i + ']' : ''}:</span>`;
        if (it && typeof it === 'object' && !Array.isArray(it)) return treeNode(it, depth + 1).replace('<li>', '<li>' + label);
        if (Array.isArray(it)) return `<li>${label}<ul>${it.map((x) => (x && typeof x === 'object' ? treeNode(x, depth + 1) : `<li><span class="f">${esc(String(x))}</span></li>`)).join('')}</ul></li>`;
        return `<li>${label}<span class="f">${esc(String(it))}</span></li>`;
      }).join('');
    }).join('') + '</ul>';
  }
  return out + '</li>';
}
function renderTree() {
  const host = $('#labTree');
  if (!ta.value.trim()) { host.innerHTML = `<p class="empty">${esc(t('lab_empty'))}</p>`; return; }
  const r = engine.tree(ta.value);
  if (r.error) { labError(host, r.error); return; }
  const body = Array.isArray(r.ast.body) ? r.ast.body : [r.ast];
  host.innerHTML = `<p class="lab-note">${esc(t('tree_note'))}</p><ul class="tree">${body.map((n) => treeNode(n, 0)).join('')}</ul>`;
}
$$('#ctabs .ctab').forEach((b) => {
  b.addEventListener('click', () => setLabPane(b.dataset.pane, false));
  b.addEventListener('keydown', (e) => {
    const tabs = $$('#ctabs .ctab');
    const i = tabs.indexOf(b);
    if (e.key === 'ArrowRight') { e.preventDefault(); setLabPane(tabs[(i + 1) % tabs.length].dataset.pane, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setLabPane(tabs[(i + tabs.length - 1) % tabs.length].dataset.pane, true); }
  });
});

// Шаги выполнения: пошаговый просмотр программы (состояние перед каждой инструкцией)
const steps = { data: null, i: 0, code: '', timer: null };
function stopPlay() { clearInterval(steps.timer); steps.timer = null; $('#stPlay').textContent = t('steps_play'); }
function leaveSteps() {
  stopPlay();
  if (state.stepLine != null) { state.stepLine = null; renderEditor(); }
}
function enterSteps() {
  // трассировка строится при открытии вкладки и по кнопке «Заново»; при правке кода — только пометка «устарело»
  if (!steps.data || steps.code !== ta.value) { runTrace(); return; }
  $('#stNote').textContent = steps.data.truncated ? t('steps_full', { n: steps.data.steps.length }) : t('steps_note');
  showStep(steps.i);
}
function runTrace() {
  stopPlay();
  const code = ta.value;
  steps.code = code;
  steps.data = engine.trace(code, { stdin: $('#stdinArea').value, lang: msgLang() });
  steps.i = 0;
  const n = steps.data.steps.length;
  $('#stSlider').max = String(Math.max(n - 1, 0));
  $('#stNote').textContent = steps.data.truncated ? t('steps_full', { n }) : t('steps_note');
  showStep(0);
}
function varsTable(caption, list, prev) {
  if (!list.length) return '';
  const prevMap = new Map(prev || []);
  return `<table class="st-table"><caption>${esc(caption)}</caption><tbody>` + list.map(([k, v]) =>
    `<tr${prevMap.has(k) && prevMap.get(k) !== v || (prev && !prevMap.has(k)) ? ' class="chg"' : ''}><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('') + '</tbody></table>';
}
function showStep(i) {
  const d = steps.data;
  if (!d || !d.steps.length) { $('#stVars').innerHTML = ''; $('#stInfo').textContent = ''; return; }
  i = Math.max(0, Math.min(i, d.steps.length - 1));
  steps.i = i;
  const st = d.steps[i], prev = i > 0 ? d.steps[i - 1] : null;
  $('#stSlider').value = String(i);
  $('#stInfo').textContent = t('steps_info', { i: i + 1, n: d.steps.length }) + ' · ' + (st.end ? t('steps_end') : t('steps_line', { line: st.line }));
  $('#stFirst').disabled = $('#stPrev').disabled = i === 0;
  $('#stNext').disabled = $('#stLast').disabled = i === d.steps.length - 1;
  let html = '';
  if (st.locals.length) html += varsTable(t('steps_locals') + ' ' + (st.frames[st.frames.length - 1] || '') + '()', st.locals, prev && prev.frames.length === st.frames.length ? prev.locals : null);
  html += varsTable(t('steps_globals'), st.globals, prev ? prev.globals : null);
  $('#stVars').innerHTML = html || `<p class="empty">${esc(t('steps_novars'))}</p>`;
  const stack = [...st.frames].reverse().map((f) => `<li>${esc(f)}()</li>`);
  stack.push(`<li>${esc(t('steps_top'))}</li>`);
  $('#stStack').innerHTML = stack.join('');
  $('#stOut').textContent = d.stdout.slice(0, st.end ? d.stdout.length : st.out);
  if (st.end && d.error) $('#stOut').textContent += '\n' + (engine.translateError(d.error, msgLang()).title) + ': ' + engine.translateError(d.error, msgLang()).message;
  state.stepLine = st.end ? null : st.line;
  renderEditor();
  if (state.stepLine) {
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    const top = (state.stepLine - 1) * lh;
    if (top < ta.scrollTop || top + lh * 2 > ta.scrollTop + ta.clientHeight) { ta.scrollTop = Math.max(0, top - ta.clientHeight / 3); syncScroll(); }
  }
}
$('#stFirst').addEventListener('click', () => { stopPlay(); showStep(0); });
$('#stPrev').addEventListener('click', () => { stopPlay(); showStep(steps.i - 1); });
$('#stNext').addEventListener('click', () => { stopPlay(); showStep(steps.i + 1); });
$('#stLast').addEventListener('click', () => { stopPlay(); showStep((steps.data ? steps.data.steps.length : 1) - 1); });
$('#stSlider').addEventListener('input', (e) => { stopPlay(); showStep(Number(e.target.value)); });
$('#stReload').addEventListener('click', runTrace);
$('#stPlay').addEventListener('click', () => {
  if (steps.timer) { stopPlay(); return; }
  if (!steps.data) return;
  if (steps.i >= steps.data.steps.length - 1) showStep(0);
  $('#stPlay').textContent = t('steps_pause');
  steps.timer = setInterval(() => {
    if (steps.i >= steps.data.steps.length - 1) { stopPlay(); return; }
    showStep(steps.i + 1);
  }, state.motionOff ? 400 : 650);
});

// ---------------------------------------------------------------------------
// Книга и термины
// ---------------------------------------------------------------------------
const BOOK = DATA.BOOK;
const TERMS = Object.fromEntries(BOOK.glossary.map((g) => [g.id, g]));
const CHAPTERS = Object.fromEntries(BOOK.chapters.map((c, i) => [c.id, Object.assign({ n: i + 1 }, c)]));

// Размечает текст книги: [[id|слово]] — термин-кнопка, `код`, **жирный**. Весь остальной текст экранируется.
function rich(text) {
  let h = esc(text);
  h = h.replace(/\[\[([a-z0-9-]+)\|(.+?)\]\]/g, (m, id, label) => (TERMS[id]
    ? `<button type="button" class="term" data-term="${id}" aria-expanded="false">${label}</button>` : label));
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return h;
}
const plain = (text) => text.replace(/\[\[[a-z0-9-]+\|(.+?)\]\]/g, '$1').replace(/[`*]/g, '');

function pipelineHtml() {
  const stages = [
    ['1', 'Текст', 'то, что вы напечатали', '<code>жаз(2 + 3).</code>'],
    ['2', 'Лексер', 'режет на токены', '<code>жаз</code> <code>(</code> <code>2</code> <code>+</code> <code>3</code> <code>)</code> <code>.</code>'],
    ['3', 'Парсер', 'строит дерево', '<code>вывод</code><br>└ <code>сложить</code><br>&nbsp;&nbsp;├ <code>2</code><br>&nbsp;&nbsp;└ <code>3</code>'],
    ['4', 'Интерпретатор', 'выполняет дерево', '2 + 3 → <code>5</code>'],
    ['5', 'Результат', 'вывод или ошибка', '<code>5</code>'],
  ];
  return '<ol class="pipe" aria-label="Pipeline">' + stages.map((st, i) =>
    `<li class="pipe-st"><span class="pipe-n" aria-hidden="true">${st[0]}</span><span class="pipe-name"><b>${st[1]}</b><span class="pipe-d">${st[2]}</span></span><span class="pipe-ex">${st[3]}</span></li>`
    + (i < stages.length - 1 ? '<li class="pipe-arrow" aria-hidden="true">↓</li>' : '')).join('') + '</ol>';
}

function blockHtml(b) {
  if (b.p) return `<p>${rich(b.p)}</p>`;
  if (b.h) return `<h4>${esc(b.h)}</h4>`;
  if (b.ul) return '<ul>' + b.ul.map((x) => `<li>${rich(x)}</li>`).join('') + '</ul>';
  if (b.ol) return '<ol>' + b.ol.map((x) => `<li>${rich(x)}</li>`).join('') + '</ol>';
  if (b.note) return `<p class="book-note">${rich(b.note)}</p>`;
  if (b.pipeline) return pipelineHtml();
  return '';
}

function renderBook() {
  const toc = $('#bookToc'), body = $('#bookBody');
  toc.innerHTML = `<p class="toc-title">${esc(t('toc'))}</p><ol>` +
    BOOK.chapters.map((c, i) => `<li><a href="#book/${c.id}" data-ch="${c.id}"><span class="toc-n">${i + 1}</span>${esc(c.title)}</a></li>`).join('') +
    `<li><a href="#book/glossary" data-ch="glossary"><span class="toc-n">∗</span>${esc(t('glossary_title'))}</a></li></ol>`;
  body.innerHTML = '';
  BOOK.chapters.forEach((c, i) => {
    const sec = document.createElement('section');
    sec.className = 'chapter';
    sec.id = 'ch-' + c.id;
    sec.setAttribute('aria-labelledby', 'cht-' + c.id);
    sec.innerHTML =
      `<p class="chapter-num">${esc(t('chapter'))} ${i + 1}</p>` +
      `<h3 class="chapter-title" id="cht-${c.id}">${esc(c.title)}</h3>` +
      `<p class="chapter-lead">${rich(c.lead)}</p>` +
      `<aside class="kid"><span class="badge">${esc(t('lbl_kid'))}</span><p>${rich(c.kid)}</p></aside>` +
      `<div class="chapter-body"><span class="badge badge-alt">${esc(t('lbl_more'))}</span>${c.body.map(blockHtml).join('')}</div>` +
      `<p class="here"><span class="badge badge-alt">${esc(t('lbl_here'))}</span> ${rich(c.here)}</p>`;
    if (c.try) {
      const box = document.createElement('div');
      box.className = 'tryit';
      box.innerHTML = `<p class="tryit-head"><span class="badge badge-alt">${esc(t('lbl_try'))}</span> ${rich(c.try.caption)}</p>`;
      box.appendChild(codeBlock(c.try.code));
      const acts = document.createElement('div');
      acts.className = 'tryit-actions';
      const run = document.createElement('button');
      run.type = 'button'; run.className = 'btn btn-sm btn-run-sm'; run.textContent = t('run_it');
      const out = document.createElement('div');
      out.className = 'result';
      out.hidden = true;
      run.addEventListener('click', async () => {
        run.disabled = true;
        const res = await runner.run(c.try.code, '');
        run.disabled = false;
        out.hidden = false;
        out.innerHTML = '';
        const lbl = document.createElement('span');
        lbl.className = 'lbl'; lbl.textContent = t('result');
        const inner = document.createElement('div');
        renderOutput(inner, res, c.try.code, {});
        out.appendChild(lbl); out.appendChild(inner);
      });
      acts.appendChild(run);
      acts.appendChild(openBtn(c.try.code));
      box.appendChild(acts);
      box.appendChild(out);
      sec.appendChild(box);
    }
    if (c.check && c.check.length) {
      const d = document.createElement('details');
      d.className = 'check';
      d.innerHTML = `<summary>${esc(t('lbl_check'))}</summary><ol>${c.check.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>`;
      sec.appendChild(d);
    }
    body.appendChild(sec);
  });
  // словарь
  const gl = document.createElement('section');
  gl.className = 'chapter glossary';
  gl.id = 'ch-glossary';
  gl.setAttribute('aria-labelledby', 'cht-glossary');
  gl.innerHTML = `<p class="chapter-num">∗</p><h3 class="chapter-title" id="cht-glossary">${esc(t('glossary_title'))}</h3><p class="chapter-lead">${esc(t('glossary_sub'))}</p>` +
    `<div class="gl-search"><label class="sr-only" for="glQuery">${esc(t('glossary_ph'))}</label><input id="glQuery" type="search" placeholder="${esc(t('glossary_ph'))}" autocomplete="off" spellcheck="false"></div>` +
    '<dl class="gl-list" id="glList"></dl><p class="empty" id="glEmpty" hidden></p>';
  body.appendChild(gl);
  const sorted = BOOK.glossary.slice().sort((a, b) => a.term.localeCompare(b.term, 'ru'));
  $('#glList').innerHTML = sorted.map((g) =>
    `<div class="gl-item" data-q="${esc((g.term + ' ' + g.short).toLowerCase())}"><dt id="gl-${g.id}">${esc(g.term)}</dt><dd>${esc(g.short)}<span class="gl-more">${esc(g.more)}</span></dd></div>`).join('');
  $('#glEmpty').textContent = t('term_none');
  $('#glQuery').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    let shown = 0;
    $$('#glList .gl-item').forEach((it) => { const ok = !q || it.dataset.q.includes(q); it.hidden = !ok; if (ok) shown++; });
    $('#glEmpty').hidden = shown > 0;
  });
  observeToc();
}

let tocObserver = null;
function observeToc() {
  if (tocObserver) tocObserver.disconnect();
  if (!('IntersectionObserver' in window)) return;
  tocObserver = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const id = en.target.id.replace('ch-', '');
      $$('#bookToc a').forEach((a) => { if (a.dataset.ch === id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  $$('#bookBody .chapter').forEach((s) => tocObserver.observe(s));
}

// Окно с пояснением термина
const termPop = $('#termPop');
let termBtn = null;
function closeTerm(returnFocus = true) {
  if (termPop.hidden) return;
  termPop.hidden = true;
  if (termBtn) { termBtn.setAttribute('aria-expanded', 'false'); if (returnFocus) termBtn.focus({ preventScroll: true }); }
  termBtn = null;
}
function openTerm(btn) {
  const g = TERMS[btn.dataset.term];
  if (!g) return;
  if (termBtn && termBtn !== btn) termBtn.setAttribute('aria-expanded', 'false');
  termBtn = btn;
  btn.setAttribute('aria-expanded', 'true');
  $('#tpTerm').textContent = g.term;
  $('#tpShort').textContent = g.short;
  $('#tpMore').innerHTML = `<span class="tp-lbl">${esc(t('term_precise'))}.</span> ${esc(g.more)}`;
  const ch = CHAPTERS[g.chapter];
  const link = $('#tpLink');
  link.textContent = ch ? `${t('term_chapter')} ${ch.n}: ${ch.title} →` : '';
  link.hidden = !ch;
  link.href = '#book/' + g.chapter;
  $('#tpClose').setAttribute('aria-label', t('term_close'));
  termPop.hidden = false;
  placeTerm(btn);
  termPop.focus({ preventScroll: true });
}
function placeTerm(btn) {
  const r = btn.getBoundingClientRect();
  const pw = Math.min(360, window.innerWidth - 24);
  termPop.style.width = pw + 'px';
  let left = r.left + window.scrollX + r.width / 2 - pw / 2;
  left = Math.max(window.scrollX + 12, Math.min(left, window.scrollX + window.innerWidth - pw - 12));
  termPop.style.left = left + 'px';
  const ph = termPop.offsetHeight;
  let top = r.bottom + window.scrollY + 10;
  if (r.bottom + ph + 20 > window.innerHeight && r.top > ph + 20) top = r.top + window.scrollY - ph - 10;
  termPop.style.top = top + 'px';
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('.term');
  if (btn) { e.preventDefault(); if (termBtn === btn && !termPop.hidden) closeTerm(false); else openTerm(btn); return; }
  if (!termPop.hidden && !termPop.contains(e.target)) closeTerm(false);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !termPop.hidden) { e.stopPropagation(); closeTerm(true); } }, true);
$('#tpClose').addEventListener('click', () => closeTerm(true));
$('#tpLink').addEventListener('click', () => closeTerm(false));
window.addEventListener('resize', () => { if (!termPop.hidden && termBtn) placeTerm(termBtn); });

// Переключение между «редактор / разделы» и «книга» по адресу (#book, #book/lexer)
function showBook(chId) {
  document.body.dataset.view = 'book';
  closeTerm(false);
  const el = chId && document.getElementById('ch-' + chId);
  if (el) el.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}
function showMain(id) {
  delete document.body.dataset.view;
  closeTerm(false);
  const el = id && id !== 'top' && document.getElementById(id);
  if (el) el.scrollIntoView({ block: 'start' });
  else if (id === 'top' || !id) window.scrollTo(0, 0);
}
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'book' || h.startsWith('book/')) showBook(h.split('/')[1]);
  else showMain(h);
}
window.addEventListener('hashchange', route);
$('#bookPrint').addEventListener('click', () => { document.body.dataset.view = 'book'; window.print(); });

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
  refreshSettings();
  if (lastResult && lastResult.error) renderOutput(consoleBody, lastResult, lastCode, { jump: true, report: true });
});

// ---------------------------------------------------------------------------
// Старт
// ---------------------------------------------------------------------------
applyTheme(initialTheme());
state.fontPx = Number(store.get('qazaq.fs')) || 14;
state.motionOff = store.get('qazaq.motion') === 'off';
$('#verTag').textContent = 'v' + LANGUAGE.version;
$('#footVer').textContent = 'Qazaq ' + LANGUAGE.version + ' · MIT';
const sharedCode = codeFromHash();
ta.value = sharedCode !== null ? sharedCode : (store.get('qazaq.code') || examples[0].code);
if (sharedCode !== null) { store.set('qazaq.code', sharedCode); try { history.replaceState(null, '', location.href.split('#')[0] + '#play'); } catch (e) { /* ignore */ } }
applyI18n();
renderDynamic();
route();
applyFontSize(state.fontPx);
applyMotion(state.motionOff);
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
window.__qazaq = { engine, run, setCode, runner, state, shareUrl };
})();
