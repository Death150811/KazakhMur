import * as monacoApi from 'monaco-editor/esm/vs/editor/edcore.main';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

export const monaco = monacoApi as unknown as typeof import('monaco-editor');

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// Используем локально собранный Monaco, а не CDN — Playground работает офлайн.
loader.config({ monaco });
