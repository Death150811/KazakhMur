export interface TraceEntry {
  function: string;
  line: number | null;
}

export interface RunError {
  title: string;
  message: string;
  line: number | null;
  column: number | null;
  hint: string | null;
  trace?: TraceEntry[];
}

export interface RunResult {
  status: 'ok' | 'error' | 'limit' | 'rejected' | 'busy' | 'internal';
  stdout: string;
  error: RunError | null;
  steps: number;
  duration_ms: number;
}

export interface Example {
  id: string;
  title: string;
  code: string;
}

export class ApiError extends Error {}

export async function runCode(code: string, stdin: string, signal?: AbortSignal): Promise<RunResult> {
  let res: Response;
  try {
    res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, stdin }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('network');
  }
  if (res.status === 429) throw new ApiError('rate');
  if (!res.ok) throw new ApiError('server');
  return (await res.json()) as RunResult;
}

export async function fetchExamples(): Promise<Example[]> {
  const res = await fetch('/api/examples');
  if (!res.ok) throw new ApiError('server');
  return (await res.json()) as Example[];
}
