// ===================================================================
// Символьная математика для многочленов (шеш, туын, интегр) без SymPy.
// Поддерживаются многочлены от одной переменной с целыми коэффициентами в раскрытом виде:
//   суммы мономов c*x^n, 2x, (x), деление на число, степень монома, скобки с одним слагаемым.
// Вывод повторяет правила печати SymPy. Остальное (комплексные корни, степени выше второй
// без рациональных корней, произведения сумм, функции, десятичные дроби) — в локальной версии.
// ===================================================================
class SymUnsupported extends Error {}
const SYM_FUNCS = new Set(['sin', 'cos', 'tan', 'exp', 'log', 'ln', 'sqrt', 'abs', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'pi', 'E']);
const SYM_BAD_NAMES = new Set(['if', 'in', 'or', 'is', 'not', 'and', 'for', 'def', 'del', 'try', 'as']);
const SYM_MAX_LEN = 200;
const SYM_TOKEN = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z][A-Za-z0-9]*)|(\*\*|[-+*/^(),=]))/y;

function symFail(fname, text) { return rtError(`«${fname}»: не удалось разобрать выражение «${text}»`); }
function symUnsupported(fname, why) {
  return rtError(`«${fname}»: в браузерной версии поддерживаются многочлены от одной переменной с целыми коэффициентами в раскрытом виде (${why})`,
                 SYMPY_HINT);
}

// Та же проверка, что в Python (qaz/stdlib/science.py::_validate): допускаются числа, имена, арифметика
function symTokens(fname, text) {
  if (text.length > SYM_MAX_LEN) throw rtError(`«${fname}»: выражение слишком длинное (максимум ${SYM_MAX_LEN} символов)`);
  const toks = [];
  let pos = 0;
  while (pos < text.length) {
    if (text.slice(pos).trim() === '') break;
    SYM_TOKEN.lastIndex = pos;
    const m = SYM_TOKEN.exec(text);
    if (!m) {
      const bad = text.slice(pos).trimStart()[0];
      throw rtError(`«${fname}»: недопустимый символ «${bad}» в выражении`);
    }
    const [, num, name, op] = m;
    if (num) toks.push({ k: 'num', v: num });
    else if (name) {
      if (SYM_FUNCS.has(name)) toks.push({ k: 'func', v: name });
      else if (name.length <= 3 && /^[A-Za-z0-9]+$/.test(name) && !SYM_BAD_NAMES.has(name.toLowerCase())) toks.push({ k: 'name', v: name });
      else throw rtError(`«${fname}»: имя «${name}» не разрешено`,
                         'Допустимы переменные до 3 символов и функции: ' + [...SYM_FUNCS].filter((n) => n !== 'pi' && n !== 'E').sort().join(', '));
    } else toks.push({ k: 'op', v: op === '^' ? '**' : op });
    pos = SYM_TOKEN.lastIndex;
  }
  return toks;
}

