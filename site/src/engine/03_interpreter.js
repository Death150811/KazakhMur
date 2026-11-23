// ===================================================================
// Интерпретатор
// ===================================================================
const MAX_SEQ_RESULT = 10000000;
const MAX_INT_BITS = 300000;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

class ReturnSignal { constructor(value) { this.value = value; } }
class BreakSignal {}
class ContinueSignal {}
class ZeroDivision extends Error {}
class OverflowErr extends Error {}

const rtError = (msg, hint = null) => new QazaqRuntimeError(msg, null, null, hint);
const isStackOverflow = (e) => e instanceof RangeError && /call stack/i.test(e.message);

class Interpreter {
  constructor(opts = {}) {
    this.stdout = opts.stdout || (() => {});
    this.stdinLines = opts.stdin ? String(opts.stdin).replace(/\r\n/g, '\n').split('\n') : [];
    if (this.stdinLines.length && this.stdinLines[this.stdinLines.length - 1] === '') this.stdinLines.pop();
    this.limits = { maxSteps: null, maxDepth: 200, timeout: null, maxOutput: null, ...(opts.limits || {}) };
    this.safe = true;
    this.steps = 0;
    this.depth = 0;
    this.outChars = 0;
    this.deadline = null;
    this.echo = false;
    this.rng = new PyRandom();
    this.builtinEnv = new Env(null, true);
    for (const [name, b] of BUILTINS) this.builtinEnv.vars.set(name, b);
    for (const [name, v] of Object.entries(CONSTANTS)) this.builtinEnv.vars.set(name, v);
    this.globals = new Env(this.builtinEnv);
    this.onStep = null;   // функция (инструкция, окружение): вызывается перед каждой инструкцией (режим «по шагам»)
    this.frames = [];     // имена активных функций (заполняется только при onStep)
  }

  // ---- публичное ----
  runSource(source, echo = false) { return this.run(parse(source), echo); }

  run(program, echo = false) {
    this.steps = 0;
    this.depth = 0;
    this.echo = echo;
    if (this.limits.timeout !== null) this.deadline = now() + this.limits.timeout * 1000;
    try {
      for (const stmt of program.body) this.runStmt(stmt, this.globals);
    } catch (e) {
      if (e instanceof ReturnSignal || e instanceof BreakSignal || e instanceof ContinueSignal)
        throw new QazaqRuntimeError('Недопустимое использование управляющей инструкции');
      if (isStackOverflow(e)) throw new QazaqRuntimeError('Слишком глубокая вложенность выражений или вызовов', null, null, 'Проверьте условие выхода из рекурсии или упростите вложенность.');
      throw e;
    }
  }

  write(text) {
    this.outChars += strLen(text);
    if (this.limits.maxOutput !== null && this.outChars > this.limits.maxOutput)
      throw new ResourceLimitError(`Превышен лимит вывода (${this.limits.maxOutput} символов)`);
    this.stdout(text);
  }
  readLine() { return this.stdinLines.length ? this.stdinLines.shift() : null; }

  tick() {
    this.steps++;
    const lim = this.limits;
    if (lim.maxSteps !== null && this.steps > lim.maxSteps)
      throw new ResourceLimitError(`Превышен лимит шагов исполнения (${lim.maxSteps}). Возможно, бесконечный цикл.`);
    if (this.deadline !== null && (this.steps & 255) === 0 && now() > this.deadline)
      throw new ResourceLimitError(`Превышено время исполнения (${lim.timeout} с). Возможно, бесконечный цикл.`);
  }

  static locate(exc, node) { if (exc.line === null) { exc.line = node.line; exc.col = node.col; } }

  // ---- инструкции ----
  runStmt(node, env) {
    this.tick();
    if (this.onStep !== null) this.onStep(node, env);
    try {
      switch (node.t) {
        case 'VarDecl': env.declare(node.name, this.evaluate(node.value, env)); return;
        case 'VarDeclMulti': {
          const values = this.unpack(this.evaluate(node.value, env), node.names.length);
          node.names.forEach((n, i) => env.declare(n, values[i]));
          return;
        }
        case 'Assign': this.xAssign(node, env); return;
        case 'ExprStmt': this.xExpr(node, env); return;
        case 'If': this.xIf(node, env); return;
        case 'While': this.xWhile(node, env); return;
        case 'For': this.xFor(node, env); return;
        case 'FuncDef': env.declare(node.name, new QFunction(node.name, node.params, node.body, env)); return;
        case 'ClassDef': this.xClassdef(node, env); return;
        case 'Return': throw new ReturnSignal(node.value === null ? null : this.evaluate(node.value, env));
        case 'Break': throw new BreakSignal();
        case 'Continue': throw new ContinueSignal();
        case 'Pass': return;
        case 'Raise': throw new QazaqRuntimeError(toStr(this.evaluate(node.value, env)));
        case 'Try': this.xTry(node, env); return;
        default: throw new Error('unknown statement ' + node.t);
      }
    } catch (exc) {
      if (exc instanceof QazaqError) Interpreter.locate(exc, node);
      throw exc;
    }
  }

