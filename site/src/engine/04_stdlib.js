// ===================================================================
// Генератор случайных чисел: Mersenne Twister, совместимый с Python random (seed(int), random,
// randint, choice) — одинаковые последовательности при одинаковом тұқым(n)
// ===================================================================
class PyRandom {
  constructor() { this.mt = new Uint32Array(624); this.idx = 625; this.seedFromTime(); }
  seedFromTime() {
    const t = (typeof performance !== 'undefined' ? performance.now() : 0);
    const r = [Date.now() >>> 0, Math.floor(Math.random() * 4294967296) >>> 0, Math.floor(t * 1000) >>> 0];
    this.initByArray(r);
  }
  initGenrand(s) {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) mt[i] = (Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i) >>> 0;
    this.idx = 624;
  }
  initByArray(key) {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1, j = 0;
    let k = Math.max(624, key.length);
    for (; k; k--) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (k = 623; k; k--) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i) >>> 0;
      i++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
    }
    mt[0] = 0x80000000;
    this.idx = 624;
  }
  seed(n) {  // n: BigInt (целое)
    let a = n < 0n ? -n : n;
    const key = [];
    if (a === 0n) key.push(0);
    while (a > 0n) { key.push(Number(a & 0xffffffffn)); a >>= 32n; }
    this.initByArray(key);
  }
  genrand() {
    const mt = this.mt;
    if (this.idx >= 624) {
      let kk = 0, y;
      for (; kk < 624 - 397; kk++) {
        y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
        mt[kk] = mt[kk + 397] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
      }
      for (; kk < 623; kk++) {
        y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
        mt[kk] = mt[kk + (397 - 624)] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
      }
      y = (mt[623] & 0x80000000) | (mt[0] & 0x7fffffff);
      mt[623] = mt[396] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
      this.idx = 0;
    }
    let y = mt[this.idx++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
  random() {
    const a = this.genrand() >>> 5, b = this.genrand() >>> 6;
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }
  getrandbits(k) {  // k: number > 0, результат BigInt
    if (k <= 32) return BigInt(this.genrand() >>> (32 - k));
    const words = Math.floor((k - 1) / 32) + 1;
    let result = 0n;
    let rem = k;
    for (let i = 0; i < words; i++) {
      let r = this.genrand();
      if (rem < 32) r = r >>> (32 - rem);
      result |= BigInt(r) << BigInt(32 * i);
      rem -= 32;
    }
    return result;
  }
  randbelow(n) {  // n: BigInt > 0
    const k = bitLen(n);
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }
  randint(a, b) { return a + this.randbelow(b - a + 1n); }
}

// ===================================================================
// Реестр встроенных функций
// ===================================================================
const BUILTINS = new Map();
const CONSTANTS = { 'пи': Math.PI };
const LANG_BUILTINS = new Map(LANG.builtins.map((b) => [b.name, b]));

function def(name, minArgs, maxArgs, fn) {
  const meta = LANG_BUILTINS.get(name);
  if (!meta) throw new Error('Нет описания встроенной функции в language.json: ' + name);
  BUILTINS.set(name, new Builtin(name, fn, minArgs, maxArgs, meta.category, meta.signature, meta.doc, !!meta.unsafe,
                                 meta.kw && meta.kw.length ? meta.kw : null));
}

const METHODS = { str: {}, list: {}, dict: {} };
function method(kind, name, minArgs, maxArgs, fn) { METHODS[kind][name] = { fn, minArgs, maxArgs }; }
function methodTable(obj) {
  if (typeof obj === 'string') return METHODS.str;
  if (Array.isArray(obj)) return METHODS.list;
  if (obj instanceof QDict) return METHODS.dict;
  return null;
}

// ---- проверки аргументов ----
const isNumberArg = (v) => typeof v === 'bigint' || typeof v === 'number';
function expectNumber(fname, v, label = 'сан') {
  if (!isNumberArg(v)) throw rtError(`«${fname}»: ожидалось число (${label}), получено ${typeName(v)}`);
  return v;
}
function expectInt(fname, v, label = 'бүтін сан') {
  if (typeof v !== 'bigint') throw rtError(`«${fname}»: ожидалось целое число (${label}), получено ${typeName(v)}`);
  return v;
}
function expectStr(fname, v) {
  if (typeof v !== 'string') throw rtError(`«${fname}»: ожидалась строка (мәтін), получено ${typeName(v)}`);
  return v;
}
const MAX_LIST = 20000000;
function asList(fname, v) {
  if (Array.isArray(v)) return v.slice();
  if (typeof v === 'string') return strChars(v);
  if (v instanceof QRange) {
    if (v.length > BigInt(MAX_LIST)) throw rtError(`«${fname}»: коллекция слишком велика`);
    const out = [];
    const len = Number(v.length);
    for (let i = 0; i < len; i++) out.push(v.at(BigInt(i)));
    return out;
  }
  if (v instanceof QDict) return v.keys();
  throw rtError(`«${fname}»: ожидалась коллекция (тізім, аралық, мәтін, сөздік), получено ${typeName(v)}`);
}
function numbersArg(fname, v) {
  const items = asList(fname, v);
  for (const x of items) if (!isNumberArg(x)) throw rtError(`«${fname}»: все элементы должны быть числами, найден ${typeName(x)}`);
  return items;
}
function exactSum(items) {
  if (items.every((x) => typeof x === 'bigint')) return items.reduce((a, b) => a + b, 0n);
  return fsum(items.map(Number));
}
const toBigInt = (n) => BigInt(n);
function cpIndex(s, utf16Index) { return hasAstral(s) ? Array.from(s.slice(0, utf16Index)).length : utf16Index; }

// ---------------- Core ----------------
def('жаз', 0, null, (it, ...args) => { it.write(args.map(toStr).join(' ') + '\n'); return null; });
def('енгіз', 0, 1, (it, prompt = '') => {
  if (prompt !== '') it.write(toStr(prompt));
  const line = it.readLine();
  if (line === null) throw rtError('Ввод закончился: нет данных для «енгіз»');
  return line;
});
def('ұзындық', 1, 1, (it, x) => {
  if (typeof x === 'string') return BigInt(strLen(x));
  if (Array.isArray(x)) return BigInt(x.length);
  if (x instanceof QDict) return BigInt(x.size);
  if (x instanceof QRange) return x.length;
  throw rtError(`«ұзындық»: у значения типа ${typeName(x)} нет длины`, 'Длину имеют мәтін, тізім, сөздік и аралық.');
});
def('түр', 1, 1, (it, x) => typeName(x));
def('бүтін', 1, 1, (it, x) => {
  if (typeof x === 'string') {
    const t = x.trim().replace(/_/g, '');
    if (!/^[+-]?\d+$/.test(t))
      throw rtError(`Мәтінді бүтін санға айналдыру мүмкін емес: ${toRepr(x)}`, 'Строка должна содержать целое число, например "42".');
    return BigInt(t);
  }
  if (typeof x === 'boolean') return x ? 1n : 0n;
  if (typeof x === 'bigint') return x;
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) throw rtError('Нельзя превратить nan/inf в целое число');
    return BigInt(Math.trunc(x));
  }
  throw rtError(`«бүтін»: нельзя преобразовать ${typeName(x)} в целое число`);
});
def('нақты', 1, 1, (it, x) => {
  if (typeof x === 'string') {
    const t = x.trim().replace(/_/g, '');
    const m = /^([+-]?)(?:(\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|(inf(?:inity)?)|(nan))$/i.exec(t);
    if (!m) throw rtError(`Мәтінді нақты санға айналдыру мүмкін емес: ${toRepr(x)}`, 'Пример корректной строки: "3.14".');
    if (m[4]) return NaN;
    if (m[3]) return m[1] === '-' ? -Infinity : Infinity;
    return Number(t);
  }
  if (typeof x === 'number') return x;
  if (typeof x === 'bigint') return Number(x);
  if (typeof x === 'boolean') return x ? 1 : 0;
  throw rtError(`«нақты»: нельзя преобразовать ${typeName(x)} в число`);
});
def('мәтін', 0, 1, (it, ...args) => (args.length ? toStr(args[0]) : ''));
def('логика', 1, 1, (it, x) => truthy(x));
def('тізім', 0, 1, (it, ...args) => (args.length ? asList('тізім', args[0]) : []));
def('сөздік', 0, 1, (it, ...args) => {
  if (!args.length) return new QDict();
  const src = args[0];
  if (src instanceof QDict) return src.copy();
  const out = new QDict();
  for (const pair of asList('сөздік', src)) {
    if (!Array.isArray(pair) || pair.length !== 2) throw rtError('«сөздік»: ожидался список пар [[ключ, значение], …]');
    try { out.set(pair[0], pair[1]); }
    catch (e) { if (e instanceof Unhashable) throw rtError('«сөздік»: ключом не может быть изменяемое значение (тізім/сөздік)'); throw e; }
  }
  return out;
});
def('аралық', 1, 3, (it, ...args) => {
  for (const a of args) expectInt('аралық', a);
  if (args.length === 3 && args[2] === 0n) throw rtError('«аралық»: шаг не может быть нулём');
  if (args.length === 1) return new QRange(0n, args[0], 1n);
  if (args.length === 2) return new QRange(args[0], args[1], 1n);
  return new QRange(args[0], args[1], args[2]);
});
def('модуль', 1, 1, (it, x) => {
  expectNumber('модуль', x);
  return typeof x === 'bigint' ? (x < 0n ? -x : x) : Math.abs(x);
});
function minMax(name, wantMax, args) {
  const items = args.length === 1 ? asList(name, args[0]) : args;
  if (!items.length) throw rtError(`«${name}»: пустая коллекция`);
  let best = items[0];
  for (let i = 1; i < items.length; i++) {
    let c;
    try { c = compareValues(items[i], best); }
    catch (e) { if (e instanceof Unordered) throw rtError(`«${name}»: значения нельзя сравнивать между собой`); throw e; }
    if (c !== null && (wantMax ? c > 0 : c < 0)) best = items[i];
  }
  return best;
}
def('минимум', 1, null, (it, ...args) => minMax('минимум', false, args));
def('максимум', 1, null, (it, ...args) => minMax('максимум', true, args));
def('қосынды', 1, 2, (it, items, start = 0n) => {
  const values = [expectNumber('қосынды', start)];
  for (const x of asList('қосынды', items)) values.push(expectNumber('қосынды', x));
  return exactSum(values);
});
def('дөңгелекте', 1, 2, (it, x, digits = 0n) => {
  expectNumber('дөңгелекте', x);
  expectInt('дөңгелекте', digits);
  if (typeof x === 'number' && !Number.isFinite(x)) throw rtError('«дөңгелекте»: нельзя округлить nan/inf');
  if (typeof x === 'bigint' && digits >= 0n) return x;
  const d = Number(digits);
  const { negative, q } = roundHalfUp(x, d);
  if (q.toString().length > 28) throw rtError('«дөңгелекте»: число слишком велико');
  if (d <= 0) {
    const v = q * 10n ** BigInt(-d);
    return negative ? -v : v;
  }
  return Number(`${negative ? '-' : ''}${q}e-${d}`);
});
def('еден', 1, 1, (it, x) => {
  expectNumber('еден', x);
  return typeof x === 'bigint' ? x : BigInt(Math.floor(x));
});
def('төбе', 1, 1, (it, x) => {
  expectNumber('төбе', x);
  return typeof x === 'bigint' ? x : BigInt(Math.ceil(x));
});
def('сұрып', 1, 2, (it, items, reverse = false) => {
  const list = asList('сұрып', items);
  const rev = truthy(reverse);
  try {
    return list.sort((a, b) => {
      const c = rev ? compareValues(b, a) : compareValues(a, b);
      return c === null ? 0 : c;
    });
  } catch (e) {
    if (e instanceof Unordered) throw rtError('«сұрып»: значения разных типов нельзя сортировать вместе');
    throw e;
  }
});
def('сүз', 2, 2, (it, fn, items) => asList('сүз', items).filter((x) => truthy(it.callValue(fn, [x]))));
def('бейнеле', 2, 2, (it, fn, items) => asList('бейнеле', items).map((x) => it.callValue(fn, [x])));
def('кері', 1, 1, (it, x) => {
  if (typeof x === 'string') return strChars(x).reverse().join('');
  if (Array.isArray(x) || x instanceof QRange) return asList('кері', x).reverse();
  throw rtError(`«кері»: нельзя перевернуть значение типа ${typeName(x)}`);
});

// ---------------- методы мәтін ----------------
method('str', 'жоғары', 0, 0, (it, s) => s.toUpperCase());
method('str', 'төмен', 0, 0, (it, s) => s.toLowerCase());
method('str', 'тазала', 0, 0, (it, s) => s.trim());
method('str', 'бөл', 0, 1, (it, s, sep) => {
  if (sep !== undefined && sep !== null) {
    expectStr('бөл', sep);
    if (sep === '') throw rtError('«бөл»: разделитель не может быть пустым');
    return s.split(sep);
  }
  return s.split(/\s+/).filter((p) => p !== '');
});
method('str', 'біріктір', 1, 1, (it, s, items) => {
  const parts = asList('біріктір', items);
  for (const p of parts)
    if (typeof p !== 'string') throw rtError(`«біріктір»: элементы должны быть мәтін, найден ${typeName(p)}`, 'Преобразуйте элементы через бейнеле(мәтін, список).');
  return parts.join(s);
});
method('str', 'ауыстыр', 2, 2, (it, s, a, b) => {
  expectStr('ауыстыр', a); expectStr('ауыстыр', b);
  if (a === '') { const chars = strChars(s); return chars.length ? b + chars.join(b) + b : b; }
  return s.split(a).join(b);
});
method('str', 'бастала', 1, 1, (it, s, p) => s.startsWith(expectStr('бастала', p)));
method('str', 'аяқтал', 1, 1, (it, s, p) => s.endsWith(expectStr('аяқтал', p)));
method('str', 'тап', 1, 1, (it, s, sub) => {
  const i = s.indexOf(expectStr('тап', sub));
  return i < 0 ? -1n : BigInt(cpIndex(s, i));
});
method('str', 'сана', 1, 1, (it, s, sub) => {
  expectStr('сана', sub);
  if (sub === '') throw rtError('«сана»: подстрока не может быть пустой');
  return BigInt(s.split(sub).length - 1);
});

// ---------------- методы тізім ----------------
method('list', 'қос', 1, 1, (it, l, x) => { l.push(x); return null; });
method('list', 'кірістір', 2, 2, (it, l, i, x) => {
  let k = Number(expectInt('кірістір', i));
  const n = l.length;
  if (k < 0) k = Math.max(0, k + n);
  if (k > n) k = n;
  l.splice(k, 0, x);
  return null;
});
method('list', 'шығар', 0, 1, (it, l, i = -1n) => {
  expectInt('шығар', i);
  if (!l.length) throw rtError('«шығар»: список пуст');
  const n = BigInt(l.length);
  if (!(-n <= i && i < n)) throw rtError(`«шығар»: индекс ${i} вне диапазона (длина ${n})`);
  const k = Number(i < 0n ? i + n : i);
  return l.splice(k, 1)[0];
});
method('list', 'өшір', 1, 1, (it, l, x) => {
  const k = l.findIndex((y) => valuesEqual(y, x));
  if (k < 0) throw rtError(`«өшір»: значения ${toRepr(x)} нет в списке`);
  l.splice(k, 1);
  return null;
});
method('list', 'тап', 1, 1, (it, l, x) => BigInt(l.findIndex((y) => valuesEqual(y, x))));
method('list', 'сана', 1, 1, (it, l, x) => BigInt(l.filter((y) => valuesEqual(y, x)).length));
method('list', 'ұзарт', 1, 1, (it, l, items) => { for (const x of asList('ұзарт', items)) l.push(x); return null; });
method('list', 'көшір', 0, 0, (it, l) => l.slice());
method('list', 'босат', 0, 0, (it, l) => { l.length = 0; return null; });

// ---------------- методы сөздік ----------------
const unhashable = () => rtError('Ключом не может быть изменяемое значение (тізім/сөздік)');
function dictGet(d, key) {
  try { return d.get(key); } catch (e) { if (e instanceof Unhashable) throw unhashable(); throw e; }
}
method('dict', 'кілттер', 0, 0, (it, d) => d.keys());
method('dict', 'мәндер', 0, 0, (it, d) => d.values());
method('dict', 'жұптар', 0, 0, (it, d) => d.entries());
method('dict', 'ал', 1, 2, (it, d, key, def_ = null) => { const v = dictGet(d, key); return v === undefined ? def_ : v; });
method('dict', 'шығар', 1, 2, (it, d, key, ...dflt) => {
  const v = dictGet(d, key);
  if (v !== undefined) { d.delete(key); return v; }
  if (dflt.length) return dflt[0];
  throw rtError(`Ключ не найден: ${toRepr(key)}`);
});
method('dict', 'өшір', 1, 1, (it, d, key) => {
  if (dictGet(d, key) === undefined) throw rtError(`Ключ не найден: ${toRepr(key)}`);
  d.delete(key);
  return null;
});
method('dict', 'жаңарт', 1, 1, (it, d, other) => {
  if (!(other instanceof QDict)) throw rtError('«жаңарт»: ожидался сөздік');
  for (const [k, v] of other.entries()) d.set(k, v);
  return null;
});
method('dict', 'көшір', 0, 0, (it, d) => d.copy());
method('dict', 'босат', 0, 0, (it, d) => { d.clear(); return null; });

// ---------------- Math ----------------
function bigLog(x) {  // натуральный логарифм BigInt, как math.log в Python (в том числе для очень больших)
  const n = Number(x);
  if (Number.isFinite(n)) return hpLog(n);
  const e = bitLen(x);
  const s = BigInt(e - 53);
  let q = x >> s;
  const rem = x - (q << s), half = 1n << (s - 1n);
  if (rem > half || (rem === half && (q & 1n))) q += 1n;
  return hpLog(Number(q) / 9007199254740992) + hpLog(2.0) * e;
}
function floatArg(name, v) {
  expectNumber(name, v);
  if (typeof v === 'bigint') {
    const n = Number(v);
    if (!Number.isFinite(n)) throw rtError(`«${name}»: OverflowError: int too large to convert to float`);
    return n;
  }
  return v;
}
const domainError = (name) => rtError(`«${name}»: ValueError: math domain error`);
def('түбір', 1, 1, (it, x) => {
  expectNumber('түбір', x);
  if (x < 0) throw rtError('«түбір»: корень из отрицательного числа', 'Аргумент должен быть ≥ 0.');
  return Math.sqrt(Number(x));
});
def('дәреже', 2, 2, (it, a, b) => { expectNumber('дәреже', a); expectNumber('дәреже', b); return it.binop('**', a, b); });
def('синус', 1, 1, (it, x) => { const v = floatArg('синус', x); if (!Number.isFinite(v)) throw domainError('синус'); return hpSin(v); });
def('косинус', 1, 1, (it, x) => { const v = floatArg('косинус', x); if (!Number.isFinite(v)) throw domainError('косинус'); return hpCos(v); });
def('тангенс', 1, 1, (it, x) => { const v = floatArg('тангенс', x); if (!Number.isFinite(v)) throw domainError('тангенс'); return hpTan(v); });
def('логарифм', 1, 2, (it, x, base = null) => {
  expectNumber('логарифм', x);
  const domain = () => rtError('«логарифм»: математическая ошибка (math domain error)');
  const ln = (v) => {
    if (v <= 0) throw domain();
    return typeof v === 'bigint' ? bigLog(v) : hpLog(v);
  };
  if (base === null) return ln(x);
  expectNumber('логарифм', base);
  const num = ln(x), den = ln(base);
  if (den === 0) throw rtError('«логарифм»: математическая ошибка (float division by zero)');
  return num / den;
});
def('факториал', 1, 1, (it, n) => {
  expectInt('факториал', n);
  if (n < 0n || n > 5000n) throw rtError('«факториал»: n должно быть от 0 до 5000');
  let r = 1n;
  for (let i = 2n; i <= n; i++) r *= i;
  return r;
});
def('комбинация', 2, 2, (it, n, k) => {
  expectInt('комбинация', n); expectInt('комбинация', k);
  if (n < 0n || k < 0n) throw rtError('«комбинация»: n и k должны быть неотрицательными');
  if (n > 100000n) throw rtError('«комбинация»: n слишком велико (максимум 100000)');
  if (k > n) return 0n;
  if (k > n - k) k = n - k;
  let r = 1n;
  for (let i = 1n; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
});
def('кездейсоқ', 0, 2, (it, ...args) => {
  if (!args.length) return it.rng.random();
  if (args.length !== 2) throw rtError('«кездейсоқ»: нужно 0 или 2 аргумента');
  const a = expectInt('кездейсоқ', args[0]), b = expectInt('кездейсоқ', args[1]);
  if (a > b) throw rtError('«кездейсоқ»: начало диапазона больше конца');
  return it.rng.randint(a, b);
});
def('таңда', 1, 1, (it, items) => {
  const list = asList('таңда', items);
  if (!list.length) throw rtError('«таңда»: коллекция пуста');
  return list[Number(it.rng.randbelow(BigInt(list.length)))];
});
def('тұқым', 1, 1, (it, n) => { it.rng.seed(expectInt('тұқым', n)); return null; });

// ---------------- Data / AI ----------------
function isqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((bitLen(n) + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}
function isqrtFracRto(n, m) { const a = isqrt(n / m); return a | (a * a * m !== n ? 1n : 0n); }
// float -> точная дробь [числитель, знаменатель = степень двойки]
function toFraction(v) {
  if (typeof v === 'bigint') return [v, 1n];
  if (Number.isInteger(v) && Math.abs(v) < 2 ** 53) return [BigInt(v), 1n];
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, v);
  const hi = buf.getUint32(0), lo = buf.getUint32(4);
  const sign = hi >>> 31 ? -1n : 1n;
  const e = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exp;
  if (e === 0) exp = -1074; else { m |= 1n << 52n; exp = e - 1075; }
  let num = sign * m, den = 1n;
  if (exp >= 0) num <<= BigInt(exp); else den = 1n << BigInt(-exp);
  return [num, den];
}
function exactStdev(xs) {
  const n = BigInt(xs.length);
  const fr = xs.map(toFraction);
  let D = 1n;
  for (const [, d] of fr) if (d > D) D = d;
  const N = fr.map(([a, d]) => a * (D / d));
  const S = N.reduce((a, b) => a + b, 0n);
  let num = 0n;
  for (const v of N) { const dev = n * v - S; num += dev * dev; }
  let den = (n * D) * (n * D) * (n - 1n);
  if (num === 0n) return 0.0;
  const g = (() => { let a = num, b = den; while (b) { [a, b] = [b, a % b]; } return a; })();
  num /= g; den /= g;
  const q = Math.floor((bitLen(num) - bitLen(den) - 109) / 2);
  let top, bottom;
  if (q >= 0) { top = isqrtFracRto(num, den << BigInt(2 * q)) << BigInt(q); bottom = 1n; }
  else { top = isqrtFracRto(num << BigInt(-2 * q), den); bottom = 1n << BigInt(-q); }
  return Number(top) / Number(bottom);
}
def('талда', 1, 1, (it, data) => {
  const xs = numbersArg('талда', data);
  if (!xs.length) throw rtError('«талда»: нет данных для анализа');
  const sorted = xs.slice().sort((a, b) => compareValues(a, b));
  const n = xs.length;
  const mid = Math.floor(n / 2);
  const median = n % 2 ? sorted[mid] : numTrueDiv(numAdd(sorted[mid - 1], sorted[mid]), 2n);
  let mn = xs[0], mx = xs[0];
  for (const x of xs) { if (compareValues(x, mn) < 0) mn = x; if (compareValues(x, mx) > 0) mx = x; }
  const d = new QDict();
  d.set('саны', BigInt(n));
  d.set('қосынды', exactSum(xs));
  d.set('орташа', fsum(xs.map(Number)) / n);
  d.set('медиана', median);
  d.set('минимум', mn);
  d.set('максимум', mx);
  d.set('ауытқу', n > 1 ? exactStdev(xs) : 0.0);
  return d;
});
def('үйрет', 2, 2, (it, xsA, ysA) => {
  const xs = numbersArg('үйрет', xsA).map(Number), ys = numbersArg('үйрет', ysA).map(Number);
  if (xs.length !== ys.length) throw rtError('«үйрет»: x и y должны быть одной длины');
  if (xs.length < 2) throw rtError('«үйрет»: нужно минимум 2 точки');
  const mx = fsum(xs) / xs.length, my = fsum(ys) / ys.length;
  const sxx = fsum(xs.map((x) => (x - mx) * (x - mx)));
  if (sxx === 0) throw rtError('«үйрет»: все значения x одинаковы — прямую построить нельзя');
  const k = fsum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sxx;
  const b = my - k * mx;
  const ssTot = fsum(ys.map((y) => (y - my) * (y - my)));
  const ssRes = fsum(xs.map((x, i) => { const r = ys[i] - (k * x + b); return r * r; }));
  const r2 = ssTot === 0 ? 1.0 : 1 - ssRes / ssTot;
  const d = new QDict();
  d.set('түр', 'сызықтық'); d.set('көлбеу', k); d.set('жылжу', b); d.set('R2', r2);
  return d;
});
def('болжа', 2, 2, (it, model, x) => {
  if (!(model instanceof QDict) || model.get('түр') !== 'сызықтық' || model.get('көлбеу') === undefined || model.get('жылжу') === undefined)
    throw rtError('«болжа»: первый аргумент должен быть моделью из үйрет()');
  const k = model.get('көлбеу'), b = model.get('жылжу');
  const f = (v) => toNumber(k) * Number(expectNumber('болжа', v)) + toNumber(b);
  return Array.isArray(x) ? x.map(f) : f(x);
});

// ---------------- Science / IO: недоступны в браузере ----------------
function unavailable(name, why, hint) {
  return () => { throw rtError(`Функция «${name}» ${why}`, hint); };
}
const SYMPY_HINT = 'Установите Qazaq локально (pip install "qazaq[science]") или запустите Playground в режиме сервера.';
def('сыз', 2, 3, unavailable('сыз', 'недоступна в браузерной версии', null));
def('оқы', 1, 1, unavailable('оқы', 'недоступна в браузерной версии', null));
def('сақта', 2, 2, unavailable('сақта', 'недоступна в браузерной версии', null));

