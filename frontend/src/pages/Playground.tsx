import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { ApiError, fetchExamples, runCode, type Example, type RunResult } from '../api';
import ConsolePanel from '../components/ConsolePanel';
import { monaco } from '../editor/monacoSetup';
import { LANGUAGE_ID, registerQazaq } from '../editor/qazaqLanguage';
import { useT } from '../i18n';

const DEFAULT_CODE = `# Қарапайымдылық сыртында. Қуат ішінде.
айным есім = "Әлем".
айным x = 10.
айным y = 20.

жаз("Сәлем,", есім + "!").
жаз(x + y).
`;

const STORAGE_KEY = 'qazaq.code';

function loadStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeCode(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* хранилище недоступно — работаем без него */
  }
}

export default function Playground({ theme }: { theme: 'dark' | 'light' }) {
  const { t } = useT();
  const [code, setCode] = useState<string>(() => loadStored() ?? DEFAULT_CODE);
  const [stdin, setStdin] = useState('');
  const [showStdin, setShowStdin] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [examples, setExamples] = useState<Example[] | null>(null);
  const [selected, setSelected] = useState('');
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchExamples().then(setExamples).catch(() => setExamples([]));
  }, []);

  const clearMarkers = useCallback(() => {
    const model = editorRef.current?.getModel();
    if (model) monaco.editor.setModelMarkers(model, 'qazaq', []);
  }, []);

  const showMarker = useCallback((r: RunResult) => {
    const model = editorRef.current?.getModel();
    const err = r.error;
    if (!model || !err || err.line == null || err.line > model.getLineCount()) return;
    const col = err.column ?? 1;
    const lineLen = model.getLineMaxColumn(err.line);
    monaco.editor.setModelMarkers(model, 'qazaq', [
      {
        severity: monaco.MarkerSeverity.Error,
        message: err.message + (err.hint ? `\n${err.hint}` : ''),
        startLineNumber: err.line,
        startColumn: Math.min(col, lineLen),
        endLineNumber: err.line,
        endColumn: Math.min(Math.max(col + 1, lineLen), lineLen),
      },
    ]);
  }, []);

  const run = useCallback(async () => {
    if (running) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setMessage(null);
    clearMarkers();
    try {
      const r = await runCode(code, stdin, ctrl.signal);
      setResult(r);
      showMarker(r);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setResult(null);
      const kind = e instanceof ApiError ? (e.message as 'network' | 'rate' | 'server') : 'server';
      setMessage(t(kind));
    } finally {
      setRunning(false);
    }
  }, [code, stdin, running, clearMarkers, showMarker, t]);

  // Горячая клавиша регистрируется один раз и вызывает актуальную версию run
  const runRef = useRef(run);
  runRef.current = run;

  const jump = useCallback((line: number, column: number | null) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.revealLineInCenter(line);
    ed.setPosition({ lineNumber: line, column: column ?? 1 });
    ed.focus();
  }, []);

  const onChange = (value: string | undefined) => {
    const v = value ?? '';
    setCode(v);
    storeCode(v);
    clearMarkers();
  };

  const onReset = () => {
    const ex = examples?.find((e) => e.id === selected);
    const fresh = ex ? ex.code : DEFAULT_CODE;
    setCode(fresh);
    storeCode(fresh);
    setResult(null);
    setMessage(null);
    clearMarkers();
  };

  const onPick = (id: string) => {
    setSelected(id);
    const ex = examples?.find((e) => e.id === id);
    if (ex) {
      setCode(ex.code);
      storeCode(ex.code);
      setResult(null);
      setMessage(null);
      clearMarkers();
    }
  };

  return (
    <div className="playground">
      <div className="toolbar">
        <button className="btn btn-primary" onClick={run} disabled={running} aria-keyshortcuts="Control+Enter">
          <span aria-hidden="true">▶</span> {running ? t('running') : t('run')}
        </button>
        <button className="btn" onClick={onReset}>{t('reset')}</button>
        <label className="select-wrap">
          <span className="sr-only">{t('examples')}</span>
          <select value={selected} onChange={(e) => onPick(e.target.value)} disabled={!examples || examples.length === 0}>
            <option value="">{examples === null ? t('loadingExamples') : t('examples')}</option>
            {examples?.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.title}</option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={() => setShowStdin((v) => !v)} aria-expanded={showStdin}>
          {t('stdin')}
        </button>
      </div>
      {showStdin && (
        <div className="stdin">
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder={t('stdinHint')}
            rows={3}
            aria-label={t('stdin')}
          />
        </div>
      )}
      <div className="panes">
        <section className="editor-pane" aria-label={t('editor')}>
          <Editor
            height="100%"
            language={LANGUAGE_ID}
            theme={theme === 'dark' ? 'qazaq-dark' : 'qazaq-light'}
            value={code}
            onChange={onChange}
            beforeMount={(m) => registerQazaq(m)}
            onMount={(editor, m) => {
              editorRef.current = editor;
              editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => runRef.current());
            }}
            options={{
              fontSize: 15,
              fontFamily: "'JetBrains Mono','Fira Code','DejaVu Sans Mono',Menlo,Consolas,monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              insertSpaces: true,
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              padding: { top: 12, bottom: 12 },
              wordWrap: 'on',
              unicodeHighlight: { ambiguousCharacters: true, invisibleCharacters: true },
            }}
          />
        </section>
        <ConsolePanel
          result={result}
          running={running}
          message={message}
          onClear={() => { setResult(null); setMessage(null); clearMarkers(); }}
          onJump={jump}
        />
      </div>
    </div>
  );
}