  runBlock(stmts, env) { for (let i = 0; i < stmts.length; i++) this.runStmt(stmts[i], env); }

  undeclared(target) {
    let hint = `Сначала объявите переменную: айным ${target.name} = ….`;
    const near = suggest(target.name, this.globals.visibleNames());
    if (near) hint = `Возможно, вы имели в виду «${near}». ` + hint;
    throw rtError(`Переменная «${target.name}» не объявлена`, hint);
  }

  unpack(value, count) {
    let items;
    if (Array.isArray(value)) items = value.slice();
    else if (value instanceof QTuple) items = value.items.slice();
    else if (typeof value === 'string') items = strChars(value);
    else if (value instanceof QRange) {
      if (value.length > BigInt(count) + 1n) items = new Array(Number(value.length > 1000000n ? 1000000n : value.length)).fill(0);
      else items = asList('unpack', value);
    }
    else throw rtError(`Нельзя разложить значение типа ${typeName(value)}`, 'Раскладывать можно тізім, кортеж, мәтін и аралық.');
    if (items.length !== count)
      throw rtError(`Нельзя разложить значение ${toRepr(value)}: ожидалось элементов ${count}, найдено ${value instanceof QRange ? value.length : items.length}`);
    return items;
  }

  store(target, value, env) {
    if (target.t === 'Name') { if (!env.assign(target.name, value)) this.undeclared(target); }
    else if (target.t === 'Index') this.setIndex(this.evaluate(target.obj, env), this.evaluate(target.index, env), value);
    else {
      const obj = this.evaluate(target.obj, env);
      if (!(obj instanceof QInstance))
        throw rtError(`Поля можно менять только у объектов классов, а не у значения типа ${typeName(obj)}`);
      obj.fields.set(target.name, value);
    }
  }

  xAssign(node, env) {
    const target = node.target;
    if (target.t === 'TargetList') {
      const values = this.unpack(this.evaluate(node.value, env), target.items.length);
      target.items.forEach((t, i) => this.store(t, values[i], env));
      return;
    }
    if (target.t === 'Name') {
      let value = this.evaluate(node.value, env);
      if (node.op !== '=') {
        const current = env.lookup(target.name);
        if (current === undefined) this.undeclared(target);
        value = this.binop(node.op[0], current, value);
      }
      if (!env.assign(target.name, value)) this.undeclared(target);
    } else if (target.t === 'Index') {
      const obj = this.evaluate(target.obj, env);
      const idx = this.evaluate(target.index, env);
      let value = this.evaluate(node.value, env);
      if (node.op !== '=') value = this.binop(node.op[0], this.getIndex(obj, idx), value);
      this.setIndex(obj, idx, value);
    } else {
      const obj = this.evaluate(target.obj, env);
      let value = this.evaluate(node.value, env);
      if (node.op !== '=') value = this.binop(node.op[0], this.getAttr(obj, target.name), value);
      if (!(obj instanceof QInstance))
        throw rtError(`Поля можно менять только у объектов классов, а не у значения типа ${typeName(obj)}`);
      obj.fields.set(target.name, value);
    }
  }

  xExpr(node, env) {
    const value = this.evaluate(node.expr, env);
    if (node.mode === '?') this.write(`${node.text} → ${toRepr(value)}\n`);
    else if (node.mode === '!') {
      if (!truthy(value)) throw rtError(`Утверждение не выполнено: ${node.text}`, `Значение выражения: ${toRepr(value)}`);
    } else if (this.echo && env === this.globals && value !== null) this.write(toRepr(value) + '\n');
  }

  ePipe(node, env) {
    const left = this.evaluate(node.left, env);
    const right = node.right;
    if (right.t === 'Call') {
      const fn = this.evaluate(right.func, env);
      const args = [...right.args.map((a) => this.evaluate(a, env)), left];
      let kwargs = null;
      if (right.kwargs.length) { kwargs = new Map(); for (const [n, e] of right.kwargs) kwargs.set(n, this.evaluate(e, env)); }
      return this.callValue(fn, args, node.line, kwargs);
    }
    return this.callValue(this.evaluate(right, env), [left], node.line);
  }

