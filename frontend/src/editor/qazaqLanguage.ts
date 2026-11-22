import type * as Monaco from 'monaco-editor';
import language from './language.generated.json';

export const LANGUAGE_ID = 'qazaq';

type Keyword = { name: string };
type Builtin = { name: string; category: string; signature: string; doc: string };

const keywords = (language.keywords as Keyword[]).map((k) => k.name);
const builtins = language.builtins as Builtin[];
const builtinNames = builtins.map((b) => b.name);
const literals = language.literals as string[];
// ключевые слова-литералы подсвечиваем как константы
const plainKeywords = keywords.filter((k) => !literals.includes(k));

/**
 * Грамматика подсветки (Monarch). Правила точки повторяют лексер (qaz/lexer.py):
 *  - точка внутри числа (3.14) — часть числа;
 *  - точка, за которой пробел, конец строки или «#», — завершитель инструкции (terminator);
 *  - точка, за которой сразу буква, — доступ к члену (member).
 */
export const monarch: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  unicode: true,
  keywords: plainKeywords,
  builtins: builtinNames,
  constants: [...literals, ...(language.constants as string[])],
  methods: language.methods as string[],
  tokenizer: {
    root: [
      [/#.*$/, 'comment'],
      [/ф(?=["'])/, { token: 'string.format', next: '@fstringStart' }],
      [/"""/, { token: 'string', next: '@tripleDouble' }],
      [/"/, { token: 'string', next: '@stringDouble' }],
      [/'/, { token: 'string', next: '@stringSingle' }],
      [/\d[\d_]*\.\d[\d_]*(?:[eE][+-]?\d+)?/, 'number.float'],
      [/\d[\d_]*[eE][+-]?\d+/, 'number.float'],
      [/\d[\d_]*/, 'number'],
      // завершитель инструкции: точка + пробел / конец строки / комментарий
      [/\.(?=\s|$|#)/, 'terminator'],
      // доступ к члену: точка + буква
      [/\.(?=[\p{L}_])/u, 'delimiter.member'],
      [/:(?=\s*(?:#.*)?$)/, 'delimiter.colon'],
      [/\*\*|\/\/|==|!=|<=|>=|\+=|-=|\*=|\/=|[+\-*/%<>=]/, 'operator'],
      [/[()[\]{},:]/, 'delimiter'],
      [
        /[\p{L}_][\p{L}\p{N}_\p{M}]*/u,
        {
          cases: {
            '@keywords': 'keyword',
            '@constants': 'constant',
            '@builtins': 'support.function',
            '@default': 'identifier',
          },
        },
      ],
      [/\s+/, 'white'],
    ],
    fstringStart: [
      [/"""/, { token: 'string.format', switchTo: '@fTripleDouble' }],
      [/"/, { token: 'string.format', switchTo: '@fDouble' }],
      [/'/, { token: 'string.format', switchTo: '@fSingle' }],
    ],
    fDouble: [
      [/\{\{|\}\}/, 'string.format'],
      [/\{/, { token: 'delimiter.interp', next: '@interp' }],
      [/\\./, 'string.escape'],
      [/[^"\\{}]+/, 'string.format'],
      [/"/, { token: 'string.format', next: '@pop' }],
    ],
    fSingle: [
      [/\{\{|\}\}/, 'string.format'],
      [/\{/, { token: 'delimiter.interp', next: '@interp' }],
      [/\\./, 'string.escape'],
      [/[^'\\{}]+/, 'string.format'],
      [/'/, { token: 'string.format', next: '@pop' }],
    ],
    fTripleDouble: [
      [/\{\{|\}\}/, 'string.format'],
      [/\{/, { token: 'delimiter.interp', next: '@interp' }],
      [/[^"\\{}]+/, 'string.format'],
      [/"""/, { token: 'string.format', next: '@pop' }],
      [/"/, 'string.format'],
    ],
    interp: [
      [/\}/, { token: 'delimiter.interp', next: '@pop' }],
      [/\d[\d_]*\.\d[\d_]*/, 'number.float'],
      [/\d[\d_]*/, 'number'],
      [/\.(?=[\p{L}_])/u, 'delimiter.member'],
      [/[\p{L}_][\p{L}\p{N}_\p{M}]*/u, { cases: { '@constants': 'constant', '@builtins': 'support.function', '@default': 'identifier' } }],
      [/[^}]/, 'operator'],
    ],
    stringDouble: [
      [/\\./, 'string.escape'],
      [/[^"\\]+/, 'string'],
      [/"/, { token: 'string', next: '@pop' }],
    ],
    stringSingle: [
      [/\\./, 'string.escape'],
      [/[^'\\]+/, 'string'],
      [/'/, { token: 'string', next: '@pop' }],
    ],
    tripleDouble: [
      [/\\./, 'string.escape'],
      [/[^"\\]+/, 'string'],
      [/"""/, { token: 'string', next: '@pop' }],
      [/"/, 'string'],
    ],
  },
};

export const languageConfiguration: Monaco.languages.LanguageConfiguration = {
  comments: { lineComment: '#' },
  brackets: [['(', ')'], ['[', ']'], ['{', '}']],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  // блоки открываются двоеточием в конце строки
  onEnterRules: [
    {
      beforeText: /:\s*(?:#.*)?$/,
      action: { indentAction: 1 /* IndentAction.Indent */ },
    },
  ],
  wordPattern: /[\p{L}_][\p{L}\p{N}_\p{M}]*/u,
  indentationRules: {
    increaseIndentPattern: /:\s*(?:#.*)?$/,
    decreaseIndentPattern: /^\s*(әйтпесе|қате|соңында)\b/u,
  },
};

const dark = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '7aa7ff', fontStyle: 'bold' },
    { token: 'constant', foreground: 'f2a65a' },
    { token: 'support.function', foreground: '4fd1c5' },
    { token: 'identifier', foreground: 'e6e9ef' },
    { token: 'number', foreground: 'f2a65a' },
    { token: 'number.float', foreground: 'f2a65a' },
    { token: 'string', foreground: '9bd37a' },
    { token: 'string.format', foreground: '9bd37a' },
    { token: 'string.escape', foreground: 'c3e88d' },
    { token: 'comment', foreground: '6b7686', fontStyle: 'italic' },
    { token: 'operator', foreground: 'c0c6d4' },
    { token: 'delimiter', foreground: 'c0c6d4' },
    { token: 'delimiter.colon', foreground: '7aa7ff', fontStyle: 'bold' },
    { token: 'delimiter.member', foreground: '8b94a7' },
    { token: 'delimiter.interp', foreground: 'f2a65a' },
    { token: 'terminator', foreground: 'fec50c', fontStyle: 'bold' },
  ],
  colors: {
    'editor.background': '#151a21',
    'editor.lineHighlightBackground': '#1b222b',
    'editorLineNumber.foreground': '#4a5568',
    'editorLineNumber.activeForeground': '#9aa5b8',
    'editorCursor.foreground': '#fec50c',
    'editor.selectionBackground': '#2fb4d644',
  },
};

const light = {
  base: 'vs' as const,
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '2b59d9', fontStyle: 'bold' },
    { token: 'constant', foreground: 'b45309' },
    { token: 'support.function', foreground: '0f766e' },
    { token: 'identifier', foreground: '1f2933' },
    { token: 'number', foreground: 'b45309' },
    { token: 'number.float', foreground: 'b45309' },
    { token: 'string', foreground: '2f7d1f' },
    { token: 'string.format', foreground: '2f7d1f' },
    { token: 'string.escape', foreground: '3d9a28' },
    { token: 'comment', foreground: '7b8794', fontStyle: 'italic' },
    { token: 'operator', foreground: '3e4c59' },
    { token: 'delimiter', foreground: '3e4c59' },
    { token: 'delimiter.colon', foreground: '2b59d9', fontStyle: 'bold' },
    { token: 'delimiter.member', foreground: '7b8794' },
    { token: 'delimiter.interp', foreground: 'b45309' },
    { token: 'terminator', foreground: 'c27c00', fontStyle: 'bold' },
  ],
  colors: {
    'editor.background': '#ffffff',
    'editor.lineHighlightBackground': '#f3f6fa',
    'editorLineNumber.foreground': '#a0aab8',
    'editorCursor.foreground': '#c27c00',
  },
};

let registered = false;

export function registerQazaq(monaco: typeof Monaco): void {
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: LANGUAGE_ID, extensions: ['.qaz'], aliases: ['Qazaq'] });
  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, monarch);
  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, languageConfiguration);
  monaco.editor.defineTheme('qazaq-dark', dark);
  monaco.editor.defineTheme('qazaq-light', light);

  const kinds = monaco.languages.CompletionItemKind;
  monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const items: Monaco.languages.CompletionItem[] = [
        ...(language.keywords as { name: string; description: string }[]).map((k) => ({
          label: k.name,
          kind: kinds.Keyword,
          insertText: k.name,
          detail: k.description,
          range,
        })),
        ...builtins.map((b) => ({
          label: b.name,
          kind: kinds.Function,
          insertText: b.name,
          detail: b.signature,
          documentation: b.doc,
          range,
        })),
      ];
      return { suggestions: items };
    },
  });

  monaco.languages.registerHoverProvider(LANGUAGE_ID, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const b = builtins.find((x) => x.name === word.word);
      if (b) {
        return {
          contents: [{ value: '`' + b.signature + '`' }, { value: b.doc }],
        };
      }
      const k = (language.keywords as { name: string; equivalent: string; description: string }[]).find(
        (x) => x.name === word.word,
      );
      if (k) {
        return { contents: [{ value: `**${k.name}** (${k.equivalent})` }, { value: k.description }] };
      }
      return null;
    },
  });
}
