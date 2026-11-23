// ===================================================================
// Ошибки
// ===================================================================
class QazaqError extends Error {
  constructor(message, line = null, col = null, hint = null) {
    super(message);
    this.message = message;
    this.line = line;
    this.col = col;
    this.hint = hint;
    this.trace = [];
    this.filename = null;
  }
  toDict() {
    return { type: this.constructor.name, title: this.title, message: this.message,
             line: this.line, column: this.col, hint: this.hint };
  }
}
QazaqError.prototype.title = 'Ошибка';
QazaqError.prototype.catchable = true;
class LexicalError extends QazaqError {}
LexicalError.prototype.title = 'Лексическая ошибка';
LexicalError.prototype.catchable = false;
class QazaqSyntaxError extends QazaqError {}
QazaqSyntaxError.prototype.title = 'Синтаксическая ошибка';
QazaqSyntaxError.prototype.catchable = false;
class QazaqRuntimeError extends QazaqError {}
QazaqRuntimeError.prototype.title = 'Ошибка выполнения';
class ResourceLimitError extends QazaqError {}
ResourceLimitError.prototype.title = 'Превышен лимит';
ResourceLimitError.prototype.catchable = false;

function formatError(err, source = null, filename = null, lang = 'ru') {
  filename = filename || err.filename;
  const lines = [`${translateTitle(err.title, lang)}: ${translateText(err.message, lang)}`];
  if (err.line !== null) {
    let where = filename ? `  ${errLabel('file', lang)} ${filename}, ` : '  ';
    where += `${errLabel('line', lang)} ${err.line}`;
    if (err.col !== null) where += `, ${errLabel('column', lang)} ${err.col}`;
    lines.push(where);
    if (source !== null) {
      const srcLines = source.replace(/\r\n/g, '\n').split('\n');
      if (err.line >= 1 && err.line <= srcLines.length) {
        const text = srcLines[err.line - 1];
        const num = String(err.line);
        lines.push(`  ${num} | ${text}`);
        if (err.col !== null) lines.push('  ' + ' '.repeat(num.length) + ' | ' + ' '.repeat(Math.max(err.col - 1, 0)) + '^');
      }
    }
  }
  let trace = err.trace;
  if (trace.length > 8) {
    const skipped = trace.length - 6;
    trace = [...trace.slice(0, 3), [errLabel('skipped', lang, { n: skipped }), null], ...trace.slice(-3)];
  }
  for (const [name, line] of trace) {
    if (name.startsWith('…')) { lines.push(`  ${name}`); continue; }
    const loc = line !== null ? errLabel('called_at', lang, { line }) : errLabel('called_unknown', lang);
    lines.push(errLabel('called', lang, { name, where: loc }));
  }
  if (err.hint) lines.push(`  ${errLabel('hint', lang)}: ${translateText(err.hint, lang)}`);
  return lines.join('\n');
}

// ===================================================================
// Токены
// ===================================================================
const KEYWORD_ALIASES = {};
const KEYWORDS = new Set();
for (const k of LANG.keywords) {
  KEYWORDS.add(k.name);
  for (const a of k.aliases || []) { KEYWORDS.add(a); KEYWORD_ALIASES[a] = k.name; }
}

const T = { INT: 'INT', FLOAT: 'FLOAT', STR: 'STR', FSTR: 'FSTR', NAME: 'NAME', KW: 'KW', OP: 'OP',
            DOT: 'DOT', END: 'END', NL: 'NL', INDENT: 'INDENT', DEDENT: 'DEDENT', EOF: 'EOF' };

