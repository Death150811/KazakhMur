// ===================================================================
// Значения среды исполнения
//   бүтін -> BigInt, нақты -> number, мәтін -> string, логика -> boolean, бос -> null,
//   тізім -> Array, сөздік -> QDict, аралық -> QRange
// ===================================================================
class Env {
  constructor(parent = null, readonly = false) { this.vars = new Map(); this.parent = parent; this.readonly = readonly; }
  lookup(name) {
    let env = this;
    while (env !== null) {
      const v = env.vars.get(name);
      if (v !== undefined) return v;
      env = env.parent;
    }
    return undefined;
  }
  declare(name, value) { this.vars.set(name, value); }
  assign(name, value) {
    let env = this;
    while (env !== null) {
      if (env.vars.has(name)) {
        if (env.readonly)
          throw new QazaqRuntimeError(`«${name}» — встроенное имя, его нельзя изменить присваиванием`, null, null,
                                      `Объявите свою переменную: айным ${name} = ….`);
        env.vars.set(name, value);
        return true;
      }
      env = env.parent;
    }
    return false;
  }
  visibleNames() {
    const names = [];
    let env = this;
    while (env !== null) { for (const k of env.vars.keys()) names.push(k); env = env.parent; }
    return names;
  }
}

class QFunction {
  constructor(name, params, body, closure) { this.name = name; this.params = params; this.body = body; this.closure = closure;
    this.minArgs = params.filter((p) => p.default === null).length; }
}
class Builtin {
  constructor(name, fn, minArgs, maxArgs, category, sig, doc, unsafe, kw = null) {
    this.name = name; this.fn = fn; this.minArgs = minArgs; this.maxArgs = maxArgs;
    this.category = category; this.sig = sig; this.doc = doc; this.unsafe = unsafe;
    this.kw = kw;   // имена параметров для именованных аргументов или null
  }
}
class BoundBuiltin { constructor(name, fn, receiver, minArgs, maxArgs) { Object.assign(this, { name, fn, receiver, minArgs, maxArgs }); } }
class QClass {
  constructor(name, base) { this.name = name; this.base = base; this.members = new Map(); }
  find(name) {
    let c = this;
    while (c !== null) { if (c.members.has(name)) return c.members.get(name); c = c.base; }
    return undefined;
  }
}
class QInstance { constructor(cls) { this.cls = cls; this.fields = new Map(); } }
class BoundMethod { constructor(func, receiver) { this.func = func; this.receiver = receiver; } }
class QRange {
  constructor(start, stop, step) { this.start = start; this.stop = stop; this.step = step; }
  get length() {
    const { start, stop, step } = this;
    if (step > 0n) return start < stop ? (stop - start + step - 1n) / step : 0n;
    return start > stop ? (start - stop - step - 1n) / (-step) : 0n;
  }
  at(i) { return this.start + this.step * i; }
}

class QTuple { constructor(items) { this.items = items; } }
const objIds = new WeakMap();
let objCounter = 0;
const objId = (o) => { if (!objIds.has(o)) objIds.set(o, ++objCounter); return objIds.get(o); };
class Unhashable extends Error {}
class QDict {
  constructor() { this.map = new Map(); }
  static keyOf(k) {
    switch (typeof k) {
      case 'bigint': return 'i' + k.toString();
      case 'boolean': return k ? 'i1' : 'i0';
      case 'number':
        if (Number.isInteger(k)) return 'i' + BigInt(k).toString();
        return 'f' + String(k);
      case 'string': return 's' + k;
      default:
        if (k === null) return 'n';
        if (Array.isArray(k) || k instanceof QDict) throw new Unhashable();
        if (k instanceof QRange) return 'r' + k.start + ',' + k.stop + ',' + k.step;
        if (k instanceof QTuple) return 't(' + k.items.map((x) => { const q = QDict.keyOf(x); return typeof q === 'string' ? q : 'o' + objId(q); }).join(',') + ')';
        return k;
    }
  }
  get size() { return this.map.size; }
  has(k) { return this.map.has(QDict.keyOf(k)); }
  get(k) { const e = this.map.get(QDict.keyOf(k)); return e === undefined ? undefined : e[1]; }
  set(k, v) { const nk = QDict.keyOf(k); const e = this.map.get(nk); if (e) e[1] = v; else this.map.set(nk, [k, v]); }
  delete(k) { return this.map.delete(QDict.keyOf(k)); }
  keys() { return Array.from(this.map.values(), (e) => e[0]); }
  values() { return Array.from(this.map.values(), (e) => e[1]); }
  entries() { return Array.from(this.map.values(), (e) => [e[0], e[1]]); }
  clear() { this.map.clear(); }
  copy() { const d = new QDict(); for (const [k, v] of this.entries()) d.set(k, v); return d; }
}

