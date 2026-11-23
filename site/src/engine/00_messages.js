// ---- Перевод сообщений об ошибках (каталог общий с Python: qaz/messages_kk.json) ----
// Алгоритм тот же, что в qaz/messages.py: сообщение переводится, только если оно целиком совпало с шаблоном.
const MSG_PLACEHOLDER = /\{([a-z][a-z0-9_]*)\}/g;
const MSG_FRAGMENT_NAMES = ['want', 'got'];
function compileMessageRules(rules) {
  return rules.map(([ru, kk]) => {
    let pos = 0, src = '';
    for (const m of ru.matchAll(MSG_PLACEHOLDER)) {
      src += ru.slice(pos, m.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      src += `(?<${m[1]}>[\\s\\S]+?)`;
      pos = m.index + m[0].length;
    }
    src += ru.slice(pos).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { re: new RegExp('^' + src + '$'), kk };
  });
}
let MSG_RULES = null;
function messageRules() {
  if (!MSG_RULES) {
    const cat = LANG.messages_kk;
    MSG_RULES = { messages: compileMessageRules(cat.messages), fragments: compileMessageRules(cat.fragments) };
  }
  return MSG_RULES;
}
function applyMessageRules(text, rules, fragments) {
  for (const { re, kk } of rules) {
    const m = re.exec(text);
    if (!m) continue;
    const values = { ...m.groups };
    if (fragments) for (const name of MSG_FRAGMENT_NAMES) if (name in values) values[name] = applyMessageRules(values[name], fragments, null);
    return kk.replace(MSG_PLACEHOLDER, (all, name) => (name in values ? values[name] : all));
  }
  return text;
}
function translateText(text, lang) {
  if (text === null || text === undefined || lang !== 'kk') return text;
  const r = messageRules();
  return applyMessageRules(text, r.messages, r.fragments);
}
function translateTitle(title, lang) {
  if (lang !== 'kk') return title;
  return LANG.messages_kk.titles[title] ?? title;
}
function translateErrorDict(error, lang) {
  if (!error || lang !== 'kk') return error;
  return { ...error, title: translateTitle(error.title, lang), message: translateText(error.message, lang), hint: translateText(error.hint, lang) };
}
const RU_LABELS = {
  file: 'файл', line: 'строка', column: 'столбец', hint: 'Подсказка',
  called: '  функция {name}() вызвана {where}', called_at: 'на строке {line}',
  called_unknown: '(строка неизвестна)', skipped: '… ещё {n} вызовов …',
};
function errLabel(key, lang, vars = {}) {
  const tpl = lang === 'kk' ? LANG.messages_kk.labels[key] : RU_LABELS[key];
  return tpl.replace(MSG_PLACEHOLDER, (all, name) => (name in vars ? String(vars[name]) : all));
}
