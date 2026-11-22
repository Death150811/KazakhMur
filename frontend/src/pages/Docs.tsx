import { useEffect } from 'react';
import CodeBlock from '../components/CodeBlock';
import { monaco } from '../editor/monacoSetup';
import language from '../editor/language.generated.json';
import { useT } from '../i18n';

interface Keyword { name: string; equivalent: string; description: string }
interface Builtin { name: string; category: string; signature: string; doc: string; unsafe: boolean }

const CATEGORY_TITLES: Record<string, string> = {
  core: 'Core — всегда доступны',
  math: 'Math — математика',
  data: 'Data — анализ данных',
  science: 'Science — символьная математика и графики (нужны SymPy / Matplotlib)',
  ai: 'AI — простая линейная регрессия',
  io: 'IO — файлы (не в Playground)',
};

const EX_DOT = `айным x = 10.
айным сан = 3.14.     # десятичная точка внутри числа
жаз(x + сан).         # точка завершает инструкцию`;

const EX_BLOCKS = `функ қосу(a, b):
    қайтар a + b.

егер қосу(1, 2) == 3:
    жаз("Дұрыс").
әйтпесе:
    жаз("Қате").`;

const EX_MEMBER = `айным сандар = [3, 1, 2].
сандар.қос(4).                  # точка + буква = доступ к методу
жаз(сұрып(сандар), "а,б".бөл(",")).`;

const EX_MULTI = `айным қосынды2 = 1 +
    2 +
    3.                          # инструкция заканчивается точкой, а не строкой`;

export default function Docs({ theme }: { theme: 'dark' | 'light' }) {
  const { t } = useT();
  useEffect(() => {
    monaco.editor.setTheme(theme === 'dark' ? 'qazaq-dark' : 'qazaq-light');
  }, [theme]);

  const keywords = language.keywords as Keyword[];
  const builtins = language.builtins as Builtin[];
  const categories = Object.keys(CATEGORY_TITLES).filter((c) => builtins.some((b) => b.category === c));

  return (
    <article className="docs">
      <h1>Qazaq {language.version}</h1>
      <p className="lead">
        Язык программирования на казахском языке. Файлы имеют расширение <code>.qaz</code>. Принцип:
        «Қарапайымдылық сыртында. Қуат ішінде.»
      </p>

      <h2>Точка завершает инструкцию</h2>
      <p>
        Каждая простая инструкция заканчивается точкой. Точка — часть числа, если она стоит между цифрами
        (<code>3.14</code>). Точка, после которой пробел, конец строки или комментарий, — завершитель.
        Точка, сразу за которой идёт буква, — доступ к методу или полю. Заголовки блоков
        (<code>егер</code>, <code>функ</code>, <code>әзір</code>, …) заканчиваются двоеточием.
      </p>
      <CodeBlock code={EX_DOT} />
      <CodeBlock code={EX_MEMBER} />
      <CodeBlock code={EX_MULTI} />

      <h2>Блоки и отступы</h2>
      <p>Тело блока сдвигается вправо на несколько пробелов (как в Python).</p>
      <CodeBlock code={EX_BLOCKS} />

      <h2>{t('keywords')}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>{t('keyword')}</th><th>{t('meaning')}</th><th>{t('description')}</th></tr>
          </thead>
          <tbody>
            {keywords.map((k) => (
              <tr key={k.name}><td><code>{k.name}</code></td><td>{k.equivalent}</td><td>{k.description}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{t('builtins')}</h2>
      {categories.map((cat) => (
        <section key={cat}>
          <h3>{CATEGORY_TITLES[cat]}</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('signature')}</th><th>{t('description')}</th></tr></thead>
              <tbody>
                {builtins.filter((b) => b.category === cat).map((b) => (
                  <tr key={b.name}><td><code>{b.signature}</code></td><td>{b.doc}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <h2>Ограничения Playground</h2>
      <ul>
        <li>Код выполняется в изолированном процессе: до 3 секунд, ограниченная память и вывод.</li>
        <li>Функции <code>оқы</code>, <code>сақта</code>, <code>сыз</code> недоступны (нет доступа к файлам).</li>
        <li>Для запуска без ограничений установите Qazaq локально: <code>qaz run main.qaz</code>.</li>
      </ul>
    </article>
  );
}