const isFn = (v) => v instanceof QFunction || v instanceof Builtin || v instanceof BoundBuiltin || v instanceof BoundMethod;

function typeName(v) {
  if (v === null) return 'бос';
  switch (typeof v) {
    case 'boolean': return 'логика';
    case 'bigint': return 'бүтін';
    case 'number': return 'нақты';
    case 'string': return 'мәтін';
  }
  if (Array.isArray(v)) return 'тізім';
  if (v instanceof QTuple) return 'кортеж';
  if (v instanceof QDict) return 'сөздік';
  if (v instanceof QRange) return 'аралық';
  if (isFn(v)) return 'функция';
  if (v instanceof QClass) return 'сынып';
  if (v instanceof QInstance) return v.cls.name;
  return 'объект';
}

function truthy(v) {
  if (v === null || v === false) return false;
  switch (typeof v) {
    case 'bigint': return v !== 0n;
    case 'number': return v !== 0;
    case 'string': return v.length > 0;
    case 'boolean': return true;
  }
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof QTuple) return v.items.length > 0;
  if (v instanceof QDict) return v.size > 0;
  if (v instanceof QRange) return v.length > 0n;
  return true;
}

// ---- Строки как последовательности символов Unicode (code points) ----
const SURROGATES = /[\ud800-\udfff]/;
const hasAstral = (s) => SURROGATES.test(s);
const strLen = (s) => (hasAstral(s) ? Array.from(s).length : s.length);
const strChars = (s) => Array.from(s);

// ---- Числа ----
const isInt = (v) => typeof v === 'bigint' || typeof v === 'boolean';
const isFloat = (v) => typeof v === 'number';
const isNum = (v) => typeof v === 'bigint' || typeof v === 'number' || typeof v === 'boolean';
const big = (v) => (typeof v === 'boolean' ? (v ? 1n : 0n) : v);
const toNumber = (v) => (typeof v === 'number' ? v : Number(big(v)));
function bitLen(n) {
  if (n < 0n) n = -n;
  if (n === 0n) return 0;
  const hex = n.toString(16);
  return (hex.length - 1) * 4 + (32 - Math.clz32(parseInt(hex[0], 16)));
}

// repr(float) как в Python
function floatRepr(x) {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const s = x.toExponential();
  const [mant, e] = s.split('e');
  const exp = parseInt(e, 10);
  const neg = mant.startsWith('-');
  const digits = mant.replace('-', '').replace('.', '');
  let out;
  if (exp >= -4 && exp < 16) {
    if (exp >= 0) {
      const intPart = digits.padEnd(exp + 1, '0').slice(0, exp + 1);
      const frac = digits.length > exp + 1 ? digits.slice(exp + 1) : '0';
      out = intPart + '.' + frac;
    } else out = '0.' + '0'.repeat(-exp - 1) + digits;
  } else {
    const m = digits.length > 1 ? digits[0] + '.' + digits.slice(1) : digits;
    const ae = Math.abs(exp);
    out = m + 'e' + (exp < 0 ? '-' : '+') + (ae < 10 ? '0' + ae : String(ae));
  }
  return neg ? '-' + out : out;
}

