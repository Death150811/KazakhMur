// ---- синонимы и самопроверка реестра ----
for (const b of LANG.builtins) {
  if (!BUILTINS.has(b.name)) throw new Error('Не реализована встроенная функция: ' + b.name);
  for (const a of b.aliases || []) BUILTINS.set(a, BUILTINS.get(b.name));
}
for (const b of LANG.builtins) {
  const have = BUILTINS.get(b.name).kw;
  if (JSON.stringify(have || []) !== JSON.stringify(b.kw || [])) throw new Error('Имена параметров не совпадают с Python: ' + b.name);
  if (JSON.stringify(BUILTINS.get(b.name).kwonly || []) !== JSON.stringify(b.kwonly || [])) throw new Error('Параметры только по имени не совпадают с Python: ' + b.name);
}
for (const m of LANG.methods) {
  if (!Object.values(METHODS).some((t) => m in t)) throw new Error('Не реализован метод: ' + m);
}

// ===================================================================
// Публичный интерфейс движка
// ===================================================================
function errorToDict(e) {
  const d = e.toDict();
  d.trace = e.trace.slice(0, 10).map(([name, line]) => ({ function: name, line }));
  return d;
}

function runProgram(source, opts = {}) {
  const out = [];
  const interp = new Interpreter({
    stdout: (s) => out.push(s),
    stdin: opts.stdin || '',
    limits: {
      maxSteps: opts.maxSteps ?? 3000000,
      maxDepth: opts.maxDepth ?? 200,
      timeout: opts.timeout ?? 3,
      maxOutput: opts.maxOutput ?? 65536,
    },
  });
  let status = 'ok', error = null;
  try { interp.runSource(source); }
  catch (e) {
    if (e instanceof ResourceLimitError) { status = 'limit'; error = errorToDict(e); }
    else if (e instanceof QazaqError) { status = 'error'; error = errorToDict(e); }
    else if (isStackOverflow(e)) {
      status = 'error';
      error = { type: 'QazaqRuntimeError', title: QazaqRuntimeError.prototype.title,
                message: 'Слишком глубокая вложенность выражений или вызовов', line: null, column: null,
                hint: 'Проверьте условие выхода из рекурсии или упростите вложенность.', trace: [] };
    } else {
      status = 'error';
      error = { type: 'InternalError', title: 'Внутренняя ошибка', message: String(e && e.message || e),
                line: null, column: null, hint: null, trace: [] };
    }
  }
  if (opts.lang === 'kk') error = translateErrorDict(error, 'kk');
  return { status, stdout: out.join(''), error, steps: interp.steps };
}

function checkProgram(source, lang = 'ru') {
  try { parse(source); return null; }
  catch (e) {
    if (e instanceof QazaqError) return translateErrorDict(errorToDict(e), lang);
    if (isStackOverflow(e)) return translateErrorDict({ title: 'Синтаксическая ошибка', message: 'Слишком глубокая вложенность', line: null, column: null, hint: null, trace: [] }, lang);
    throw e;
  }
}

// ---- для «лаборатории» сайта: токены и дерево разбора ----
function tokensOf(source) {
  try {
    const toks = new Lexer(source, { square: null }).tokenize();
    return { tokens: toks.map((t) => ({ kind: t.kind, value: t.kind === T.FLOAT ? floatRepr(t.value) : String(t.value), line: t.line, col: t.col, endLine: t.endLine, endCol: t.endCol })), error: null };
  } catch (e) {
    if (e instanceof QazaqError) return { tokens: [], error: errorToDict(e) };
    throw e;
  }
}
function treeOf(source) {
  try {
    const ast = parse(source);
    // BigInt не сериализуется: числа превращаем в строки, остальное оставляем
    return { ast: JSON.parse(JSON.stringify(ast, (k, v) => (typeof v === 'bigint' ? v.toString() : v))), error: null };
  } catch (e) {
    if (e instanceof QazaqError) return { ast: null, error: errorToDict(e) };
    if (isStackOverflow(e)) return { ast: null, error: { title: 'Синтаксическая ошибка', message: 'Слишком глубокая вложенность', line: null, column: null, hint: null, trace: [] } };
    throw e;
  }
}

// ---- режим «по шагам»: запись состояния перед каждой инструкцией (для вкладки «Шаги» сайта) ----
class TraceFull extends Error {}
function briefValue(v) {
  if (Array.isArray(v) && v.length > 40) return `тізім[${v.length}] ` + toRepr(v.slice(0, 6)).slice(0, -1) + ', …]';
  if (v instanceof QTuple && v.items.length > 40) return `кортеж[${v.items.length}] ` + toRepr(new QTuple(v.items.slice(0, 6))).slice(0, -1) + ', …)';
  if (v instanceof QDict && v.size > 40) return `сөздік[${v.size}]`;
  if (v instanceof QRange) return toRepr(v);
  const s = typeof v === 'string' && v.length > 200 ? toRepr(v.slice(0, 200)) : toRepr(v);
  return s.length > 90 ? s.slice(0, 88) + '…' : s;
}
function visibleVars(map) {
  const out = [];
  for (const [k, v] of map) {
    if (v instanceof QFunction || v instanceof QClass || v instanceof Builtin) continue;
    out.push([k, briefValue(v)]);
  }
  return out;
}
function traceProgram(source, opts = {}) {
  const out = [];
  let outLen = 0;
  const steps = [];
  const MAX = opts.maxTraceSteps ?? 2000;
  const interp = new Interpreter({
    stdout: (s) => { out.push(s); outLen += s.length; },
    stdin: opts.stdin || '',
    limits: { maxSteps: opts.maxSteps ?? 400000, maxDepth: opts.maxDepth ?? 200, timeout: opts.timeout ?? 3, maxOutput: opts.maxOutput ?? 65536 },
  });
  const capture = (line, env) => {
    const locals = new Map();
    if (env) for (let e = env; e !== null && e !== interp.globals && e !== interp.builtinEnv; e = e.parent)
      for (const [k, v] of e.vars) if (!locals.has(k)) locals.set(k, v);
    return { line, out: outLen, frames: interp.frames.map((f) => f.name), locals: visibleVars(locals), globals: visibleVars(interp.globals.vars) };
  };
  interp.onStep = (node, env) => {
    if (steps.length >= MAX) throw new TraceFull();
    steps.push(capture(node.line, env));
  };
  let status = 'ok', error = null, truncated = false;
  try { interp.runSource(source); }
  catch (e) {
    if (e instanceof TraceFull) truncated = true;
    else if (e instanceof ResourceLimitError) { status = 'limit'; error = errorToDict(e); }
    else if (e instanceof QazaqError) { status = 'error'; error = errorToDict(e); }
    else if (isStackOverflow(e)) { status = 'error'; error = { title: QazaqRuntimeError.prototype.title, message: 'Слишком глубокая вложенность выражений или вызовов', line: null, column: null, hint: null, trace: [] }; }
    else throw e;
  }
  if (!truncated) { interp.onStep = null; steps.push({ ...capture(null, null), end: true }); }
  if (opts.lang === 'kk') error = translateErrorDict(error, 'kk');
  return { steps, stdout: out.join(''), status, error, truncated };
}

return {
  version: LANG.version,
  trace: traceProgram,
  tokens: tokensOf,
  tree: treeOf,
  run: runProgram,
  check: checkProgram,
  translateError: translateErrorDict,
  formatError,
  builtinNames: Array.from(BUILTINS.keys()),
  keywordNames: Array.from(KEYWORDS),
};