// ---- рациональные числа и многочлены ----
const bgcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; };
function fr(n, d = 1n) { if (d < 0n) { n = -n; d = -d; } const g = bgcd(n, d) || 1n; return [n / g, d / g]; }
const frAdd = (a, b) => fr(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const frMul = (a, b) => fr(a[0] * b[0], a[1] * b[1]);
const frNeg = (a) => [-a[0], a[1]];

// Poly: Map степень -> [числитель, знаменатель]; нулевых коэффициентов нет
const pConst = (c) => { const p = new Map(); if (c[0] !== 0n) p.set(0, c); return p; };
function pAdd(a, b) {
  const r = new Map(a);
  for (const [d, c] of b) {
    const s = r.has(d) ? frAdd(r.get(d), c) : c;
    if (s[0] === 0n) r.delete(d); else r.set(d, s);
  }
  return r;
}
const pScale = (a, c) => { const r = new Map(); if (c[0] === 0n) return r; for (const [d, k] of a) r.set(d, frMul(k, c)); return r; };
const pIsConst = (p) => p.size === 0 || (p.size === 1 && p.has(0));
const pIsMonomial = (p) => p.size <= 1;
function pMul(a, b) {
  if (pIsConst(a)) return pScale(b, a.size ? a.get(0) : [0n, 1n]);
  if (pIsConst(b)) return pScale(a, b.size ? b.get(0) : [0n, 1n]);
  if (pIsMonomial(a) && pIsMonomial(b)) {
    const [[da, ca]] = a, [[db, cb]] = b;
    return new Map([[da + db, frMul(ca, cb)]]);
  }
  throw new SymUnsupported('произведение сумм');
}
function pPow(a, n) {
  if (n === 0) return pConst([1n, 1n]);
  if (n === 1) return a;
  if (pIsConst(a)) {
    const c = a.size ? a.get(0) : [0n, 1n];
    let r = [1n, 1n];
    for (let i = 0; i < n; i++) r = frMul(r, c);
    return pConst(r);
  }
  if (pIsMonomial(a)) {
    const [[d, c]] = a;
    let r = [1n, 1n];
    for (let i = 0; i < n; i++) r = frMul(r, c);
    return new Map([[d * n, r]]);
  }
  throw new SymUnsupported('степень суммы');
}

// ---- разбор выражения ----
function symParse(fname, text) {
  const toks = symTokens(fname, text);
  const names = new Set();
  let i = 0;
  const peek = () => toks[i];
  const fail = () => { throw symFail(fname, text); };
  function atom() {
    const t = toks[i];
    if (!t) fail();
    if (t.k === 'num') {
      i++;
      if (t.v.includes('.')) throw new SymUnsupported('десятичные дроби');
      return pConst([BigInt(t.v), 1n]);
    }
    if (t.k === 'name') { i++; names.add(t.v); return new Map([[1, [1n, 1n]]]); }
    if (t.k === 'func') throw new SymUnsupported('функции и константы');
    if (t.k === 'op' && t.v === '(') {
      i++;
      const p = expr();
      if (!toks[i] || toks[i].v !== ')') fail();
      i++;
      return p;
    }
    return fail();
  }
  function power() {
    const base = atom();
    if (peek() && peek().k === 'op' && peek().v === '**') {
      i++;
      const neg = peek() && peek().k === 'op' && peek().v === '-';
      if (neg) i++;
      const e = atom();
      if (!pIsConst(e) || (e.size && e.get(0)[1] !== 1n)) throw new SymUnsupported('нецелая степень');
      const n = e.size ? e.get(0)[0] : 0n;
      if (neg) throw new SymUnsupported('отрицательная степень');
      if (n > 1000n) throw new SymUnsupported('слишком большая степень');
      return pPow(base, Number(n));
    }
    return base;
  }
  function unary() {
    const t = peek();
    if (t && t.k === 'op' && (t.v === '-' || t.v === '+')) {
      i++;
      const p = unary();
      return t.v === '-' ? pScale(p, [-1n, 1n]) : p;
    }
    return power();
  }
  function term() {
    let p = unary();
    for (;;) {
      const t = peek();
      if (t && t.k === 'op' && t.v === '*') { i++; p = pMul(p, unary()); }
      else if (t && t.k === 'op' && t.v === '/') {
        i++;
        const d = unary();
        if (!pIsConst(d)) throw new SymUnsupported('деление на выражение с переменной');
        const c = d.size ? d.get(0) : [0n, 1n];
        if (c[0] === 0n) throw rtError(`«${fname}»: деление на ноль в выражении «${text}»`);
        p = new Map(Array.from(p, ([d2, k]) => [d2, fr(k[0] * c[1], k[1] * c[0])]));   // деление на число c
      } else if (t && (t.k === 'name' || (t.k === 'op' && t.v === '(')) && toks[i - 1] && toks[i - 1].k === 'num') {
        p = pMul(p, power());  // неявное умножение: 2x, 3(x)
      } else return p;
    }
  }
  function expr() {
    let p = term();
    for (;;) {
      const t = peek();
      if (t && t.k === 'op' && (t.v === '+' || t.v === '-')) {
        i++;
        const q = term();
        p = pAdd(p, t.v === '-' ? pScale(q, [-1n, 1n]) : q);
      } else return p;
    }
  }
  const p = expr();
  if (i < toks.length) fail();
  return { poly: p, names };
}

// ---- печать как в SymPy ----
function frStr(c) { return c[1] === 1n ? c[0].toString() : `${c[0]}/${c[1]}`; }
function polyToString(p, v) {
  if (!p.size) return '0';
  const degs = Array.from(p.keys()).sort((a, b) => b - a);
  const termStr = (d) => {
    const c = p.get(d);
    const neg = c[0] < 0n;
    const num = neg ? -c[0] : c[0], den = c[1];
    let body;
    if (d === 0) body = den === 1n ? num.toString() : `${num}/${den}`;
    else {
      const base = d === 1 ? v : `${v}^${d}`;
      body = (num === 1n ? '' : `${num}*`) + base + (den === 1n ? '' : `/${den}`);
    }
    return { neg, body };
  };
  let order = degs;
  // особый случай SymPy (Expr.as_ordered_terms): положительное число + слагаемое c·x^n с отрицательным
  // коэффициентом => число первым
  if (degs.length === 2 && degs[1] === 0 && p.get(0)[0] > 0n && p.get(degs[0])[0] < 0n) order = [0, degs[0]];
  let out = '';
  order.forEach((d, idx) => {
    const { neg, body } = termStr(d);
    if (idx === 0) out += (neg ? '-' : '') + body;
    else out += (neg ? ' - ' : ' + ') + body;
  });
  return out;
}

// как `_convert` в Python: число (целое или дробное) — значением, выражение — строкой
function polyResult(p, v) {
  if (!p.size) return 0n;
  if (p.size === 1 && p.has(0)) return frToValue(p.get(0));
  return polyToString(p, v);
}

function ratioToDouble(n, d) {
  if (n === 0n) return 0;
  const neg = (n < 0n) !== (d < 0n);
  n = n < 0n ? -n : n; d = d < 0n ? -d : d;
  const k = 128;
  let q = (n << BigInt(k)) / d;
  const rem = (n << BigInt(k)) - q * d;
  let e2 = -k;
  if (rem !== 0n) { q = (q << 1n) | 1n; e2 -= 1; }
  const r = hpToDouble(q, e2);
  return neg ? -r : r;
}
function frToValue(c) { return c[1] === 1n ? c[0] : ratioToDouble(c[0], c[1]); }

// имя переменной: как Python `_symbol`
function symVar(fname, names, varArg) {
  if (varArg !== null && varArg !== undefined) {
    expectStr(fname, varArg);
    if (!/^[A-Za-z][A-Za-z0-9]{0,2}$/.test(varArg)) throw rtError(`«${fname}»: недопустимое имя переменной «${varArg}»`);
    if ([...names].some((n) => n !== varArg)) throw new SymUnsupported('несколько переменных');
    return varArg;
  }
  if (names.size > 1) throw rtError(`«${fname}»: в выражении несколько переменных, укажите нужную вторым аргументом`);
  return names.size === 1 ? [...names][0] : 'x';
}
function polyOrUnsupported(fname, fn) {
  try { return fn(); }
  catch (e) {
    if (e instanceof SymUnsupported) throw symUnsupported(fname, e.message);
    throw e;
  }
}

def('туын', 1, 2, (it, expression, varArg = null) => polyOrUnsupported('туын', () => {
  const { poly, names } = symParse('туын', expectStr('туын', expression));
  const v = symVar('туын', names, varArg);
  const d = new Map();
  for (const [deg, c] of poly) if (deg > 0) d.set(deg - 1, frMul(c, [BigInt(deg), 1n]));
  return polyResult(d, v);
}));

def('интегр', 1, 4, (it, expression, varArg = null, a = null, b = null) => polyOrUnsupported('интегр', () => {
  const { poly, names } = symParse('интегр', expectStr('интегр', expression));
  const v = symVar('интегр', names, varArg);
  if ((a === null) !== (b === null)) throw rtError('«интегр»: границы a и b задаются вместе');
  const anti = new Map();
  for (const [deg, c] of poly) anti.set(deg + 1, frMul(c, [1n, BigInt(deg + 1)]));
  if (a === null) return polyResult(anti, v);
  expectNumber('интегр', a); expectNumber('интегр', b);
  if (typeof a !== 'bigint' || typeof b !== 'bigint') throw new SymUnsupported('дробные границы интегрирования');
  const at = (x) => { let s = [0n, 1n]; for (const [deg, c] of anti) { let pw = 1n; for (let i = 0; i < deg; i++) pw *= x; s = frAdd(s, frMul(c, [pw, 1n])); } return s; };
  const res = frAdd(at(b), frNeg(at(a)));
  return frToValue(res);
}));

// ---- решение уравнений ----
function isqrtBig(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((bitLen(n) + 1) >> 1);
  for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; }
}
function divisors(n) {
  n = n < 0n ? -n : n;
  if (n > 1000000000000n) throw new SymUnsupported('слишком большие коэффициенты');
  const out = [];
  for (let d = 1n; d * d <= n; d++) if (n % d === 0n) { out.push(d); if (d * d !== n) out.push(n / d); }
  return out;
}
function solvePoly(poly) {
  // целые коэффициенты: умножаем на НОК знаменателей
  let L = 1n;
  for (const [, c] of poly) L = (L * c[1]) / bgcd(L, c[1]);
  const ic = new Map();
  for (const [d, c] of poly) ic.set(d, (c[0] * L) / c[1]);
  if (!ic.size) return [];
  const minDeg = Math.min(...ic.keys()), maxDeg = Math.max(...ic.keys());
  const roots = [];  // рациональные: [p, q]
  if (minDeg > 0) roots.push([0n, 1n]);
  // убираем множитель x^minDeg
  let cs = [];
  for (let d = maxDeg; d >= minDeg; d--) cs.push(ic.get(d) ?? 0n);   // по убыванию степени
  const trim = () => { while (cs.length && cs[0] === 0n) cs.shift(); };
  trim();
  const horner = (p, q) => {  // значение cs(p/q) * q^deg — целое
    let s = 0n; const n = cs.length - 1;
    for (let k = 0; k <= n; k++) s += cs[k] * p ** BigInt(n - k) * q ** BigInt(k);
    return s;
  };
  const divideOut = (p, q) => {   // делит cs на (q*x - p) нацело
    const n = cs.length - 1;
    const out = [];
    let carry = 0n;
    for (let k = 0; k < n; k++) {
      // коэффициенты частного: рекуррентно  b_k = (a_k + p*b_{k-1}) / q
      const val = cs[k] + p * carry;
      if (val % q !== 0n) throw new SymUnsupported('не удалось разложить многочлен');
      carry = val / q;
      out.push(carry);
    }
    cs = out;
  };
  let guard = 0;
  while (cs.length > 1 && guard++ < 64) {
    const cn = cs[0], c0 = cs[cs.length - 1];
    if (c0 === 0n) { if (!roots.some((r) => r[0] === 0n)) roots.push([0n, 1n]); cs.pop(); continue; }
    let found = false;
    for (const p of divisors(c0)) {
      for (const q of divisors(cn)) {
        if (bgcd(p, q) !== 1n) continue;
        for (const sgn of [1n, -1n]) {
          const pp = sgn * p;
          if (horner(pp, q) === 0n) {
            if (!roots.some((r) => r[0] === pp && r[1] === q)) roots.push([pp, q]);
            divideOut(pp, q);
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) break;
  }
  const out = roots.map(([p, q]) => ({ approx: Number(p) / Number(q), value: frToValue([p, q]) }));
  const deg = cs.length - 1;
  if (deg === 2) {
    const [a, b, c] = cs;
    const D = b * b - 4n * a * c;
    if (D < 0n) throw new SymUnsupported('комплексные корни');
    const P = 200;
    const s = isqrtBig(D << BigInt(2 * P));
    const two = 1n << BigInt(P);
    for (const sg of [1n, -1n]) {
      const num = -b * two + sg * s;
      const rootFixed = num / (2n * a);
      const val = hpToDouble(rootFixed, -P);
      out.push({ approx: val, value: val });
    }
  } else if (deg >= 3) throw new SymUnsupported('корни многочлена выше второй степени');
  out.sort((x, y) => x.approx - y.approx);
  return out.map((r) => r.value);
}

def('шеш', 1, 2, (it, equation, varArg = null) => polyOrUnsupported('шеш', () => {
  const text = expectStr('шеш', equation);
  if (text.split('=').length - 1 > 1) throw rtError("«шеш»: в уравнении может быть только один знак '='");
  let poly, names;
  if (text.includes('=')) {
    const [left, right] = text.split('=');
    const l = symParse('шеш', left), r = symParse('шеш', right);
    poly = pAdd(l.poly, pScale(r.poly, [-1n, 1n]));
    names = new Set([...l.names, ...r.names]);
  } else ({ poly, names } = symParse('шеш', text));
  symVar('шеш', names, varArg);
  return solvePoly(poly);
}));