  runComp(clauses, idx, env, emit) {
    if (idx === clauses.length) { emit(); return; }
    const clause = clauses[idx];
    if (clause[0] === 'if') {
      if (truthy(this.evaluate(clause[1], env))) this.runComp(clauses, idx + 1, env, emit);
      return;
    }
    const [, targets, iterNode] = clause;
    let iterable = this.evaluate(iterNode, env);
    if (iterable instanceof QDict) iterable = iterable.keys();
    else if (iterable instanceof QTuple) iterable = iterable.items;
    else if (!(Array.isArray(iterable) || typeof iterable === 'string' || iterable instanceof QRange))
      throw rtError(`Нельзя перебирать значение типа ${typeName(iterable)}`, 'Перебирать можно тізім, кортеж, мәтін, сөздік и аралық.');
    const each = (item) => {
      if (targets.length === 1) env.vars.set(targets[0], item);
      else this.unpack(item, targets.length).forEach((v, i) => env.vars.set(targets[i], v));
      this.tick();
      this.runComp(clauses, idx + 1, env, emit);
    };
    if (Array.isArray(iterable)) { for (let i = 0; i < iterable.length; i++) each(iterable[i]); }
    else if (typeof iterable === 'string') { for (const ch of iterable) each(ch); }
    else { const len = iterable.length; for (let i = 0n; i < len; i++) each(iterable.at(i)); }
  }

  eListComp(node, env) {
    const local = new Env(env), out = [];
    this.runComp(node.clauses, 0, local, () => out.push(this.evaluate(node.elt, local)));
    return out;
  }

  eDictComp(node, env) {
    const local = new Env(env), out = new QDict();
    this.runComp(node.clauses, 0, local, () => {
      const key = this.evaluate(node.key, local);
      try { out.set(key, this.evaluate(node.value, local)); }
      catch (e) { if (e instanceof Unhashable) throw rtError(`Ключом словаря не может быть значение типа ${typeName(key)}`); throw e; }
    });
    return out;
  }

  xIf(node, env) {
    for (const [cond, body] of node.branches) {
      if (truthy(this.evaluate(cond, env))) { this.runBlock(body, env); return; }
    }
    if (node.orelse !== null) this.runBlock(node.orelse, env);
  }

  xWhile(node, env) {
    while (truthy(this.evaluate(node.cond, env))) {
      try { this.runBlock(node.body, env); }
      catch (e) { if (e instanceof BreakSignal) break; if (!(e instanceof ContinueSignal)) throw e; }
      this.tick();
    }
  }

  xFor(node, env) {
    let iterable = this.evaluate(node.iterable, env);
    if (iterable instanceof QDict) iterable = iterable.keys();
    else if (iterable instanceof QTuple) iterable = iterable.items;
    else if (!(Array.isArray(iterable) || typeof iterable === 'string' || iterable instanceof QRange))
      throw rtError(`Нельзя перебирать значение типа ${typeName(iterable)}`, 'Перебирать можно тізім, кортеж, мәтін, сөздік и аралық.');
    const targets = node.targets;
    const step = (item) => {
      if (targets.length === 1) env.vars.set(targets[0], item);
      else {
        const vals = this.unpack(item, targets.length);
        for (let k = 0; k < targets.length; k++) env.vars.set(targets[k], vals[k]);
      }
      try { this.runBlock(node.body, env); }
      catch (e) { if (e instanceof BreakSignal) return true; if (!(e instanceof ContinueSignal)) throw e; }
      this.tick();
      return false;
    };
    if (Array.isArray(iterable)) { for (let i = 0; i < iterable.length; i++) if (step(iterable[i])) break; }
    else if (typeof iterable === 'string') { for (const ch of iterable) if (step(ch)) break; }
    else {
      const len = iterable.length;
      for (let i = 0n; i < len; i++) if (step(iterable.at(i))) break;
    }
  }

  xClassdef(node, env) {
    let base = null;
    if (node.base !== null) {
      base = this.evaluate(node.base, env);
      if (!(base instanceof QClass)) throw rtError(`Базовым классом может быть только сынып, а не ${typeName(base)}`);
    }
    const cls = new QClass(node.name, base);
    for (const stmt of node.body) {
      if (stmt.t === 'FuncDef') cls.members.set(stmt.name, new QFunction(stmt.name, stmt.params, stmt.body, env));
      else if (stmt.t === 'VarDecl') cls.members.set(stmt.name, this.evaluate(stmt.value, env));
    }
    env.declare(node.name, cls);
  }

  xTry(node, env) {
    try {
      try { this.runBlock(node.body, env); }
      catch (exc) {
        let e = exc;
        if (isStackOverflow(e)) e = new QazaqRuntimeError('Слишком глубокая вложенность выражений или вызовов', null, null, 'Проверьте условие выхода из рекурсии или упростите вложенность.');
        if (!(e instanceof QazaqError) || node.catchBody === null || !e.catchable) throw exc;
        const cenv = new Env(env);
        if (node.catchName) cenv.declare(node.catchName, e.message);
        this.runBlock(node.catchBody, cenv);
      }
    } finally {
      if (node.finalBody !== null) this.runBlock(node.finalBody, env);
    }
  }

