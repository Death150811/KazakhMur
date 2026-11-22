/// <reference types="vite/client" />
declare module 'monaco-editor/esm/vs/editor/edcore.main';
declare module 'monaco-editor/esm/vs/editor/editor.worker?worker' {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
