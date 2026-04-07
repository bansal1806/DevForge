import Docker from 'dockerode';
import path from 'path';
import { logger } from '../utils/logger';

const docker = new Docker();

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class SandboxService {
  private repoId: string;
  private repoPath: string;

  constructor(repoId: string) {
    this.repoId = repoId;
    this.repoPath = path.join(process.cwd(), 'data', 'repos', repoId);
  }

  /**
   * Run a file in a language-specific Docker container
   */
  async runFile(filePath: string, language: 'javascript' | 'python' | 'cpp'): Promise<ExecutionResult> {
    const config = this.getLanguageConfig(language, filePath);
    
    try {
      logger.info(`Starting sandbox for ${language} execution in repo ${this.repoId}`);
      
      const container = await docker.createContainer({
        Image: config.image,
        Cmd: config.cmd,
        HostConfig: {
          Binds: [`${this.repoPath}:/app:ro`], // Read-only mount
          Memory: 512 * 1024 * 1024, // 512MB
          CpuQuota: 50000, // 0.5 CPU
          NetworkMode: 'none', // No internet
          AutoRemove: true,
        },
        WorkingDir: '/app',
      });

      const stream = await container.attach({ stream: true, stdout: true, stderr: true });
      await container.start();

      let stdout = '';
      let stderr = '';

      // Create a promise that resolves when the container finishes or times out
      const executionPromise = new Promise<{ stdout: string, stderr: string, exitCode: number }>((resolve, reject) => {
        container.modem.demuxStream(stream, {
          write: (chunk: Buffer) => { stdout += chunk.toString(); },
        }, {
          write: (chunk: Buffer) => { stderr += chunk.toString(); },
        });

        container.wait().then((data) => {
          resolve({ stdout, stderr, exitCode: data.StatusCode });
        }).catch(reject);
      });

      // Implement a 30s timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          container.stop().catch(() => {}); // Attempt to stop if still running
          reject(new Error('Execution timed out after 30 seconds'));
        }, 30000);
      });

      return await Promise.race([executionPromise, timeoutPromise]);
    } catch (err: any) {
      logger.error(`Sandbox execution error: ${err.message}`);
      throw err;
    }
  }

  private getLanguageConfig(language: string, filePath: string) {
    switch (language) {
      case 'javascript':
        return {
          image: 'node:alpine',
          cmd: ['node', filePath],
        };
      case 'python':
        return {
          image: 'python:3.12-alpine',
          cmd: ['python', filePath],
        };
      case 'cpp':
        // For C++, we compile first. This is a simplified single-step for demo.
        return {
          image: 'gcc:latest',
          cmd: ['sh', '-c', `g++ ${filePath} -o out && ./out`],
        };
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  static async pullImages(): Promise<void> {
    const images = ['node:alpine', 'python:3.12-alpine', 'gcc:latest'];
    for (const image of images) {
      try {
        logger.info(`Pulling sandbox image: ${image}`);
        await docker.pull(image);
      } catch (err: any) {
        logger.warn(`Failed to pull image ${image}: ${err.message}. It might be already present.`);
      }
    }
  }

  /**
   * High-fidelity Docker health check
   */
  static async checkHealth(): Promise<boolean> {
    try {
      const version = await docker.version();
      return !!version;
    } catch (err) {
      return false;
    }
  }
}