// ---- Представление значений ----
function quote(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
}
function toRepr(v, seen = null, depth = 0) {
  if (typeof v === 'string') return quote(v);
  if (v instanceof QTuple) {
    seen = seen || new Set();
    if (seen.has(v) || depth > 20) return '(…)';
    seen.add(v);
    try {
      const inner = v.items.map((x) => toRepr(x, seen, depth + 1)).join(', ');
      return '(' + inner + (v.items.length === 1 ? ',' : '') + ')';
    } finally { seen.delete(v); }
  }
  if (Array.isArray(v) || v instanceof QDict) {
    seen = seen || new Set();
    if (seen.has(v) || depth > 20) return Array.isArray(v) ? '[…]' : '{…}';
    seen.add(v);
    try {
      if (Array.isArray(v)) return '[' + v.map((x) => toRepr(x, seen, depth + 1)).join(', ') + ']';
      return '{' + v.entries().map(([k, x]) => `${toRepr(k, seen, depth + 1)}: ${toRepr(x, seen, depth + 1)}`).join(', ') + '}';
    } finally { seen.delete(v); }
  }
  return toStr(v);
}
function toStr(v) {
  if (v === null) return 'бос';
  if (v === true) return 'ақиқат';
  if (v === false) return 'жалған';
  switch (typeof v) {
    case 'string': return v;
    case 'bigint': return v.toString();
    case 'number': return floatRepr(v);
  }
  if (Array.isArray(v) || v instanceof QDict || v instanceof QTuple) return toRepr(v);
  if (v instanceof QRange) return v.step === 1n ? `аралық(${v.start}, ${v.stop})` : `аралық(${v.start}, ${v.stop}, ${v.step})`;
  if (v instanceof QFunction) return `<функция ${v.name}>`;
  if (v instanceof Builtin || v instanceof BoundBuiltin) return `<ішкі функция ${v.name}>`;
  if (v instanceof BoundMethod) return `<әдіс ${v.func.name}>`;
  if (v instanceof QClass) return `<сынып ${v.name}>`;
  if (v instanceof QInstance) return `<${v.cls.name} нысаны>`;
  return String(v);
}

function suggest(name, candidates) {
  // как difflib.get_close_matches(name, candidates, n=1, cutoff=0.7), упрощённо через отношение Ратклиффа/Обершелпа
  let best = null, bestScore = 0.7;
  for (const c of candidates) {
    const score = ratio(name, c);
    if (score >= bestScore && (best === null || score > bestScore)) { best = c; bestScore = score; }
  }
  return best;
}
function ratio(a, b) {
  const A = Array.from(a), B = Array.from(b);
  if (!A.length && !B.length) return 1;
  const m = matchingChars(A, B);
  return (2 * m) / (A.length + B.length);
}
function matchingChars(a, b) {
  if (!a.length || !b.length) return 0;
  let bestI = 0, bestJ = 0, bestK = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    let k = 0;
    while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
    if (k > bestK) { bestI = i; bestJ = j; bestK = k; }
  }
  if (bestK === 0) return 0;
  return bestK + matchingChars(a.slice(0, bestI), b.slice(0, bestJ)) + matchingChars(a.slice(bestI + bestK), b.slice(bestJ + bestK));
}

