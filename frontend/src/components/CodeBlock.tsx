import { useEffect, useState } from 'react';
import { monaco } from '../editor/monacoSetup';
import { LANGUAGE_ID, registerQazaq } from '../editor/qazaqLanguage';

export default function CodeBlock({ code }: { code: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    registerQazaq(monaco);
    monaco.editor.colorize(code, LANGUAGE_ID, { tabSize: 4 }).then((h: string) => {
      if (alive) setHtml(h);
    });
    return () => {
      alive = false;
    };
  }, [code]);
  return html ? (
    <pre className="codeblock" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <pre className="codeblock">{code}</pre>
  );
}