  // ---- выражения ----
  evaluate(node, env) {
    try {
      switch (node.t) {
        case 'Literal': return node.value;
        case 'Name': return this.eName(node, env);
        case 'Binary': return this.binop(node.op, this.evaluate(node.left, env), this.evaluate(node.right, env));
        case 'Call': return this.eCall(node, env);
        case 'Compare': return this.eCompare(node, env);
        case 'Logical': {
          const left = this.evaluate(node.left, env);
          if (node.op === 'және') return truthy(left) ? this.evaluate(node.right, env) : left;
          return truthy(left) ? left : this.evaluate(node.right, env);
        }
        case 'Unary': return this.eUnary(node, env);
        case 'Index': return this.getIndex(this.evaluate(node.obj, env), this.evaluate(node.index, env));
        case 'Attr': return this.getAttr(this.evaluate(node.obj, env), node.name);
        case 'ListLit': return node.items.map((it) => this.evaluate(it, env));
        case 'DictLit': return this.eDict(node, env);
        case 'FString': return this.eFstring(node, env);
        case 'Slice': return this.eSlice(node, env);
        case 'TupleLit': return new QTuple(node.items.map((it) => this.evaluate(it, env)));
        case 'ListComp': return this.eListComp(node, env);
        case 'DictComp': return this.eDictComp(node, env);
        case 'Ternary': return truthy(this.evaluate(node.cond, env)) ? this.evaluate(node.then, env) : this.evaluate(node.orelse, env);
        case 'Pipe': return this.ePipe(node, env);
        case 'Lambda': return new QFunction('<лямбда>', node.params, [{ t: 'Return', line: node.body.line, col: node.body.col, value: node.body }], env);
        default: throw new Error('unknown expression ' + node.t);
      }
    } catch (exc) {
      if (exc instanceof QazaqError) Interpreter.locate(exc, node);
      throw exc;
    }
  }

  eName(node, env) {
    const v = env.lookup(node.name);
    if (v !== undefined) return v;
    const near = suggest(node.name, env.visibleNames());
    const hint = near ? `Возможно, вы имели в виду «${near}».` : `Объявите переменную: айным ${node.name} = ….`;
    throw rtError(`Имя «${node.name}» не определено`, hint);
  }

  eFstring(node, env) {
    let out = '';
    for (const part of node.parts) {
      if (typeof part === 'string') { out += part; continue; }
      const [expr, spec] = part;
      const value = this.evaluate(expr, env);
      if (spec) {
        try { out += formatValue(value, spec); }
        catch (e) {
          if (e instanceof FormatError || (e instanceof RangeError && !isStackOverflow(e)))
            throw new QazaqRuntimeError(`Формат «${spec}» не подходит для значения типа ${typeName(value)}`, node.line, node.col);
          throw e;
        }
      } else out += toStr(value);
    }
    return out;
  }

  eDict(node, env) {
    const result = new QDict();
    for (const [knode, vnode] of node.pairs) {
      const key = this.evaluate(knode, env);
      const value = this.evaluate(vnode, env);
      try { result.set(key, value); }
      catch (e) {
        if (e instanceof Unhashable)
          throw new QazaqRuntimeError(`Ключом словаря не может быть значение типа ${typeName(key)}`, knode.line, knode.col);
        throw e;
      }
    }
    return result;
  }

  eUnary(node, env) {
    const v = this.evaluate(node.operand, env);
    if (node.op === 'емес') return !truthy(v);
    if (!isNum(v)) throw rtError(`Унарный «${node.op}» не применим к значению типа ${typeName(v)}`);
    if (node.op === '-') return typeof v === 'number' ? -v : -big(v);
    return typeof v === 'number' ? v : big(v);
  }

  eCompare(node, env) {
    let left = this.evaluate(node.left, env);
    for (const [op, rnode] of node.ops) {
      const right = this.evaluate(rnode, env);
      if (!this.compare(op, left, right)) return false;
      left = right;
    }
    return true;
  }

  // ---- арифметика ----
  binop(op, a, b) {
    try { return this._binop(op, a, b); }
    catch (e) {
      if (e instanceof ZeroDivision)
        throw rtError(op === '/' || op === '%' || op === '//' ? 'Нөлге бөлу: деление на ноль' : 'Нуль в отрицательной степени',
                      'Проверьте делитель перед делением.');
      if (e instanceof OverflowErr || (e instanceof RangeError && !isStackOverflow(e)))
        throw rtError('Результат слишком велик для вычисления');
      throw e;
    }
  }

