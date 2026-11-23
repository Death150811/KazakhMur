// Проверка публичного API JS-движка, которого нет в Python: tokens, tree, trace, translateError, check(lang).
// Не требует браузера: запускается в Node после `python scripts/build_site.py`.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createQazaqEngine } = require(path.join(__dirname, '..', 'dist', 'engine.js'));
const LANG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist', 'language.json'), 'utf-8'));
const q = createQazaqEngine(LANG);

// ---- tokens ----
{
  const r = q.tokens('жаз(2 + 3).');
  assert.strictEqual(r.error, null);
  assert.deepStrictEqual(r.tokens.map((t) => t.kind), ['NAME', 'OP', 'INT', 'OP', 'INT', 'OP', 'END', 'NL', 'EOF']);
  assert.deepStrictEqual(r.tokens.slice(0, 7).map((t) => t.value), ['жаз', '(', '2', '+', '3', ')', '.']);
  assert.deepStrictEqual([r.tokens[0].line, r.tokens[0].col, r.tokens[2].col], [1, 1, 5]);
  assert.strictEqual(q.tokens('x = 2.0.').tokens.find((t) => t.kind === 'FLOAT').value, '2.0');   // как печатает Python
  assert.strictEqual(q.tokens('жаз(1.').error.type, 'LexicalError');
  const blocks = q.tokens('егер а:\n    б.\n').tokens.map((t) => t.kind);
  assert.ok(blocks.includes('INDENT') && blocks.includes('DEDENT'));
}

// ---- tree ----
{
  const r = q.tree('жаз(2 + 3).');
  assert.strictEqual(r.error, null);
  const stmt = r.ast.body[0];
  assert.strictEqual(stmt.t, 'ExprStmt');
  assert.strictEqual(stmt.expr.t, 'Call');
  assert.strictEqual(stmt.expr.args[0].t, 'Binary');
  assert.strictEqual(stmt.expr.args[0].left.value, '2');   // BigInt → строка, чтобы дерево сериализовалось в JSON
  assert.doesNotThrow(() => JSON.stringify(r));
  const bad = q.tree('жаз(2 +).');
  assert.strictEqual(bad.ast, null);
  assert.match(bad.error.message, /Ожидалось выражение/);
  assert.strictEqual(q.tree('x = *[1].').error !== null, true);
}

// ---- trace ----
{
  const code = 'функ ф(n):\n    айным к = n * 2.\n    қайтар к.\nайным а = 1.\nәрбір i ішінде аралық(2):\n    а += ф(i).\n    жаз(а).\n';
  const r = q.trace(code);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.stdout, '1\n3\n');
  assert.strictEqual(r.truncated, false);
  const last = r.steps[r.steps.length - 1];
  assert.strictEqual(last.end, true);
  assert.strictEqual(last.line, null);
  assert.deepStrictEqual(last.globals.find(([k]) => k === 'а'), ['а', '3']);
  assert.ok(!last.globals.some(([k]) => k === 'ф'), 'функции не показываются в таблице переменных');
  const inside = r.steps.find((s) => s.frames.length === 1);
  assert.deepStrictEqual(inside.frames, ['ф']);
  assert.ok(inside.locals.some(([k]) => k === 'n'));
  assert.strictEqual(r.steps[0].line, 1);
  // вывод к шагу растёт монотонно и в конце равен всему выводу
  for (let i = 1; i < r.steps.length; i++) assert.ok(r.steps[i].out >= r.steps[i - 1].out);
  assert.strictEqual(last.out, r.stdout.length);

  const cut = q.trace('айным i = 0.\nәзір ақиқат:\n    i += 1.\n', { maxTraceSteps: 25, maxSteps: 100000 });
  assert.strictEqual(cut.truncated, true);
  assert.strictEqual(cut.steps.length, 25);

  const err = q.trace('жаз(1).\nжаз(1 / 0).\n');
  assert.strictEqual(err.status, 'error');
  assert.match(err.error.message, /деление на ноль/);
  assert.strictEqual(err.stdout, '1\n');
  const kk = q.trace('жаз(1 / 0).', { lang: 'kk' });
  assert.match(kk.error.message, /нөлге бөлуге болмайды/);

  const big = q.trace('айным а = аралық(1000).\nайным с = жиын(а).\n');
  const bigLast = big.steps[big.steps.length - 1];
  assert.match(bigLast.globals.find(([k]) => k === 'а')[1], /^аралық/);
  assert.match(bigLast.globals.find(([k]) => k === 'с')[1], /^жиын\[1000\]|^жиын\(\[/);
}

// ---- перевод ошибок ----
{
  const e = q.run('жаз(1 / 0).').error;
  assert.strictEqual(e.title, 'Ошибка выполнения');
  const t = q.translateError(e, 'kk');
  assert.strictEqual(t.title, 'Орындау қатесі');
  assert.strictEqual(t.message, 'Нөлге бөлу: нөлге бөлуге болмайды');
  assert.strictEqual(q.translateError(e, 'ru'), e);
  assert.strictEqual(q.translateError(null, 'kk'), null);
  assert.strictEqual(q.check('жаз(1 +).', 'kk').title, 'Синтаксистік қате');
  assert.strictEqual(q.check('жаз(1).'), null);
  // программа внутри байқа видит русский текст независимо от языка показа
  assert.strictEqual(q.run('байқа:\n    жаз(1 / 0).\nқате е:\n    жаз(е).\n', { lang: 'kk' }).stdout, 'Нөлге бөлу: деление на ноль\n');
}
console.log('ENGINE API OK');
