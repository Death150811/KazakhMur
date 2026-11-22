// Запускает программы Qazaq через JS-движок. Вход (stdin): JSON [{name, code, stdin}], выход: JSON [{name, result}].
const fs = require('fs');
const path = require('path');
const { createQazaqEngine } = require(path.join(__dirname, '..', 'dist', 'engine.js'));
const LANG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist', 'language.json'), 'utf-8'));
const engine = createQazaqEngine(LANG);
const items = JSON.parse(fs.readFileSync(0, 'utf-8'));
const out = items.map(({ name, code, stdin }) => ({
  name,
  result: engine.run(code, { stdin: stdin || '', maxDepth: 150, timeout: 10, maxSteps: 3000000 }),
}));
process.stdout.write(JSON.stringify(out));