  _binop(op, a, b) {
    const aNum = isNum(a), bNum = isNum(b);
    switch (op) {
      case '+':
        if (aNum && bNum) return numAdd(a, b);
        if (typeof a === 'string' && typeof b === 'string') return a + b;
        if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
        if (a instanceof QTuple && b instanceof QTuple) return new QTuple(a.items.concat(b.items));
        break;
      case '-':
        if (aNum && bNum) return numSub(a, b);
        break;
      case '*': {
        if (aNum && bNum) return numMul(a, b);
        const isSeq = (v) => typeof v === 'string' || Array.isArray(v) || v instanceof QTuple;
        const [seq0, n] = isSeq(a) ? [a, b] : [b, a];
        if (isSeq(seq0) && typeof n === 'bigint') {
          const isTuple = seq0 instanceof QTuple;
          const seq = isTuple ? seq0.items : seq0;
          const k = n;
          const len = typeof seq === 'string' ? strLen(seq) : seq.length;
          if (BigInt(len) * (k > 0n ? k : 0n) > BigInt(MAX_SEQ_RESULT)) throw rtError('Результат повторения слишком велик');
          const times = Number(k > 0n ? k : 0n);
          if (len === 0 || times === 0) return typeof seq === 'string' ? '' : isTuple ? new QTuple([]) : [];
          if (typeof seq === 'string') return seq.repeat(times);
          const out = [];
          for (let i = 0; i < times; i++) for (let j = 0; j < seq.length; j++) out.push(seq[j]);
          return isTuple ? new QTuple(out) : out;
        }
        break;
      }
      case '/': if (aNum && bNum) return numTrueDiv(a, b); break;
      case '//': if (aNum && bNum) return numFloorDiv(a, b); break;
      case '%': if (aNum && bNum) return numMod(a, b); break;
      case '**': if (aNum && bNum) return numPow(a, b); break;
      default: throw rtError(`Неизвестная операция ${op}`);
    }
    let hint = null;
    if (op === '+' && ((typeof a === 'string') !== (typeof b === 'string')))
      hint = 'Чтобы склеить строку с числом, используйте мәтін(…) или ф"…{x}…".';
    throw rtError(`Операция «${op}» не применима к типам ${typeName(a)} и ${typeName(b)}`, hint);
  }

  compare(op, a, b) {
    switch (op) {
      case '==': return valuesEqual(a, b);
      case '!=': return !valuesEqual(a, b);
      case 'ішінде': case 'емес ішінде': {
        let found;
        if (typeof b === 'string') {
          if (typeof a !== 'string') throw rtError(`В строке можно искать только строку, а не ${typeName(a)}`);
          found = b.includes(a);
        } else if (Array.isArray(b)) found = b.some((x) => valuesEqual(x, a));
        else if (b instanceof QTuple) found = b.items.some((x) => valuesEqual(x, a));
        else if (b instanceof QDict) {
          try { found = b.has(a); }
          catch (e) {
            if (e instanceof Unhashable) throw rtError(`Нельзя сравнить ${typeName(a)} и ${typeName(b)} оператором «${op}»`);
            throw e;
          }
        } else if (b instanceof QRange) found = rangeHas(b, a);
        else throw rtError(`Оператор «ішінде» не применим к типу ${typeName(b)}`,
                           'Правая часть должна быть мәтін, тізім, кортеж, сөздік или аралық.');
        return found === (op === 'ішінде');
      }
    }
    let c;
    try { c = compareValues(a, b); }
    catch (e) {
      if (e instanceof Unordered) throw rtError(`Нельзя сравнить ${typeName(a)} и ${typeName(b)} оператором «${op}»`);
      throw e;
    }
    if (c === null) return false;
    switch (op) {
      case '<': return c < 0;
      case '<=': return c <= 0;
      case '>': return c > 0;
      case '>=': return c >= 0;
    }
    throw rtError(`Неизвестное сравнение ${op}`);
  }

  // ---- индексы, срезы, поля ----
  getIndex(obj, idx) {
    if (obj instanceof QTuple) return this.getIndex(obj.items, idx);
    if (Array.isArray(obj) || typeof obj === 'string' || obj instanceof QRange) {
      if (!isInt(idx) || typeof idx === 'boolean') throw rtError(`Индекс должен быть бүтін (целым), а не ${typeName(idx)}`);
      let i = big(idx);
      const len = obj instanceof QRange ? obj.length : BigInt(typeof obj === 'string' ? strLen(obj) : obj.length);
      if (i < 0n) i += len;
      if (i < 0n || i >= len)
        throw rtError(`Индекс ${idx} вне диапазона (длина ${len})`, 'Индексы начинаются с 0; отрицательные считаются с конца.');
      if (Array.isArray(obj)) return obj[Number(i)];
      if (obj instanceof QRange) return obj.at(i);
      return hasAstral(obj) ? strChars(obj)[Number(i)] : obj[Number(i)];
    }
    if (obj instanceof QDict) {
      let v;
      try { v = obj.get(idx); }
      catch (e) { if (e instanceof Unhashable) throw rtError(`Ключом не может быть значение типа ${typeName(idx)}`); throw e; }
      if (v === undefined) throw rtError(`Ключ не найден: ${toRepr(idx)}`, 'Проверьте ключ через «ішінде» или метод .ал(ключ).');
      return v;
    }
    throw rtError(`Значение типа ${typeName(obj)} не поддерживает индексацию []`);
  }

