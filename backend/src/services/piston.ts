import axios from 'axios';
import { logger } from '../utils/logger';

export interface PistonResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class PistonService {
  private static readonly API_URL = 'https://emkc.org/api/v2/piston/execute';

  static async runCode(content: string, language: string): Promise<PistonResult> {
    try {
      const pistonLang = this.mapLanguage(language);
      
      const response = await axios.post(this.API_URL, {
        language: pistonLang.language,
        version: pistonLang.version,
        files: [
          {
            content: content
          }
        ]
      });

      const { run } = response.data;
      
      return {
        stdout: run.stdout || '',
        stderr: run.stderr || '',
        exitCode: run.code
      };
    } catch (err: any) {
      logger.error(`Piston execution error: ${err.message}`);
      throw new Error(`Execution failed: ${err.response?.data?.message || err.message}`);
    }
  }

  private static mapLanguage(lang: string): { language: string, version: string } {
    switch (lang.toLowerCase()) {
      case 'javascript':
      case 'js':
        return { language: 'js', version: '*' };
      case 'typescript':
      case 'ts':
        return { language: 'typescript', version: '*' };
      case 'python':
      case 'py':
        return { language: 'python', version: '*' };
      case 'cpp':
      case 'c++':
        return { language: 'cpp', version: '*' };
      default:
        throw new Error(`Unsupported language for Piston: ${lang}`);
    }
  }
}