// ---- Равенство и порядок ----
function valuesEqual(a, b) {
  if (isNum(a) && isNum(b)) {
    if (typeof a === 'number' || typeof b === 'number') {
      const x = typeof a === 'boolean' ? (a ? 1 : 0) : a, y = typeof b === 'boolean' ? (b ? 1 : 0) : b;
      return x == y; // eslint-disable-line eqeqeq  (BigInt == number сравнивает точно)
    }
    return big(a) === big(b);
  }
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!valuesEqual(a[i], b[i])) return false;
    return true;
  }
  if (a instanceof QTuple) {
    if (!(b instanceof QTuple) || a.items.length !== b.items.length) return false;
    for (let i = 0; i < a.items.length; i++) if (!valuesEqual(a.items[i], b.items[i])) return false;
    return true;
  }
  if (a instanceof QDict) {
    if (!(b instanceof QDict) || a.size !== b.size) return false;
    for (const [k, v] of a.entries()) { const w = b.get(k); if (w === undefined || !valuesEqual(v, w)) return false; }
    return true;
  }
  if (a instanceof QRange) {
    if (!(b instanceof QRange)) return false;
    const la = a.length, lb = b.length;
    if (la !== lb) return false;
    if (la === 0n) return true;
    return a.start === b.start && (la === 1n || a.step === b.step);
  }
  return a === b;
}

class Unordered extends Error {}
// -1, 0, 1 или null (NaN); бросает Unordered для несравнимых типов
function compareValues(a, b) {
  if (isNum(a) && isNum(b)) {
    const x = typeof a === 'boolean' ? (a ? 1n : 0n) : a, y = typeof b === 'boolean' ? (b ? 1n : 0n) : b;
    if ((typeof x === 'number' && Number.isNaN(x)) || (typeof y === 'number' && Number.isNaN(y))) return null;
    if (x < y) return -1;
    if (x > y) return 1;
    return 0;
  }
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (a instanceof QTuple && b instanceof QTuple) return compareValues(a.items, b.items);
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (!valuesEqual(a[i], b[i])) return compareValues(a[i], b[i]);
    }
    return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
  }
  throw new Unordered();
}