  setIndex(obj, idx, value) {
    if (Array.isArray(obj)) {
      if (!isInt(idx) || typeof idx === 'boolean') throw rtError(`Индекс должен быть бүтін (целым), а не ${typeName(idx)}`);
      let i = big(idx);
      const len = BigInt(obj.length);
      if (i < 0n) i += len;
      if (i < 0n || i >= len) throw rtError(`Индекс ${idx} вне диапазона (длина ${len})`);
      obj[Number(i)] = value;
    } else if (obj instanceof QDict) {
      try { obj.set(idx, value); }
      catch (e) { if (e instanceof Unhashable) throw rtError(`Ключом не может быть значение типа ${typeName(idx)}`); throw e; }
    } else throw rtError(`Элементы значения типа ${typeName(obj)} нельзя менять присваиванием`);
  }

  eSlice(node, env) {
    const obj = this.evaluate(node.obj, env);
    const parts = [];
    for (const sub of [node.lo, node.hi, node.step]) {
      const v = sub === null ? null : this.evaluate(sub, env);
      if (v !== null && (!isInt(v) || typeof v === 'boolean')) throw rtError(`Границы среза должны быть бүтін, а не ${typeName(v)}`);
      parts.push(v === null ? null : big(v));
    }
    if (obj instanceof QTuple) {
      if (parts[2] === 0n) throw rtError('Шаг среза не может быть нулём');
      const [lo0, hi0, st0] = parts;
      const [s0, e0, step0] = sliceIndices(BigInt(obj.items.length), lo0, hi0, st0);
      const res = [];
      if (step0 > 0n) for (let i = s0; i < e0; i += step0) res.push(obj.items[Number(i)]);
      else for (let i = s0; i > e0; i += step0) res.push(obj.items[Number(i)]);
      return new QTuple(res);
    }
    if (!(Array.isArray(obj) || typeof obj === 'string' || obj instanceof QRange))
      throw rtError(`Значение типа ${typeName(obj)} не поддерживает срезы`);
    if (parts[2] === 0n) throw rtError('Шаг среза не может быть нулём');
    const [lo, hi, step] = parts;
    if (obj instanceof QRange) {
      const [s, e, st] = sliceIndices(obj.length, lo, hi, step);
      return new QRange(obj.start + s * obj.step, obj.start + e * obj.step, obj.step * st);
    }
    const arr = Array.isArray(obj) ? obj : strChars(obj);
    const [s, e, st] = sliceIndices(BigInt(arr.length), lo, hi, step);
    const out = [];
    if (st > 0n) for (let i = s; i < e; i += st) out.push(arr[Number(i)]);
    else for (let i = s; i > e; i += st) out.push(arr[Number(i)]);
    return Array.isArray(obj) ? out : out.join('');
  }

  getAttr(obj, name) {
    if (obj instanceof QInstance) {
      if (obj.fields.has(name)) return obj.fields.get(name);
      const member = obj.cls.find(name);
      if (member === undefined) {
        const near = suggest(name, [...obj.fields.keys(), ...classNames(obj.cls)]);
        throw rtError(`У объекта класса «${obj.cls.name}» нет поля или метода «${name}»`,
                      near ? `Возможно, вы имели в виду «${near}».` : null);
      }
      return member instanceof QFunction ? new BoundMethod(member, obj) : member;
    }
    if (obj instanceof QClass) {
      const m = obj.find(name);
      if (m === undefined) throw rtError(`У класса «${obj.name}» нет члена «${name}»`);
      return m;
    }
    const table = methodTable(obj);
    if (table && Object.prototype.hasOwnProperty.call(table, name)) {
      const b = table[name];
      return new BoundBuiltin(name, b.fn, obj, b.minArgs, b.maxArgs);
    }
    const names = table ? Object.keys(table) : [];
    const near = suggest(name, names);
    let hint = null;
    if (names.length) hint = near ? `Возможно, вы имели в виду «${near}».` : 'Доступные методы: ' + [...names].sort().join(', ');
    throw rtError(`У значения типа ${typeName(obj)} нет метода «${name}»`, hint);
  }

  // ---- вызовы ----
  eCall(node, env) {
    const fn = this.evaluate(node.func, env);
    const args = node.args.map((a) => this.evaluate(a, env));
    let kwargs = null;
    if (node.kwargs.length) { kwargs = new Map(); for (const [name, expr] of node.kwargs) kwargs.set(name, this.evaluate(expr, env)); }
    return this.callValue(fn, args, node.line, kwargs);
  }

