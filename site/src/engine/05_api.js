// ---- синонимы и самопроверка реестра ----
for (const b of LANG.builtins) {
  if (!BUILTINS.has(b.name)) throw new Error('Не реализована встроенная функция: ' + b.name);
  for (const a of b.aliases || []) BUILTINS.set(a, BUILTINS.get(b.name));
}
for (const b of LANG.builtins) {
  const have = BUILTINS.get(b.name).kw;
  if (JSON.stringify(have || []) !== JSON.stringify(b.kw || [])) throw new Error('Имена параметров не совпадают с Python: ' + b.name);
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

return {
  version: LANG.version,
  run: runProgram,
  check: checkProgram,
  translateError: translateErrorDict,
  formatError,
  builtinNames: Array.from(BUILTINS.keys()),
  keywordNames: Array.from(KEYWORDS),
};
