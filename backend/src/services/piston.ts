import axios from 'axios';
import { logger } from '../utils/logger';
import { ExecutionError, type ExecutionResult, type RunnableFile, type RunLanguage } from './execution';

// Public instance by default; set PISTON_URL to a self-hosted Piston
// (and PISTON_API_KEY if it requires one) for reliable production use.
const PISTON_URL = process.env.PISTON_URL || 'https://emkc.org/api/v2/piston/execute';

const PISTON_LANGUAGES: Record<RunLanguage, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  cpp: 'c++',
};

const RUN_TIMEOUT_MS = 10_000;

export class PistonService {
  /**
   * Runs `entry` with the rest of the branch's files available for imports.
   * Piston treats the first file as the entry point.
   */
  static async run(files: RunnableFile[], entry: string, language: RunLanguage): Promise<ExecutionResult> {
    const ordered = [
      ...files.filter((f) => f.path === entry),
      ...files.filter((f) => f.path !== entry),
    ].map((f) => ({ name: f.path, content: f.content }));

    try {
      const response = await axios.post(
        PISTON_URL,
        {
          language: PISTON_LANGUAGES[language],
          version: '*',
          files: ordered,
          run_timeout: RUN_TIMEOUT_MS,
          compile_timeout: RUN_TIMEOUT_MS,
        },
        {
          timeout: 12_000, // stays under the serverless function limit
          maxContentLength: 1024 * 1024,
          headers: process.env.PISTON_API_KEY ? { Authorization: process.env.PISTON_API_KEY } : undefined,
        }
      );

      const { compile, run } = response.data || {};

      // Compilation failure (C++): surface the compiler output
      if (compile && compile.code !== 0) {
        return { stdout: compile.stdout || '', stderr: compile.stderr || compile.output || 'Compilation failed', exitCode: compile.code ?? 1 };
      }

      const timedOut = run?.signal === 'SIGKILL';
      return {
        stdout: run?.stdout || '',
        stderr: timedOut ? `${run?.stderr || ''}\nExecution timed out` : run?.stderr || '',
        exitCode: run?.code ?? (timedOut ? 124 : 1),
        timedOut,
      };
    } catch (err: any) {
      logger.error(`Piston execution error: ${err.response?.status || ''} ${err.message}`);
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        throw new ExecutionError('The code execution service rejected the request. Configure PISTON_URL / PISTON_API_KEY.');
      }
      if (status === 429) throw new ExecutionError('The code execution service is rate limited. Try again shortly.');
      throw new ExecutionError('The code execution service is unavailable right now.');
    }
  }
}