  callValue(fn, args, line = null, kwargs = null) {
    if (fn instanceof QFunction) return this.callFunction(fn, args, line, kwargs);
    if (fn instanceof BoundMethod) return this.callFunction(fn.func, [fn.receiver, ...args], line, kwargs);
    if (fn instanceof Builtin) {
      if (fn.unsafe && this.safe) throw rtError(`Функция «${fn.name}» недоступна в безопасном режиме (Playground)`);
      let opts = null;
      if (fn.kwonly) {
        opts = {};
        if (kwargs) {
          kwargs = new Map(kwargs);
          for (const name of fn.kwonly) if (kwargs.has(name)) { opts[name] = kwargs.get(name); kwargs.delete(name); }
        }
      }
      if (kwargs && kwargs.size) args = this.bindBuiltinKwargs(fn, args, kwargs);
      this.arity(fn.name, args.length, fn.minArgs, fn.maxArgs);
      return this.callNative(fn.name, fn.fn, opts ? [this, ...args, opts] : [this, ...args]);
    }
    if (fn instanceof BoundBuiltin) {
      if (kwargs) throw rtError(`Метод «${fn.name}» не принимает именованные аргументы`);
      this.arity('.' + fn.name, args.length, fn.minArgs, fn.maxArgs);
      return this.callNative(fn.name, fn.fn, [this, fn.receiver, ...args]);
    }
    if (fn instanceof QClass) return this.instantiate(fn, args, line, kwargs);
    throw rtError(`Значение типа ${typeName(fn)} нельзя вызвать как функцию`);
  }

  bindBuiltinKwargs(fn, args, kwargs) {
    if (!fn.kw && !fn.kwonly) throw rtError(`Функция «${fn.name}» не принимает именованные аргументы`,
                                            "Для сравнения используйте '==', а аргументы передавайте по порядку.");
    const slots = args.slice();
    const MISSING = {};
    for (const [name, value] of kwargs) {
      const idx = (fn.kw || []).indexOf(name);
      if (idx < 0) throw rtError(`У функции «${fn.name}» нет параметра «${name}»`, 'Параметры: ' + [...(fn.kw || []), ...(fn.kwonly || [])].join(', '));
      if (idx < args.length) throw rtError(`Параметр «${name}» функции «${fn.name}» получил значение дважды`);
      while (slots.length <= idx) slots.push(MISSING);
      slots[idx] = value;
    }
    slots.forEach((v, i) => { if (v === MISSING) throw rtError(`Функция «${fn.name}» не получила значение параметра «${fn.kw[i]}»`); });
    return slots;
  }

  callNative(name, fn, args) {
    this.tick();
    try { return fn(...args); }
    catch (e) {
      if (e instanceof QazaqError || e instanceof ReturnSignal || e instanceof BreakSignal || e instanceof ContinueSignal) throw e;
      if (e instanceof RangeError) {
        if (isStackOverflow(e)) throw rtError('Слишком глубокая вложенность значений');
        throw rtError('Результат слишком велик для вычисления');
      }
      if (e instanceof Unhashable) throw rtError('Ключом не может быть изменяемое значение (тізім/сөздік)');
      if (e instanceof ZeroDivision) throw rtError(`«${name}»: ZeroDivisionError`);
      throw e;
    }
  }

  arity(name, given, lo, hi) {
    if (given < lo || (hi !== null && given > hi)) {
      const want = hi === null ? `не менее ${lo}` : lo === hi ? String(lo) : `от ${lo} до ${hi}`;
      throw rtError(`«${name}» ожидает аргументов: ${want}, получено: ${given}`);
    }
  }

  callFunction(fn, args, line, kwargs = null) {
    const n = args.length, params = fn.params;
    if (n > params.length || (!kwargs && n < fn.minArgs)) this.arity(fn.name, n, fn.minArgs, params.length);
    if (this.depth >= this.limits.maxDepth)
      throw rtError(`Превышена максимальная глубина вызовов (${this.limits.maxDepth})`, 'Проверьте условие выхода из рекурсии.');
    const local = new Env(fn.closure);
    const vars = local.vars;
    for (let i = 0; i < Math.min(n, params.length); i++) vars.set(params[i].name, args[i]);
    if (kwargs) {
      const names = params.map((p) => p.name);
      for (const [key, value] of kwargs) {
        if (!names.includes(key))
          throw rtError(`У функции «${fn.name}» нет параметра «${key}»`, 'Параметры: ' + (names.length ? names.join(', ') : 'нет'));
        if (vars.has(key)) throw rtError(`Параметр «${key}» функции «${fn.name}» получил значение дважды`);
        vars.set(key, value);
      }
    }
    for (const p of params) {
      if (!vars.has(p.name)) {
        if (p.default === null) throw rtError(`Функция «${fn.name}» не получила значение параметра «${p.name}»`);
        vars.set(p.name, this.evaluate(p.default, fn.closure));
      }
    }
    this.depth++;
    this.tick();
    const traced = this.onStep !== null;
    if (traced) this.frames.push({ name: fn.name, line });
    try { this.runBlock(fn.body, local); }
    catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      if (e instanceof QazaqError) e.trace.push([fn.name, line]);
      throw e;
    } finally { this.depth--; if (traced) this.frames.pop(); }
    return null;
  }

  instantiate(cls, args, line, kwargs = null) {
    const inst = new QInstance(cls);
    const init = cls.find('жасау');
    if (init instanceof QFunction) this.callFunction(init, [inst, ...args], line, kwargs);
    else if (args.length || kwargs)
      throw rtError(`Класс «${cls.name}» не принимает аргументы: в нём нет метода «жасау»`,
                    'Конструктор объявляется так: функ жасау(өзі, …):');
    return inst;
  }
}

