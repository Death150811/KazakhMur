import { useEffect, useMemo, useState } from 'react';
import { LangContext, makeT, type Lang } from './i18n';
import Docs from './pages/Docs';
import Playground from './pages/Playground';

type Theme = 'dark' | 'light';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function initialTheme(): Theme {
  const saved = read('qazaq.theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function currentPage(): 'play' | 'docs' {
  return window.location.hash === '#/docs' ? 'docs' : 'play';
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => (read('qazaq.lang') === 'ru' ? 'ru' : 'kk'));
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [page, setPage] = useState(currentPage);

  useEffect(() => {
    const onHash = () => setPage(currentPage());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    write('qazaq.theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    write('qazaq.lang', lang);
  }, [lang]);

  const ctx = useMemo(() => ({ lang, t: makeT(lang) }), [lang]);
  const { t } = ctx;

  return (
    <LangContext.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <a className="brand" href="#/" aria-label="Qazaq">
            <span className="brand-name">QAZAQ</span>
            <span className="brand-dot" aria-hidden="true">.</span>
          </a>
          <span className="tagline">{t('tagline')}</span>
          <nav className="nav" aria-label="Main">
            <a href="#/" className={page === 'play' ? 'active' : ''}>{t('playground')}</a>
            <a href="#/docs" className={page === 'docs' ? 'active' : ''}>{t('docs')}</a>
          </nav>
          <div className="controls">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setLang(lang === 'ru' ? 'kk' : 'ru')}
              aria-label="Language"
            >
              {lang === 'ru' ? 'RU' : 'ҚАЗ'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={t('theme')}
              title={t('theme')}
            >
              {theme === 'dark' ? '☾' : '☀'}
            </button>
          </div>
        </header>
        <main className="main">
          {page === 'docs' ? <Docs theme={theme} /> : <Playground theme={theme} />}
        </main>
      </div>
    </LangContext.Provider>
  );
}