// ---- Форматирование по мини-языку Python: {x:.2f}, {x:>8}, {n:05d}, {n:,} ----
class FormatError extends Error {}
const FORMAT_RE = /^(?:(.)?([<>=^]))?([+\- ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([a-zA-Z%])?$/su;

function groupInt(digits, sep) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
// Точное десятичное форматирование по двоичному значению (округление к чётному, как в Python)
function ratioRoundHalfEven(num, den) {
  let q = num / den;
  const t = 2n * (num - q * den);
  if (t > den || (t === den && (q & 1n))) q += 1n;
  return q;
}
function fixed(x, prec) {            // x ≥ 0, конечный
  const [num, den] = toFraction(x);
  const q = ratioRoundHalfEven(num * 10n ** BigInt(prec), den);
  let s = q.toString();
  if (prec > 0) { s = s.padStart(prec + 1, '0'); s = s.slice(0, -prec) + '.' + s.slice(-prec); }
  return s;
}
function exactExp(x, prec) {         // x > 0: [цифры N (prec+1 знаков), десятичный порядок e]
  const [num, den] = toFraction(x);
  let e = Math.floor(Math.log10(x));
  const ge = (ex) => (ex >= 0 ? num >= 10n ** BigInt(ex) * den : num * 10n ** BigInt(-ex) >= den);
  while (!ge(e)) e--;
  while (ge(e + 1)) e++;
  const sh = prec - e;
  let N = sh >= 0 ? ratioRoundHalfEven(num * 10n ** BigInt(sh), den) : ratioRoundHalfEven(num, den * 10n ** BigInt(-sh));
  if (N >= 10n ** BigInt(prec + 1)) { N /= 10n; e += 1; }
  return [N, e];
}
function expFormat(x, prec, upper) {
  let out;
  if (x === 0) out = '0' + (prec ? '.' + '0'.repeat(prec) : '') + 'e+00';
  else {
    const [N, e] = exactExp(x, prec);
    const ds = N.toString();
    const ae = Math.abs(e);
    out = ds[0] + (prec ? '.' + ds.slice(1) : '') + 'e' + (e < 0 ? '-' : '+') + (ae < 10 ? '0' + ae : String(ae));
  }
  return upper ? out.toUpperCase() : out;
}
function generalFormat(x, prec, upper, alt) {
  if (prec === 0) prec = 1;
  if (x === 0) return alt ? '0.' + '0'.repeat(prec - 1) : '0';
  const [, e] = exactExp(x, prec - 1);
  let s = e >= -4 && e < prec ? fixed(x, prec - 1 - e) : expFormat(x, prec - 1, false);
  if (!alt) {
    if (s.includes('e')) { let [m, ex] = s.split('e'); if (m.includes('.')) m = m.replace(/0+$/, '').replace(/\.$/, ''); s = m + 'e' + ex; }
    else if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  return upper ? s.toUpperCase() : s;
}

function formatValue(value, spec) {
  const m = FORMAT_RE.exec(spec);
  if (!m) throw new FormatError();
  let [, fill, align, sign, alt, zero, width, group, prec, type] = m;
  width = width ? parseInt(width, 10) : 0;
  prec = prec !== undefined ? parseInt(prec, 10) : null;
  if (type && !'bcdeEfFgGnosxX%'.includes(type)) throw new FormatError();
  const isStrVal = typeof value === 'string';
  const numeric = isNum(value);
  if (!isStrVal && !numeric) {
    if (spec === '') return toStr(value);
    throw new FormatError();
  }
  let body, signStr = '';
  if (isStrVal) {
    if (type && type !== 's') throw new FormatError();
    if (sign || alt || zero || group) throw new FormatError();
    const chars = strChars(value);
    body = prec !== null ? chars.slice(0, prec).join('') : value;
    align = align || '<';
  } else {
    let t = type;
    const asInt = isInt(value);
    if (t === 'c') {
      if (!asInt) throw new FormatError();
      body = String.fromCodePoint(Number(big(value)));
    } else if (asInt && (t === undefined || t === 'd' || t === 'n' || t === 'x' || t === 'X' || t === 'o' || t === 'b')) {
      if (prec !== null) throw new FormatError();
      let n = big(value);
      if (n < 0n) { signStr = '-'; n = -n; }
      const base = { x: 16, X: 16, o: 8, b: 2 }[t] || 10;
      let digits = n.toString(base);
      if (t === 'X') digits = digits.toUpperCase();
      if (group) digits = groupInt(digits, group);
      if (alt && base !== 10) digits = { 16: '0x', 8: '0o', 2: '0b' }[base] + digits; // префикс — внутри знака
      body = digits;
    } else {
      // вещественные форматы (в том числе для целых: f, e, g, %)
      if (t === 'd' || t === 'x' || t === 'X' || t === 'o' || t === 'b' || t === 'c' || t === 's') throw new FormatError();
      let x = toNumber(value);
      if (Number.isNaN(x)) { body = 'nan'; }
      else {
        if (x < 0 || Object.is(x, -0)) { signStr = '-'; x = -x; }
        if (!Number.isFinite(x)) body = 'inf';
        else if (t === 'f' || t === 'F') body = fixed(x, prec ?? 6);
        else if (t === 'e' || t === 'E') body = expFormat(x, prec ?? 6, t === 'E');
        else if (t === 'g' || t === 'G' || t === 'n') body = generalFormat(x, prec ?? 6, t === 'G', !!alt);
        else if (t === '%') body = fixed(x * 100, prec ?? 6) + '%';
        else if (prec !== null) { body = generalFormat(x, prec, false, false); if (!/[.e]/.test(body)) body += '.0'; }
        else body = floatRepr(x);
        if (group && /^\d/.test(body)) { const [ip, ...rest] = body.split('.'); body = groupInt(ip, group) + (rest.length ? '.' + rest.join('.') : ''); }
        if (t === 'F' || t === 'G') body = body.toUpperCase();
      }
      if (isFloat(value) && (t === undefined || t === 'g' || t === 'G') && Number.isFinite(x)) { /* repr-режим уже учтён */ }
    }
    if (sign === '+' && signStr === '') signStr = '+';
    else if (sign === ' ' && signStr === '') signStr = ' ';
    if (zero && !align) { align = '='; fill = fill ?? '0'; }
    align = align || '>';
  }
  fill = fill ?? ' ';
  const total = strLen(signStr) + strLen(body);
  if (width > total) {
    const pad = width - total;
    if (align === '<') return signStr + body + fill.repeat(pad);
    if (align === '>') return fill.repeat(pad) + signStr + body;
    if (align === '^') { const left = Math.floor(pad / 2); return fill.repeat(left) + signStr + body + fill.repeat(pad - left); }
    return signStr + fill.repeat(pad) + body; // '='
  }
  return signStr + body;
}

// Округление «по-школьному» (ROUND_HALF_UP) по десятичному представлению repr(x)
function roundHalfUp(x, digits) {
  let mant, exp = 0, negative;
  if (typeof x === 'bigint') { negative = x < 0n; mant = (negative ? -x : x).toString(); }
  else {
    negative = x < 0 || Object.is(x, -0);
    const s = floatRepr(Math.abs(x));
    mant = s;
    const ei = s.indexOf('e');
    if (ei >= 0) { mant = s.slice(0, ei); exp = parseInt(s.slice(ei + 1), 10); }
  }
  const [ip, fp = ''] = mant.split('.');
  const num = BigInt(ip + fp);
  const scale = fp.length - exp;       // x = num / 10^scale
  const shift = scale - digits;        // результат = round(num / 10^shift) / 10^digits
  let q;
  if (shift <= 0) q = num * 10n ** BigInt(-shift);
  else {
    const p = 10n ** BigInt(shift);
    q = num / p;
    if ((num % p) * 2n >= p) q += 1n;
  }
  return { negative, q };
}

// ---- Целая арифметика Python ----
function floorDiv(a, b) { let q = a / b; if ((a % b !== 0n) && ((a < 0n) !== (b < 0n))) q -= 1n; return q; }
function pyMod(a, b) { let r = a % b; if (r !== 0n && ((r < 0n) !== (b < 0n))) r += b; return r; }

function floatFloorDiv(vx, wx) {
  let mod = vx % wx;
  let div = (vx - mod) / wx;
  if (mod) { if ((wx < 0) !== (mod < 0)) { mod += wx; div -= 1.0; } }
  let floordiv;
  if (div) { floordiv = Math.floor(div); if (div - floordiv > 0.5) floordiv += 1.0; }
  else floordiv = (vx / wx) < 0 || Object.is(vx / wx, -0) ? -0 : 0;
  return floordiv;
}
function floatMod(vx, wx) {
  let mod = vx % wx;
  if (mod) { if ((wx < 0) !== (mod < 0)) mod += wx; }
  else mod = wx < 0 || Object.is(wx, -0) ? -0 : 0;
  return mod;
}

// ---- Точная сумма (math.fsum, алгоритм Шьючука) ----
function fsum(values) {
  const partials = [];
  let special = 0;
  for (let x of values) {
    x = Number(x);
    if (!Number.isFinite(x)) { special += x; continue; }
    let i = 0;
    for (let j = 0; j < partials.length; j++) {
      let y = partials[j];
      if (Math.abs(x) < Math.abs(y)) { const t = x; x = y; y = t; }
      const hi = x + y;
      const lo = y - (hi - x);
      if (lo) partials[i++] = lo;
      x = hi;
    }
    partials.length = i;
    partials.push(x);
  }
  if (special !== 0 || (values.length && Number.isNaN(special))) return special;
  let n = partials.length, hi = 0;
  if (n > 0) {
    hi = partials[--n];
    let lo = 0;
    while (n > 0) {
      const x = hi;
      const y = partials[--n];
      hi = x + y;
      const yr = hi - x;
      lo = y - yr;
      if (lo) break;
    }
    if (n > 0 && ((lo < 0 && partials[n - 1] < 0) || (lo > 0 && partials[n - 1] > 0))) {
      const y = lo * 2;
      const x = hi + y;
      const yr = x - hi;
      if (y === yr) hi = x;
    }
  }
  return hi;
}
