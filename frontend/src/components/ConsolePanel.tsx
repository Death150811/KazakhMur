import type { RunResult } from '../api';
import { useT } from '../i18n';

interface Props {
  result: RunResult | null;
  running: boolean;
  message: string | null;
  onClear: () => void;
  onJump: (line: number, column: number | null) => void;
}

export default function ConsolePanel({ result, running, message, onClear, onJump }: Props) {
  const { t } = useT();
  const status = running ? 'running' : message ? 'error' : result ? result.status : 'idle';
  const label =
    status === 'running' ? t('running')
    : status === 'ok' ? t('ok')
    : status === 'idle' ? null
    : status === 'limit' ? t('limit')
    : t('error');

  return (
    <section className="console" aria-label={t('output')}>
      <header className="console-head">
        <h2>{t('output')}</h2>
        {label && <span className={`chip chip-${status}`}>{label}</span>}
        {result && !running && (
          <span className="muted small">
            {t('time')}: {result.duration_ms} {t('ms')}
          </span>
        )}
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={onClear} disabled={!result && !message}>
          {t('clear')}
        </button>
      </header>
      <div className="console-body" role="log" aria-live="polite">
        {message && <div className="error-block"><p className="error-msg">{message}</p></div>}
        {!result && !message && !running && <p className="muted">{t('empty')}</p>}
        {result && (
          <>
            {result.stdout !== '' && <pre className="stdout">{result.stdout}</pre>}
            {result.stdout === '' && !result.error && <p className="muted">{t('noOutput')}</p>}
            {result.error && (
              <div className="error-block">
                <p className="error-title">{result.error.title}</p>
                <p className="error-msg">{result.error.message}</p>
                {result.error.line != null && (
                  <button className="link" onClick={() => onJump(result.error!.line!, result.error!.column)}>
                    {t('line')} {result.error.line}
                    {result.error.column != null && `, ${t('column')} ${result.error.column}`}
                  </button>
                )}
                {result.error.hint && (
                  <p className="hint">
                    <strong>{t('hint')}:</strong> {result.error.hint}
                  </p>
                )}
                {result.error.trace && result.error.trace.length > 0 && (
                  <ul className="trace" aria-label={t('trace')}>
                    {result.error.trace.map((f, i) => (
                      <li key={i}>
                        {f.function}() — {t('line')} {f.line ?? '?'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
