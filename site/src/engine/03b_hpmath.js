// ===================================================================
// Математика с корректным округлением (sin, cos, tan, log, pow).
// Вычисления ведутся на BigInt с фиксированной точкой (192+ бит), результат округляется до ближайшего
// double. Встроенные Math.sin/cos/… в V8 иногда отличаются от libm в последнем бите, из-за чего
// результаты на сайте расходились бы с локальным Qazaq.
// ===================================================================
const HP_BITS = 192;
const hpCache = { ln2: new Map(), pi: new Map() };

function hpDecompose(x) {  // x — конечный double ≠ 0:  x = m · 2^e
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const be = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e;
  if (be === 0) e = -1074; else { m |= 1n << 52n; e = be - 1075; }
  return [hi >>> 31 ? -m : m, e];
}
function hpFrom(x, p) {
  if (x === 0) return 0n;
  const [m, e] = hpDecompose(x);
  const sh = e + p;
  return sh >= 0 ? m << BigInt(sh) : m >> BigInt(-sh);
}
const hpMul = (a, b, p) => (a * b) >> BigInt(p);
const hpDivRound = (a, b) => { const d = 2n * b; const n = 2n * a + b; let q = n / d; if ((n % d !== 0n) && ((n < 0n) !== (d < 0n))) q -= 1n; return q; };

function hpLdexp(x, e) {
  while (e > 1000) { x *= 2 ** 1000; e -= 1000; }
  while (e < -1000) { x *= 2 ** -1000; e += 1000; }
  return x * 2 ** e;
}
// a · 2^e2 → ближайший double (округление к чётному)
function hpToDouble(a, e2) {
  if (a === 0n) return 0;
  const neg = a < 0n;
  if (neg) a = -a;
  let shift = bitLen(a) - 53;
  if (e2 + shift < -1074) shift = -1074 - e2;
  let q;
  if (shift > 0) {
    const s = BigInt(shift);
    q = a >> s;
    const rem = a - (q << s), half = 1n << (s - 1n);
    if (rem > half || (rem === half && (q & 1n))) q += 1n;
  } else q = a << BigInt(-shift);
  const r = hpLdexp(Number(q), e2 + shift);
  return neg ? -r : r;
}

function hpAtanhSeries(z, p) {
  const z2 = hpMul(z, z, p);
  let term = z, sum = z, n = 1n;
  for (;;) {
    term = hpMul(term, z2, p);
    n += 2n;
    const add = term / n;
    if (add === 0n) break;
    sum += add;
  }
  return sum;
}
function hpLn2(p) {
  if (!hpCache.ln2.has(p)) hpCache.ln2.set(p, 2n * hpAtanhSeries((1n << BigInt(p)) / 3n, p));
  return hpCache.ln2.get(p);
}
function hpAtanInv(n, p) {  // atan(1/n)
  const N = BigInt(n), N2 = N * N;
  let power = (1n << BigInt(p)) / N, sum = power, k = 1n, sign = -1n;
  for (;;) {
    power /= N2;
    k += 2n;
    const t = power / k;
    if (t === 0n) break;
    sum += sign * t;
    sign = -sign;
  }
  return sum;
}
function hpPi(p) {
  if (!hpCache.pi.has(p)) {
    const g = p + 16;
    const pi = 16n * hpAtanInv(5, g) - 4n * hpAtanInv(239, g);
    hpCache.pi.set(p, pi >> 16n);
  }
  return hpCache.pi.get(p);
}

// ln(x) для конечного x > 0, результат — фиксированная точка (масштаб 2^p)
function hpLnFixed(x, p) {
  const [m, e] = hpDecompose(x);
  const L = bitLen(m);
  const ONE = 1n << BigInt(p);
  let f = (m << BigInt(p)) >> BigInt(L);   // f ∈ [0.5, 1)
  let k = e + L;
  if (f < (3n * ONE) / 4n) { f <<= 1n; k -= 1; }
  const z = ((f - ONE) << BigInt(p)) / (f + ONE);
  return 2n * hpAtanhSeries(z, p) + BigInt(k) * hpLn2(p);
}
function hpLog(x) {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  if (x === 1) return 0;
  return hpToDouble(hpLnFixed(x, HP_BITS), -HP_BITS);
}

// exp(t) для t в фиксированной точке → double
function hpExpToDouble(t, p) {
  const LN2 = hpLn2(p);
  const k = hpDivRound(t, LN2);
  const r = t - k * LN2;
  const ONE = 1n << BigInt(p);
  let term = ONE, sum = ONE, n = 1n;
  for (;;) {
    term = hpMul(term, r, p) / n;
    n += 1n;
    if (term === 0n) break;
    sum += term;
  }
  return hpToDouble(sum, Number(k) - p);
}
function hpPow(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0 || x === 1) return Math.pow(x, y);
  let ax = x, neg = false;
  if (x < 0) { ax = -x; neg = Number.isInteger(y) && Math.abs(y) % 2 === 1; }
  const p = HP_BITS;
  const t = hpMul(hpFrom(y, p), hpLnFixed(ax, p), p);
  const tApprox = Number(t >> BigInt(p - 24)) / 16777216;
  let r;
  if (tApprox > 710) r = Infinity;
  else if (tApprox < -746) r = 0;
  else r = hpExpToDouble(t, p);
  return neg ? -r : r;
}

// sin/cos/tan: приведение аргумента по модулю π/2 с запасом разрядов для больших |x|
function hpTrig(x) {
  const [m, e] = hpDecompose(x);
  const mag = bitLen(m < 0n ? -m : m) + e;
  const p = HP_BITS + Math.max(0, mag + 4);
  const X = hpFrom(x, p);
  const halfPi = hpPi(p) >> 1n;
  const k = hpDivRound(X, halfPi);
  const r = X - k * halfPi;
  const ONE = 1n << BigInt(p);
  const r2 = hpMul(r, r, p);
  let term = r, sinr = r, n = 1n;
  for (;;) {
    term = -hpMul(term, r2, p) / ((n + 1n) * (n + 2n));
    n += 2n;
    if (term === 0n) break;
    sinr += term;
  }
  term = ONE; let cosr = ONE; n = 0n;
  for (;;) {
    term = -hpMul(term, r2, p) / ((n + 1n) * (n + 2n));
    n += 2n;
    if (term === 0n) break;
    cosr += term;
  }
  const q = Number(((k % 4n) + 4n) % 4n);
  let s, c;
  if (q === 0) { s = sinr; c = cosr; }
  else if (q === 1) { s = cosr; c = -sinr; }
  else if (q === 2) { s = -sinr; c = -cosr; }
  else { s = -cosr; c = sinr; }
  return { s, c, p };
}
const SMALL = 2 ** -27;
function hpSin(x) {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) < SMALL) return x;
  const { s, p } = hpTrig(x);
  return hpToDouble(s, -p);
}
function hpCos(x) {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) < SMALL) return 1;
  const { c, p } = hpTrig(x);
  return hpToDouble(c, -p);
}
function hpTan(x) {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) < SMALL) return x;
  const { s, c, p } = hpTrig(x);
  return hpToDouble((s << BigInt(p)) / c, -p);
}
