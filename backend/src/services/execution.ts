export type RunLanguage = 'javascript' | 'typescript' | 'python' | 'cpp';

export interface RunnableFile {
  path: string;
  content: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
}

const LANGUAGE_BY_EXTENSION: Record<string, RunLanguage> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  py: 'python',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
};

export function detectLanguage(filePath: string): RunLanguage | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_BY_EXTENSION[ext];
}

/** An execution-engine failure whose message is safe to show to the user. */
export class ExecutionError extends Error {}