function classNames(cls) {
  const names = [];
  while (cls !== null) { for (const k of cls.members.keys()) names.push(k); cls = cls.base; }
  return names;
}

// ---- числовая башня ----
function numAdd(a, b) { return isFloat(a) || isFloat(b) ? toNumber(a) + toNumber(b) : big(a) + big(b); }
function numSub(a, b) { return isFloat(a) || isFloat(b) ? toNumber(a) - toNumber(b) : big(a) - big(b); }
function numMul(a, b) {
  if (isFloat(a) || isFloat(b)) return toNumber(a) * toNumber(b);
  const x = big(a), y = big(b);
  if (bitLen(x) + bitLen(y) > MAX_INT_BITS) throw rtError('Результат умножения слишком велик');
  return x * y;
}
function numTrueDiv(a, b) {
  if (isFloat(a) || isFloat(b)) {
    const y = toNumber(b);
    if (y === 0) throw new ZeroDivision();
    return toNumber(a) / y;
  }
  const y = big(b);
  if (y === 0n) throw new ZeroDivision();
  const fx = Number(big(a)), fy = Number(y);
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) throw new OverflowErr();
  return fx / fy;
}
function numFloorDiv(a, b) {
  if (isFloat(a) || isFloat(b)) {
    const y = toNumber(b);
    if (y === 0) throw new ZeroDivision();
    return floatFloorDiv(toNumber(a), y);
  }
  const y = big(b);
  if (y === 0n) throw new ZeroDivision();
  return floorDiv(big(a), y);
}
function numMod(a, b) {
  if (isFloat(a) || isFloat(b)) {
    const y = toNumber(b);
    if (y === 0) throw new ZeroDivision();
    return floatMod(toNumber(a), y);
  }
  const y = big(b);
  if (y === 0n) throw new ZeroDivision();
  return pyMod(big(a), y);
}
function numPow(a, b) {
  if (isInt(a) && isInt(b)) {
    const x = big(a), y = big(b);
    if (y >= 0n) {
      if (y > 0n && (x > 1n || x < -1n) && y * BigInt(bitLen(x)) > BigInt(MAX_INT_BITS))
        throw rtError('Результат возведения в степень слишком велик');
      return x ** y;
    }
    if (x === 0n) throw new ZeroDivision();
    return hpPow(Number(x), Number(y));
  }
  const x = toNumber(a), y = toNumber(b);
  if (x === 0 && y < 0) throw new ZeroDivision();
  if (x < 0 && Number.isFinite(y) && !Number.isInteger(y))
    throw rtError('Результат комплексный: основание отрицательно, а показатель дробный');
  const r = hpPow(x, y);
  if (!Number.isFinite(r) && Number.isFinite(x) && Number.isFinite(y)) throw new OverflowErr();
  return r;
}

function rangeHas(r, v) {
  if (!isNum(v)) return false;
  if (typeof v === 'number' && !Number.isInteger(v)) return false;
  const x = typeof v === 'number' ? BigInt(v) : big(v);
  if (r.step > 0n) { if (x < r.start || x >= r.stop) return false; }
  else if (x > r.start || x <= r.stop) return false;
  return (x - r.start) % r.step === 0n;
}

// Индексы среза, как у Python slice.indices(len)
function sliceIndices(len, lo, hi, step) {
  step = step === null ? 1n : step;
  const clamp = (v, low, high) => (v < low ? low : v > high ? high : v);
  let start, stop;
  if (step > 0n) {
    start = lo === null ? 0n : clamp(lo < 0n ? lo + len : lo, 0n, len);
    stop = hi === null ? len : clamp(hi < 0n ? hi + len : hi, 0n, len);
  } else {
    start = lo === null ? len - 1n : clamp(lo < 0n ? lo + len : lo, -1n, len - 1n);
    stop = hi === null ? -1n : clamp(hi < 0n ? hi + len : hi, -1n, len - 1n);
  }
  return [start, stop, step];
}