const OPERATORS_2 = new Set(['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '|>']);
const COMMENT_CHARS = '#;';   // комментарий начинается с «#» или «;»
const UNICODE_OPS = { '×': '*', '÷': '/', '≤': '<=', '≥': '>=', '≠': '!=', '−': '-' };
const SQUARE_SWAP = { '(': '[', ')': ']', '[': '(', ']': ')' };   // режим «шаршы жақша»
const OPERATORS_1 = '+-*/%<>=()[]{},:';
const OPENERS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = { ')': '(', ']': '[', '}': '{' };
const ESCAPES = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', "'": "'" };

const RE_ALPHA = /^\p{L}$/u;
const RE_ALNUM = /^[\p{L}\p{N}]$/u;
const RE_MARK = /^\p{M}$/u;
const RE_CYR = /^\p{Script=Cyrillic}$/u;
const RE_LAT = /^\p{Script=Latin}$/u;
const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) => c === '_' || RE_ALPHA.test(c);
const isIdentPart = (c) => c === '_' || RE_ALNUM.test(c) || RE_MARK.test(c);
function scriptOf(c) {
  if (!RE_ALPHA.test(c)) return null;
  if (RE_CYR.test(c)) return 'cyrillic';
  if (RE_LAT.test(c)) return 'latin';
  return null;
}
const hex4 = (c) => c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
const MAX_INT_DIGITS = 150000;

// ===================================================================
// Лексер
// ===================================================================
// Директива в начале файла:  ;! жақша = шаршы   (или  #! brackets = square)
function readPragmaSquare(src) {
  for (const raw of src.split('\n').slice(0, 8)) {
    const line = raw.trim();
    if (!line) continue;
    if (COMMENT_CHARS.includes(line[0]) && line[1] === '!') {
      const body = line.slice(2).replace(/ /g, '').toLowerCase();
      if (body === 'жақша=шаршы' || body === 'brackets=square') return true;
      continue;
    }
    if (COMMENT_CHARS.includes(line[0])) continue;
    break;
  }
  return false;
}

class Lexer {
  constructor(source, opts = {}) {
    let src = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (src.startsWith('﻿')) src = src.slice(1);
    this.square = opts.square !== undefined && opts.square !== null ? !!opts.square : (!opts.exprMode && readPragmaSquare(src));
    this.src = Array.from(src);
    this.n = this.src.length;
    this.i = 0;
    this.line = opts.line ?? 1;
    this.col = opts.col ?? 1;
    this.exprMode = !!opts.exprMode;
    this.atLineStart = !this.exprMode;
    this.indents = [0];
    this.brackets = [];
    this.tokens = [];
  }

  error(msg, line = null, col = null, hint = null) {
    throw new LexicalError(msg, line ?? this.line, col ?? this.col, hint);
  }

  _adv(count = 1) {
    for (let k = 0; k < count; k++) {
      if (this.src[this.i] === '\n') { this.line++; this.col = 1; } else this.col++;
      this.i++;
    }
  }

  _emit(kind, value, line, col) {
    const tok = { kind, value, line, col, endLine: this.line, endCol: this.col };
    this.tokens.push(tok);
    return tok;
  }

  _startsWith(str) {
    for (let k = 0; k < str.length; k++) if (this.src[this.i + k] !== str[k]) return false;
    return true;
  }

  tokenize() {
    const src = this.src, n = this.n;
    while (this.i < n) {
      if (this.atLineStart) {
        this._lineStart();
        if (this.i >= n) break;
        if (this.atLineStart) continue;
      }
      const ch = src[this.i];
      if (ch === ' ' || ch === '\t') this._adv();
      else if (ch === '\n') {
        const last = this.tokens.length ? this.tokens[this.tokens.length - 1] : null;
        const endsLogical = !this.exprMode && this.brackets.length === 0 && last !== null &&
          (last.kind === T.END || (last.kind === T.OP && last.value === ':'));
        if (endsLogical) { this._emit(T.NL, '\n', this.line, this.col); this.atLineStart = true; }
        this._adv();
      } else if (COMMENT_CHARS.includes(ch)) {
        while (this.i < n && src[this.i] !== '\n') this._adv();
      } else if (isDigit(ch)) this._number();
      else if (ch === '"' || ch === "'") this._string(ch, false);
      else if (isIdentStart(ch)) this._identifier();
      else this._operator();
    }
    this._finish();
    return this.tokens;
  }

  _finish() {
    if (this.brackets.length) {
      const [, line, col, shown] = this.brackets[this.brackets.length - 1];
      this.error(`Скобка '${shown}' не закрыта`, line, col);
    }
    if (!this.exprMode) {
      const last = this.tokens.length ? this.tokens[this.tokens.length - 1] : null;
      if (last !== null && (last.kind === T.END || (last.kind === T.OP && last.value === ':')))
        this._emit(T.NL, '\n', this.line, this.col);
      while (this.indents.length > 1) { this.indents.pop(); this._emit(T.DEDENT, null, this.line, this.col); }
    }
    this._emit(T.EOF, null, this.line, this.col);
  }

  _lineStart() {
    const src = this.src, n = this.n;
    let j = this.i, width = 0;
    while (j < n && (src[j] === ' ' || src[j] === '\t')) { width += src[j] === '\t' ? 4 : 1; j++; }
    if (j >= n) { this.col += j - this.i; this.i = j; return; }
    if (src[j] === '\n') { this.col += j - this.i; this.i = j; this._adv(); return; }
    if (COMMENT_CHARS.includes(src[j])) {
      while (j < n && src[j] !== '\n') j++;
      this.col += j - this.i; this.i = j;
      if (this.i < n) this._adv();
      return;
    }
    this.col += j - this.i; this.i = j;
    this.atLineStart = false;
    const top = this.indents[this.indents.length - 1];
    if (width > top) { this.indents.push(width); this._emit(T.INDENT, width, this.line, this.col); }
    else if (width < top) {
      while (this.indents[this.indents.length - 1] > width) {
        this.indents.pop();
        this._emit(T.DEDENT, null, this.line, this.col);
      }
      if (this.indents[this.indents.length - 1] !== width)
        this.error('Уровень отступа не совпадает ни с одним из внешних блоков', null, null,
                   'Используйте одинаковое число пробелов для одного блока.');
    }
  }

  _number() {
    const src = this.src, n = this.n;
    const line = this.line, col = this.col, start = this.i;
    let isFloat = false;
    const digits = () => {
      while (this.i < n && (isDigit(src[this.i]) ||
             (src[this.i] === '_' && this.i + 1 < n && isDigit(src[this.i + 1])))) this._adv();
    };
    digits();
    if (this.i + 1 < n && src[this.i] === '.' && isDigit(src[this.i + 1])) { isFloat = true; this._adv(); digits(); }
    if (this.i < n && (src[this.i] === 'e' || src[this.i] === 'E')) {
      let j = this.i + 1;
      if (j < n && (src[j] === '+' || src[j] === '-')) j++;
      if (j < n && isDigit(src[j])) { isFloat = true; this._adv(j - this.i); digits(); }
    }
    if (this.i < n && isIdentStart(src[this.i]))
      this.error(`Недопустимый символ '${src[this.i]}' сразу после числа`, null, null,
                 'Отделите число пробелом или оператором.');
    const text = src.slice(start, this.i).join('').replace(/_/g, '');
    let value;
    if (isFloat) value = Number(text);
    else {
      if (text.length > MAX_INT_DIGITS)
        this.error('Число слишком длинное', line, col, 'Целые числа ограничены примерно 150 000 цифр.');
      value = BigInt(text);
    }
    this._emit(isFloat ? T.FLOAT : T.INT, value, line, col);
  }

  _identifier() {
    const src = this.src, n = this.n;
    const line = this.line, col = this.col, start = this.i;
    while (this.i < n && isIdentPart(src[this.i])) this._adv();
    const text = src.slice(start, this.i).join('').normalize('NFC');
    if (text === 'ф' && this.i < n && (src[this.i] === '"' || src[this.i] === "'")) {
      this._string(src[this.i], true, line, col);
      return;
    }
    const scripts = new Set();
    for (const c of text) { const s = scriptOf(c); if (s) scripts.add(s); }
    if (scripts.size > 1) {
      let bad = '';
      for (const c of text) if (scriptOf(c) === 'latin') { bad = c; break; }
      this.error(`Идентификатор «${text}» смешивает латиницу и кириллицу (латинская «${bad}», U+${hex4(bad)})`,
                 line, col,
                 'Похожие буквы (например, латинская i и казахская і) — разные символы. Перепечатайте слово одной раскладкой.');
    }
    if (KEYWORDS.has(text)) this._emit(T.KW, KEYWORD_ALIASES[text] ?? text, line, col);
    else this._emit(T.NAME, text, line, col);
  }

  _string(quote, isF, line = null, col = null) {
    const src = this.src, n = this.n;
    const sline = line ?? this.line, scol = col ?? this.col;
    const triple = this._startsWith(quote.repeat(3));
    this._adv(triple ? 3 : 1);
    let buf = [];
    const parts = [];
    const unterminated = () => this.error('Строка не закрыта', sline, scol, 'Добавьте закрывающую кавычку.');
    for (;;) {
      if (this.i >= n) unterminated();
      const c = src[this.i];
      if (triple) {
        if (this._startsWith(quote.repeat(3))) { this._adv(3); break; }
      } else if (c === quote) { this._adv(); break; }
      else if (c === '\n') unterminated();
      if (c === '\\') {
        if (this.i + 1 >= n) unterminated();
        const esc = src[this.i + 1];
        if (!(esc in ESCAPES))
          this.error(`Неизвестная управляющая последовательность '\\${esc}'`, null, null,
                     'Чтобы написать обратную косую черту, удвойте её: \\\\');
        buf.push(ESCAPES[esc]);
        this._adv(2);
      } else if (isF && c === '{') {
        if (this.i + 1 < n && src[this.i + 1] === '{') { buf.push('{'); this._adv(2); continue; }
        if (buf.length) { parts.push(buf.join('')); buf = []; }
        parts.push(this._fexpr(sline, scol));
      } else if (isF && c === '}') {
        if (this.i + 1 < n && src[this.i + 1] === '}') { buf.push('}'); this._adv(2); }
        else this.error("Одиночная '}' в форматной строке", null, null, 'Для символа } пишите }}.');
      } else { buf.push(c); this._adv(); }
    }
    if (isF) {
      if (buf.length) parts.push(buf.join(''));
      this._emit(T.FSTR, parts, sline, scol);
    } else this._emit(T.STR, buf.join(''), sline, scol);
  }

  _fexpr(sline, scol) {
    const src = this.src, n = this.n;
    const openLine = this.line, openCol = this.col;
    this._adv();
    const line = this.line, col = this.col;
    let depth = 0, quote = null, specAt = null;
    const start = this.i;
    for (;;) {
      if (this.i >= n) this.error("Фигурная скобка '{' в форматной строке не закрыта", openLine, openCol);
      const c = src[this.i];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) {
          if (c !== '}') this.error(`Лишняя '${c}' в выражении форматной строки`);
          break;
        }
        depth--;
      } else if (c === ':' && depth === 0 && specAt === null) specAt = this.i;
      else if (c === '\n')
        this.error('Перенос строки внутри {…} форматной строки не поддерживается', openLine, openCol);
      this._adv();
    }
    const end = this.i;
    this._adv();
    let text, spec;
    if (specAt === null) { text = src.slice(start, end).join(''); spec = null; }
    else { text = src.slice(start, specAt).join(''); spec = src.slice(specAt + 1, end).join(''); }
    if (!text.trim()) this.error('Пустое выражение в {…}', openLine, openCol);
    return { source: text, spec, line, col, square: this.square };
  }

  _operator() {
    const src = this.src, n = this.n;
    const line = this.line, col = this.col;
    const ch = src[this.i];
    const two = ch + (this.i + 1 < n ? src[this.i + 1] : '');
    if (OPERATORS_2.has(two)) { this._adv(2); this._emit(T.OP, two, line, col); return; }
    const nxt = this.i + 1 < n ? src[this.i + 1] : '';
    const endsHere = nxt === '' || nxt === ' ' || nxt === '\t' || nxt === '\n' || COMMENT_CHARS.includes(nxt);
    if (ch in UNICODE_OPS) { this._adv(); this._emit(T.OP, UNICODE_OPS[ch], line, col); return; }
    if (ch === '.') {
      if (endsHere) { this._adv(); this._emit(T.END, '.', line, col); return; }
      if (isIdentStart(nxt)) { this._adv(); this._emit(T.DOT, '.', line, col); return; }
      this.error('После точки ожидается пробел, конец строки или имя', null, null,
                 'Точка завершает инструкцию (после неё пробел или перевод строки) либо ведёт к члену объекта (список.қос).');
    }
    if (ch === '?' || ch === '!') {
      if (endsHere) { this._adv(); this._emit(T.END, ch, line, col); return; }
      this.error(`Знак «${ch}» завершает выражение и должен стоять в конце инструкции`, null, null,
                 'Примеры: x + 1?  (показать значение)  и  x > 0!  (проверить утверждение).');
    }
    if (OPERATORS_1.includes(ch)) {
      const shown = ch;
      let c2 = ch;
      if ('()[]'.includes(ch) && this.square) c2 = SQUARE_SWAP[ch];
      if (c2 in OPENERS) this.brackets.push([c2, line, col, shown]);
      else if (c2 in CLOSERS) {
        if (!this.brackets.length || this.brackets[this.brackets.length - 1][0] !== CLOSERS[c2])
          this.error(`Лишняя закрывающая скобка '${shown}'`);
        this.brackets.pop();
      }
      this._adv();
      this._emit(T.OP, c2, line, col);
      return;
    }
    let hint = null;
    if ('“”«»'.includes(ch)) hint = 'Используйте прямые кавычки " или \'.';
    this.error(`Неизвестный символ '${ch}' (U+${hex4(ch)})`, null, null, hint);
  }
}

