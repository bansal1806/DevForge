import Docker from 'dockerode';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { ExecutionError, type ExecutionResult, type RunnableFile, type RunLanguage } from './execution';

const docker = new Docker();

const TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

const IMAGES: Record<RunLanguage, string> = {
  javascript: 'node:22-alpine',
  typescript: 'node:22-alpine',
  python: 'python:3.12-alpine',
  cpp: 'gcc:14',
};

function commandFor(language: RunLanguage, entry: string): string[] {
  switch (language) {
    case 'javascript':
      return ['node', entry];
    case 'typescript':
      return ['node', '--experimental-strip-types', '--no-warnings', entry];
    case 'python':
      return ['python', '-B', entry];
    case 'cpp':
      // The path is passed as a positional argument, never interpolated into the script
      return ['sh', '-c', 'g++ -O2 -o /tmp/a.out "$1" && /tmp/a.out', 'sh', entry];
  }
}

/** Collects a capped stream of output; flags truncation instead of growing unbounded. */
class OutputBuffer {
  private chunks: Buffer[] = [];
  private size = 0;
  truncated = false;

  write(chunk: Buffer) {
    if (this.size >= MAX_OUTPUT_BYTES) {
      this.truncated = true;
      return;
    }
    const room = MAX_OUTPUT_BYTES - this.size;
    const part = chunk.length > room ? chunk.subarray(0, room) : chunk;
    if (part.length < chunk.length) this.truncated = true;
    this.chunks.push(part);
    this.size += part.length;
  }

  toString() {
    const text = Buffer.concat(this.chunks).toString('utf8');
    return this.truncated ? `${text}\n[output truncated at ${MAX_OUTPUT_BYTES / 1024}KB]` : text;
  }
}

/**
 * Local Docker sandbox: the branch's files are written to a throwaway
 * directory mounted read-only into a locked-down, network-less container.
 */
export class SandboxService {
  static async run(files: RunnableFile[], entry: string, language: RunLanguage): Promise<ExecutionResult> {
    const workDir = path.join(os.tmpdir(), `devforge-run-${randomUUID()}`);
    let container: Docker.Container | null = null;
    let timer: NodeJS.Timeout | undefined;

    try {
      for (const file of files) {
        const target = path.join(workDir, file.path);
        // Paths are validated upstream; this is a belt-and-braces containment check
        if (!target.startsWith(workDir + path.sep)) continue;
        await fs.outputFile(target, file.content);
      }

      container = await docker.createContainer({
        Image: IMAGES[language],
        Cmd: commandFor(language, entry),
        WorkingDir: '/app',
        User: '65534:65534', // nobody
        Env: ['HOME=/tmp', 'PYTHONDONTWRITEBYTECODE=1'],
        NetworkDisabled: true,
        HostConfig: {
          Binds: [`${workDir}:/app:ro`],
          NetworkMode: 'none',
          Memory: 256 * 1024 * 1024,
          MemorySwap: 256 * 1024 * 1024, // no swap
          NanoCpus: 500_000_000, // 0.5 CPU
          PidsLimit: 64, // fork-bomb guard
          ReadonlyRootfs: true,
          Tmpfs: { '/tmp': 'rw,exec,nosuid,size=64m' },
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges'],
          AutoRemove: false, // removed in finally, after we've read the exit code
        },
      });

      const stream = await container.attach({ stream: true, stdout: true, stderr: true });
      const stdout = new OutputBuffer();
      const stderr = new OutputBuffer();
      container.modem.demuxStream(stream, { write: (c: Buffer) => stdout.write(c) }, { write: (c: Buffer) => stderr.write(c) });

      await container.start();
      logger.info(`Sandbox started (${language}, ${files.length} files)`);

      const started = container;
      const timedOut = await new Promise<boolean>((resolve, reject) => {
        timer = setTimeout(() => {
          started.kill().catch(() => undefined);
          resolve(true);
        }, TIMEOUT_MS);
        started.wait().then(() => resolve(false), reject);
      });

      const { State } = await container.inspect();
      return {
        stdout: stdout.toString(),
        stderr: timedOut ? `${stderr.toString()}\nExecution timed out after ${TIMEOUT_MS / 1000}s` : stderr.toString(),
        exitCode: timedOut ? 124 : State.ExitCode,
        timedOut,
      };
    } catch (err: any) {
      logger.error(`Sandbox execution error: ${err.message}`);
      throw new ExecutionError('The local sandbox failed to run this file. Is Docker running?');
    } finally {
      if (timer) clearTimeout(timer);
      if (container) await container.remove({ force: true }).catch(() => undefined);
      await fs.remove(workDir).catch(() => undefined);
    }
  }

  static async pullImages(): Promise<void> {
    for (const image of new Set(Object.values(IMAGES))) {
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
    } catch {
      return false;
    }
  }
}