// ===================================================================
// Парсер
// ===================================================================
const COMPARE_OPS = new Set(['==', '!=', '<', '<=', '>', '>=']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=']);
const MAX_NESTING = 60;

const mk = (t, tok, props) => ({ t, line: tok.line, col: tok.col, ...props });

class Parser {
  constructor(tokens, source = null) {
    this.toks = tokens;
    this.srcLines = source !== null ? source.replace(/\r\n/g, '\n').split('\n') : null;
    this.pos = 0;
    this.nesting = 0;
    this.funcDepth = 0;
    this.loopDepth = 0;
  }
  peek(offset = 0) { return this.toks[Math.min(this.pos + offset, this.toks.length - 1)]; }
  advance() { const t = this.toks[this.pos]; if (t.kind !== T.EOF) this.pos++; return t; }
  check(kind, value = undefined, offset = 0) {
    const t = this.peek(offset);
    return t.kind === kind && (value === undefined || t.value === value);
  }
  match(kind, value = undefined) { return this.check(kind, value) ? this.advance() : null; }
  error(msg, tok = null, hint = null) {
    tok = tok || this.peek();
    throw new QazaqSyntaxError(msg, tok.line, tok.col, hint);
  }
  describe(tok) {
    switch (tok.kind) {
      case T.EOF: return 'конец файла';
      case T.NL: return 'конец строки';
      case T.INDENT: return 'лишний отступ';
      case T.DEDENT: return 'конец блока';
      case T.END: return "точка '.'";
      case T.KW: return `ключевое слово «${tok.value}»`;
      case T.STR: case T.FSTR: return 'строка';
      default: return `«${tok.value}»`;
    }
  }
  expect(kind, value = undefined, what = null) {
    if (this.check(kind, value)) return this.advance();
    const tok = this.peek();
    const want = what || (value !== undefined ? `«${value}»` : kind);
    let line = tok.line, col = tok.col;
    const prev = this.pos > 0 ? this.toks[this.pos - 1] : null;
    if (prev && ![T.EOF, T.NL, T.DEDENT].includes(tok.kind) && tok.line > prev.endLine) {
      line = prev.endLine; col = prev.endCol;
    }
    throw new QazaqSyntaxError(`Ожидалось ${want}, найдено ${this.describe(tok)}`, line, col);
  }
  expectEnd(marks = false) {
    if (this.check(T.END)) {
      const tok = this.advance();
      if (tok.value !== '.' && !marks)
        throw new QazaqSyntaxError('Здесь нужна точка: знаки «?» и «!» завершают только выражения', tok.line, tok.col,
                                   'Пример: x + 1?  показывает значение, x > 0!  проверяет утверждение.');
      return tok;
    }
    const prev = this.pos > 0 ? this.toks[this.pos - 1] : this.peek();
    const tok = this.peek();
    throw new QazaqSyntaxError(
      `Инструкция должна заканчиваться точкой '.' (найдено ${this.describe(tok)})`, prev.endLine, prev.endCol,
      "Поставьте '.' в конце инструкции. Строки блоков (егер, функ, әзір …) заканчиваются двоеточием ':'.");
  }
  textBetween(first, last) {
    if (this.srcLines === null) return 'выражение';
    const parts = [];
    for (let ln = first.line; ln <= last.endLine; ln++) {
      if (ln - 1 >= this.srcLines.length) break;
      const chars = Array.from(this.srcLines[ln - 1]);
      const start = ln === first.line ? first.col - 1 : 0;
      const end = ln === last.endLine ? last.endCol - 1 : chars.length;
      parts.push(chars.slice(start, end).join('').trim());
    }
    return parts.filter((p) => p).join(' ');
  }
  enter(tok = null) {
    this.nesting++;
    if (this.nesting > MAX_NESTING)
      this.error(`Слишком глубокая вложенность выражений или блоков (максимум ${MAX_NESTING})`, tok,
                 'Разбейте выражение на несколько инструкций с промежуточными переменными.');
  }
  skipNl() { while (this.peek().kind === T.NL) this.advance(); }

  parseProgram() {
    const body = [];
    this.skipNl();
    while (!this.check(T.EOF)) {
      if (this.check(T.INDENT)) this.error('Неожиданный отступ', null, "Отступ нужен только внутри блока после ':'.");
      if (this.check(T.DEDENT)) { this.advance(); continue; }
      body.push(this.parseStatement());
      this.skipNl();
    }
    return { t: 'Program', line: 1, col: 1, body };
  }

  parseBlock() {
    this.enter();
    try { return this._parseBlock(); } finally { this.nesting--; }
  }
  _parseBlock() {
    if (this.check(T.NL)) {
      this.skipNl();
      if (!this.check(T.INDENT)) this.error("После ':' ожидается блок с отступом", null,
                                              'Сдвиньте инструкции блока вправо на несколько пробелов.');
      this.advance();
      const body = [];
      this.skipNl();
      while (!this.check(T.DEDENT) && !this.check(T.EOF)) {
        if (this.check(T.INDENT)) this.error('Неожиданный отступ');
        body.push(this.parseStatement());
        this.skipNl();
      }
      this.match(T.DEDENT);
      if (!body.length) this.error('Пустой блок', null, "Используйте 'өткіз.', если блок должен быть пустым.");
      return body;
    }
    if (this.check(T.EOF)) this.error("После ':' ожидается тело блока");
    return [this.parseStatement()];
  }

  parseStatement() {
    const tok = this.peek();
    if (tok.kind === T.KW) {
      switch (tok.value) {
        case 'егер': return this.parseIf();
        case 'әзір': return this.parseWhile();
        case 'әрбір': return this.parseFor();
        case 'функ': return this.parseFuncdef();
        case 'сынып': return this.parseClassdef();
        case 'байқа': return this.parseTry();
        case 'айным': return this.parseVardecl();
        case 'қайтар': return this.parseReturn();
        case 'тоқта': return this.parseSimpleKw('Break', (this.loopDepth === 0) && '«тоқта» можно использовать только внутри цикла');
        case 'жалғас': return this.parseSimpleKw('Continue', (this.loopDepth === 0) && '«жалғас» можно использовать только внутри цикла');
        case 'өткіз': return this.parseSimpleKw('Pass', false);
        case 'лақтыр': return this.parseRaise();
        case 'әйтпесе': case 'қате': case 'соңында':
          this.error(`«${tok.value}» без соответствующего ${tok.value === 'әйтпесе' ? 'егер' : 'байқа'}`, null,
                     'Проверьте, что отступ совпадает с отступом начала конструкции.');
      }
    }
    return this.parseSimpleExprStmt();
  }

  parseSimpleExprStmt() {
    const start = this.peek();
    const expr = this.parseExpr();
    if (this.check(T.OP, ',')) {   // а, б = б, а
      const targets = [expr];
      while (this.match(T.OP, ',')) targets.push(this.parseExpr());
      for (const t of targets)
        if (!['Name', 'Index', 'Attr'].includes(t.t)) this.error("В списке слева от '=' могут быть только имена, элементы (a[0]) и поля (a.x)", start);
      this.expect(T.OP, '=', "'=' после списка целей");
      const value = this.parseExprList();
      this.expectEnd();
      return mk('Assign', start, { target: mk('TargetList', start, { items: targets }), op: '=', value });
    }
    const opTok = this.peek();
    if (opTok.kind === T.OP && ASSIGN_OPS.has(opTok.value)) {
      if (!['Name', 'Index', 'Attr'].includes(expr.t))
        this.error("Слева от '=' должно быть имя, элемент (a[0]) или поле (a.x)", start);
      this.advance();
      const value = opTok.value === '=' ? this.parseExprList() : this.parseExpr();
      this.expectEnd();
      return mk('Assign', start, { target: expr, op: opTok.value, value });
    }
    const end = this.expectEnd(true);
    const last = this.toks[this.pos - 2];
    const text = end.value !== '.' ? this.textBetween(start, last) : '';
    return mk('ExprStmt', start, { expr, mode: end.value, text });
  }

  parseExprList() {
    const first = this.parseExpr();
    if (!this.check(T.OP, ',')) return first;
    const items = [first];
    while (this.match(T.OP, ',')) {
      if (this.check(T.END)) break;
      items.push(this.parseExpr());
    }
    return { t: 'TupleLit', line: first.line, col: first.col, items };
  }

  parseVardecl() {
    const kw = this.advance();
    const name = this.expect(T.NAME, undefined, 'имя переменной после «айным»');
    const names = [name];
    while (this.match(T.OP, ',')) names.push(this.expect(T.NAME, undefined, 'имя переменной'));
    let value;
    if (this.peek().kind === T.OP && this.peek().value === '=') { this.advance(); value = this.parseExprList(); }
    else {
      const last = names[names.length - 1];
      throw new QazaqSyntaxError(`После имени «${last.value}» ожидался знак '='`, last.endLine, last.endCol,
                                 'Пример: айным x = 10.   или   айным а, б = 1, 2.');
    }
    this.expectEnd();
    if (names.length > 1) return mk('VarDeclMulti', kw, { names: names.map((n) => n.value), value });
    return mk('VarDecl', kw, { name: name.value, value });
  }

  parseReturn() {
    const kw = this.advance();
    if (this.funcDepth === 0) this.error('«қайтар» можно использовать только внутри функции', kw);
    let value = null;
    if (!this.check(T.END)) value = this.parseExprList();
    this.expectEnd();
    return mk('Return', kw, { value });
  }

  parseSimpleKw(type, errorMsg) {
    const kw = this.advance();
    if (errorMsg) this.error(errorMsg, kw);
    this.expectEnd();
    return mk(type, kw, {});
  }

  parseRaise() {
    const kw = this.advance();
    const value = this.parseExpr();
    this.expectEnd();
    return mk('Raise', kw, { value });
  }

  parseIf() {
    const kw = this.advance();
    const branches = [];
    let cond = this.parseExpr();
    this.expect(T.OP, ':', "двоеточие ':' после условия");
    branches.push([cond, this.parseBlock()]);
    let orelse = null;
    while (this.check(T.KW, 'әйтпесе')) {
      this.advance();
      if (this.check(T.KW, 'егер')) {
        this.advance();
        cond = this.parseExpr();
        this.expect(T.OP, ':', "двоеточие ':' после условия");
        branches.push([cond, this.parseBlock()]);
      } else {
        this.expect(T.OP, ':', "двоеточие ':' после «әйтпесе»");
        orelse = this.parseBlock();
        break;
      }
    }
    return mk('If', kw, { branches, orelse });
  }

  parseWhile() {
    const kw = this.advance();
    const cond = this.parseExpr();
    this.expect(T.OP, ':', "двоеточие ':' после условия");
    this.loopDepth++;
    let body;
    try { body = this.parseBlock(); } finally { this.loopDepth--; }
    return mk('While', kw, { cond, body });
  }

  parseFor() {
    const kw = this.advance();
    const targets = [this.expect(T.NAME, undefined, 'имя переменной цикла').value];
    while (this.match(T.OP, ',')) targets.push(this.expect(T.NAME, undefined, 'имя переменной цикла').value);
    this.expect(T.KW, 'ішінде', '«ішінде» (пример: әрбір x ішінде тізім:)');
    const iterable = this.parseExpr();
    this.expect(T.OP, ':', "двоеточие ':' после перебираемого выражения");
    this.loopDepth++;
    let body;
    try { body = this.parseBlock(); } finally { this.loopDepth--; }
    return mk('For', kw, { targets, iterable, body });
  }

  parseParams() {
    const params = [];
    let seenDefault = false;
    while (!this.check(T.OP, ')')) {
      if (this.check(T.OP, '*') || this.check(T.OP, '**')) {
        const star = this.advance();
        const kind = star.value === '*' ? 'rest' : 'kwrest';
        const pname = this.expect(T.NAME, undefined, `имя параметра после '${star.value}'`);
        if (params.some((p) => p.kind === kind)) this.error(`Параметр «${star.value}» уже есть`, star);
        if (kind === 'rest' && params.some((p) => p.kind === 'kwrest')) this.error('Параметр «*» должен стоять перед «**»', star);
        if (params.some((p) => p.kind === 'kwrest')) this.error('После «**» параметров быть не может', star);
        if (params.some((p) => p.name === pname.value)) this.error(`Повторяющийся параметр «${pname.value}»`, pname);
        params.push({ name: pname.value, default: null, kind });
        if (this.check(T.OP, '=')) this.error(`У параметра «${star.value}${pname.value}» не может быть значения по умолчанию`, this.peek());
        if (!this.match(T.OP, ',')) break;
        continue;
      }
      const pname = this.expect(T.NAME, undefined, 'имя параметра');
      if (params.some((p) => p.kind)) this.error('Обычный параметр после «*» или «**»', pname,
                                                 'Сначала обычные параметры, затем *остальные, затем **именованные.');
      let def = null;
      if (this.match(T.OP, '=')) { def = this.parseExpr(); seenDefault = true; }
      else if (seenDefault) this.error('Параметр без значения по умолчанию после параметра со значением', pname);
      if (params.some((p) => p.name === pname.value)) this.error(`Повторяющийся параметр «${pname.value}»`, pname);
      params.push({ name: pname.value, default: def, kind: '' });
      if (!this.match(T.OP, ',')) break;
    }
    return params;
  }

  parseFuncdef() {
    const kw = this.advance();
    const name = this.expect(T.NAME, undefined, 'имя функции');
    this.expect(T.OP, '(', "'(' после имени функции");
    const params = this.parseParams();
    this.expect(T.OP, ')', "')' после параметров");
    this.expect(T.OP, ':', "двоеточие ':' после заголовка функции");
    const savedLoop = this.loopDepth;
    this.loopDepth = 0;
    this.funcDepth++;
    let body;
    try { body = this.parseBlock(); } finally { this.funcDepth--; this.loopDepth = savedLoop; }
    return mk('FuncDef', kw, { name: name.value, params, body });
  }

  parseLambda() {
    const kw = this.advance();
    this.expect(T.OP, '(', "'(' после «функ» в анонимной функции");
    const params = this.parseParams();
    this.expect(T.OP, ')', "')' после параметров");
    this.expect(T.OP, ':', "двоеточие ':' после параметров анонимной функции");
    if (this.check(T.NL)) this.error("Тело анонимной функции должно быть в той же строке после ':'", this.peek(),
                                     'Для многострочной функции используйте: функ имя(…):');
    const body = this.parseExpr();
    return mk('Lambda', kw, { params, body });
  }

  parseClassdef() {
    const kw = this.advance();
    const name = this.expect(T.NAME, undefined, 'имя класса');
    let base = null;
    if (this.match(T.OP, '(')) { base = this.parseExpr(); this.expect(T.OP, ')', "')' после базового класса"); }
    this.expect(T.OP, ':', "двоеточие ':' после заголовка класса");
    const body = this.parseBlock();
    for (const stmt of body) {
      if (!['FuncDef', 'VarDecl', 'Pass'].includes(stmt.t))
        throw new QazaqSyntaxError("В теле класса допустимы только функции (функ), поля (айным) и 'өткіз.'", stmt.line, stmt.col);
    }
    return mk('ClassDef', kw, { name: name.value, base, body });
  }

  parseTry() {
    const kw = this.advance();
    this.expect(T.OP, ':', "двоеточие ':' после «байқа»");
    const body = this.parseBlock();
    let catchName = null, catchBody = null, finalBody = null;
    if (this.check(T.KW, 'қате')) {
      this.advance();
      if (this.check(T.NAME)) catchName = this.advance().value;
      this.expect(T.OP, ':', "двоеточие ':' после «қате»");
      catchBody = this.parseBlock();
    }
    if (this.check(T.KW, 'соңында')) {
      this.advance();
      this.expect(T.OP, ':', "двоеточие ':' после «соңында»");
      finalBody = this.parseBlock();
    }
    if (catchBody === null && finalBody === null) this.error('После «байқа» нужен блок «қате» или «соңында»', kw);
    return mk('Try', kw, { body, catchName, catchBody, finalBody });
  }

  // ---- выражения ----
  parseExpr() {
    this.enter();
    try { return this.parseTernary(); } finally { this.nesting--; }
  }
  parseTernary() {
    const value = this.parsePipe();
    if (this.check(T.KW, 'егер')) {
      const kw = this.advance();
      const cond = this.parsePipe();
      this.expect(T.KW, 'әйтпесе', '«әйтпесе» в условном выражении (A егер условие әйтпесе B)');
      const orelse = this.parseTernary();
      return mk('Ternary', kw, { cond, then: value, orelse });
    }
    return value;
  }
  parsePipe() {
    let left = this.parseOr();
    while (this.check(T.OP, '|>')) {
      const op = this.advance();
      left = mk('Pipe', op, { left, right: this.parseOr() });
    }
    return left;
  }
  parseOr() {
    let left = this.parseAnd();
    while (this.check(T.KW, 'немесе')) {
      const op = this.advance();
      left = mk('Logical', op, { op: 'немесе', left, right: this.parseAnd() });
    }
    return left;
  }
  parseAnd() {
    let left = this.parseNot();
    while (this.check(T.KW, 'және')) {
      const op = this.advance();
      left = mk('Logical', op, { op: 'және', left, right: this.parseNot() });
    }
    return left;
  }
  parseNot() {
    if (this.check(T.KW, 'емес')) {
      const op = this.advance();
      this.enter(op);
      try { return mk('Unary', op, { op: 'емес', operand: this.parseNot() }); } finally { this.nesting--; }
    }
    return this.parseComparison();
  }
  parseComparison() {
    const left = this.parseAdd();
    const ops = [];
    const first = this.peek();
    for (;;) {
      const t = this.peek();
      if (t.kind === T.OP && COMPARE_OPS.has(t.value)) { this.advance(); ops.push([t.value, this.parseAdd()]); }
      else if (t.kind === T.KW && t.value === 'ішінде') { this.advance(); ops.push(['ішінде', this.parseAdd()]); }
      else if (t.kind === T.KW && t.value === 'емес' && this.check(T.KW, 'ішінде', 1)) {
        this.advance(); this.advance(); ops.push(['емес ішінде', this.parseAdd()]);
      } else break;
    }
    return ops.length ? mk('Compare', first, { left, ops }) : left;
  }
  parseAdd() {
    let left = this.parseMul();
    while (this.peek().kind === T.OP && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.advance();
      left = mk('Binary', op, { op: op.value, left, right: this.parseMul() });
    }
    return left;
  }
  parseMul() {
    let left = this.parseUnary();
    while (this.peek().kind === T.OP && ['*', '/', '//', '%'].includes(this.peek().value)) {
      const op = this.advance();
      left = mk('Binary', op, { op: op.value, left, right: this.parseUnary() });
    }
    return left;
  }
  parseUnary() {
    const t = this.peek();
    if (t.kind === T.OP && (t.value === '-' || t.value === '+')) {
      this.advance();
      this.enter(t);
      try { return mk('Unary', t, { op: t.value, operand: this.parseUnary() }); } finally { this.nesting--; }
    }
    return this.parsePower();
  }
  parsePower() {
    const base = this.parsePostfix();
    if (this.check(T.OP, '**')) {
      const op = this.advance();
      this.enter(op);
      try { return mk('Binary', op, { op: '**', left: base, right: this.parseUnary() }); } finally { this.nesting--; }
    }
    return base;
  }
  parsePostfix() {
    let expr = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t.kind === T.OP && t.value === '(') {
        this.advance();
        const args = [], kwargs = [];
        while (!this.check(T.OP, ')')) {
          if (this.check(T.OP, '*')) {
            const star = this.advance();
            if (kwargs.length) this.error('Позиционный аргумент после именованного', null,
                                          'Сначала пишите обычные аргументы, затем именованные: f(1, b = 2).');
            args.push(mk('Spread', star, { value: this.parseExpr() }));
          } else if (this.check(T.OP, '**')) {
            this.advance();
            kwargs.push([null, this.parseExpr()]);
          } else if (this.check(T.NAME) && this.check(T.OP, '=', 1)) {
            const name = this.advance();
            this.advance();
            if (kwargs.some(([n]) => n === name.value)) this.error(`Повторяющийся именованный аргумент «${name.value}»`, name);
            kwargs.push([name.value, this.parseExpr()]);
          } else {
            if (kwargs.length) this.error('Позиционный аргумент после именованного', null,
                                          'Сначала пишите обычные аргументы, затем именованные: f(1, b = 2).');
            args.push(this.parseExpr());
          }
          if (!this.match(T.OP, ',')) break;
        }
        this.expect(T.OP, ')', "')' после аргументов");
        expr = mk('Call', t, { func: expr, args, kwargs });
      } else if (t.kind === T.OP && t.value === '[') {
        this.advance();
        expr = this.parseSubscript(expr, t);
      } else if (t.kind === T.DOT) {
        this.advance();
        const name = this.expect(T.NAME, undefined, "имя поля или метода после '.'");
        expr = mk('Attr', name, { obj: expr, name: name.value });
      } else return expr;
    }
  }
  parseSubscript(obj, openTok) {
    let lo = null, hi = null, step = null, isSlice = false;
    if (!this.check(T.OP, ':')) lo = this.parseExpr();
    if (this.match(T.OP, ':')) {
      isSlice = true;
      if (!this.check(T.OP, ':') && !this.check(T.OP, ']')) hi = this.parseExpr();
      if (this.match(T.OP, ':')) { if (!this.check(T.OP, ']')) step = this.parseExpr(); }
    }
    this.expect(T.OP, ']', "']'");
    return isSlice ? mk('Slice', openTok, { obj, lo, hi, step }) : mk('Index', openTok, { obj, index: lo });
  }
  parsePrimary() {
    const t = this.peek();
    if (t.kind === T.INT || t.kind === T.FLOAT || t.kind === T.STR) { this.advance(); return mk('Literal', t, { value: t.value }); }
    if (t.kind === T.FSTR) { this.advance(); return this.buildFstring(t); }
    if (t.kind === T.NAME) { this.advance(); return mk('Name', t, { name: t.value }); }
    if (t.kind === T.KW) {
      if (t.value === 'функ') return this.parseLambda();
      if (t.value === 'ақиқат') { this.advance(); return mk('Literal', t, { value: true }); }
      if (t.value === 'жалған') { this.advance(); return mk('Literal', t, { value: false }); }
      if (t.value === 'бос') { this.advance(); return mk('Literal', t, { value: null }); }
      this.error(`Ключевое слово «${t.value}» нельзя использовать как значение`, null,
                 'Ключевые слова зарезервированы; выберите другое имя.');
    }
    if (t.kind === T.OP && t.value === '(') {
      this.advance();
      if (this.match(T.OP, ')')) return mk('TupleLit', t, { items: [] });
      const first = this.parseExpr();
      if (this.check(T.OP, ',')) {
        const items = [first];
        while (this.match(T.OP, ',')) { if (this.check(T.OP, ')')) break; items.push(this.parseExpr()); }
        this.expect(T.OP, ')', "')' в конце кортежа");
        return mk('TupleLit', t, { items });
      }
      this.expect(T.OP, ')', "')'");
      return first;
    }
    if (t.kind === T.OP && t.value === '[') {
      this.advance();
      const items = [];
      if (!this.check(T.OP, ']')) {
        const first = this.parseExpr();
        if (this.check(T.KW, 'әрбір')) {
          const clauses = this.parseCompClauses();
          this.expect(T.OP, ']', "']' в конце генератора списка");
          return mk('ListComp', t, { elt: first, clauses });
        }
        items.push(first);
        while (this.match(T.OP, ',')) { if (this.check(T.OP, ']')) break; items.push(this.parseExpr()); }
      }
      this.expect(T.OP, ']', "']' в конце списка");
      return mk('ListLit', t, { items });
    }
    if (t.kind === T.OP && t.value === '{') {
      this.advance();
      const pairs = [];
      while (!this.check(T.OP, '}')) {
        const key = this.parseExpr();
        this.expect(T.OP, ':', "':' между ключом и значением");
        const value = this.parseExpr();
        if (!pairs.length && this.check(T.KW, 'әрбір')) {
          const clauses = this.parseCompClauses();
          this.expect(T.OP, '}', "'}' в конце генератора словаря");
          return mk('DictComp', t, { key, value, clauses });
        }
        pairs.push([key, value]);
        if (!this.match(T.OP, ',')) break;
      }
      this.expect(T.OP, '}', "'}' в конце словаря");
      return mk('DictLit', t, { pairs });
    }
    if (t.kind === T.END) this.error("Ожидалось выражение, найдена точка '.'", null, 'Возможно, лишняя точка или пропущено значение.');
    this.error(`Ожидалось выражение, найдено ${this.describe(t)}`);
  }
  parseCompClauses() {
    const clauses = [];
    while (this.check(T.KW, 'әрбір') || this.check(T.KW, 'егер')) {
      if (this.match(T.KW, 'әрбір')) {
        const targets = [this.expect(T.NAME, undefined, 'имя переменной').value];
        while (this.match(T.OP, ',')) targets.push(this.expect(T.NAME, undefined, 'имя переменной').value);
        this.expect(T.KW, 'ішінде', '«ішінде» (пример: [x * x әрбір x ішінде сандар])');
        clauses.push(['for', targets, this.parsePipe()]);
      } else { this.advance(); clauses.push(['if', this.parsePipe()]); }
    }
    return clauses;
  }
  buildFstring(tok) {
    const parts = [];
    for (const part of tok.value) {
      if (typeof part === 'string') { parts.push(part); continue; }
      const toks = new Lexer(part.source, { line: part.line, col: part.col, exprMode: true, square: part.square }).tokenize();
      const sub = new Parser(toks);
      const expr = sub.parseExpr();
      if (!sub.check(T.EOF)) sub.error(`Лишний текст в выражении {…}: ${sub.describe(sub.peek())}`);
      parts.push([expr, part.spec]);
    }
    return mk('FString', tok, { parts });
  }
}

function parse(source, square = null) { return new Parser(new Lexer(source, { square }).tokenize(), source).parseProgram(); }
