import { simpleGit, type SimpleGit } from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger';
import { isServerless } from '../lib/env';

const REPO_BASE_PATH = path.join(process.cwd(), 'data', 'repos');

// Ensure base path exists. Serverless filesystems are read-only — the git
// mirror is disabled there, so a failure here must not crash module load.
try {
  if (!isServerless) {
    fs.ensureDirSync(REPO_BASE_PATH);
  }
} catch {
  // Read-only filesystem — git mirroring will be skipped.
}

export class GitManager {
  private repoPath: string;
  private client?: SimpleGit;

  constructor(repoId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(repoId)) throw new Error('Invalid repository id');
    this.repoPath = path.join(REPO_BASE_PATH, repoId);
  }

  // Created lazily: simple-git refuses a directory that doesn't exist yet,
  // and the directory is only created by init().
  private get git(): SimpleGit {
    return (this.client ??= simpleGit(this.repoPath));
  }

  /**
   * Initialize a new Git repository
   */
  async init(): Promise<void> {
    try {
      await fs.ensureDir(this.repoPath);
      await this.git.init();
      // Configure default identity locally for the repo
      await this.git.addConfig('user.name', 'DevForge System');
      await this.git.addConfig('user.email', 'system@devforge.ai');
      logger.info(`Initialized Git repository at ${this.repoPath}`);
    } catch (err: any) {
      logger.error(`Failed to initialize Git repository: ${err.message}`);
      throw err;
    }
  }

  /**
   * Write a file to disk and stage it
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const fullPath = path.join(this.repoPath, filePath);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content);
      await this.git.add(filePath);
    } catch (err: any) {
      logger.error(`Failed to write/stage file ${filePath}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Remove a file from disk and the index (no-op if it doesn't exist)
   */
  async removeFile(filePath: string): Promise<void> {
    const fullPath = path.join(this.repoPath, filePath);
    if (!(await fs.pathExists(fullPath))) return;
    await fs.remove(fullPath);
    await this.git.raw(['rm', '--cached', '--ignore-unmatch', '--quiet', '--', filePath]);
  }

  /**
   * Delete the whole on-disk mirror
   */
  async destroy(): Promise<void> {
    await fs.remove(this.repoPath);
  }

  /**
   * Commit staged changes
   */
  async commit(message: string, author?: { name: string, email: string }): Promise<void> {
    try {
      const options: any = {};
      if (author) {
        // simple-git passes args without a shell, so no extra quoting
        const clean = (v: string) => v.replace(/[<>\r\n]/g, '');
        options['--author'] = `${clean(author.name)} <${clean(author.email)}>`;
      }
      await this.git.commit(message, undefined, options);
      logger.info(`Committed changes to ${this.repoPath}: ${message}`);
    } catch (err: any) {
      logger.error(`Failed to commit changes: ${err.message}`);
      throw err;
    }
  }

  /**
   * List files in the current branch
   */
  async listFiles(): Promise<string[]> {
    try {
      const files = await this.git.raw(['ls-tree', '-r', 'HEAD', '--name-only']);
      return files.split('\n').filter(Boolean);
    } catch (err: any) {
      // If HEAD doesn't exist yet (empty repo), return empty list
      return [];
    }
  }

  /**
   * Get file content from a specific branch/tree
   */
  async getFileContent(filePath: string, branch: string = 'HEAD'): Promise<string> {
    try {
      return await this.git.show([`${branch}:${filePath}`]);
    } catch (err: any) {
      // Fallback: Read from disk if HEAD/branch fails (uncommitted file)
      const fullPath = path.join(this.repoPath, filePath);
      if (await fs.pathExists(fullPath)) {
        return await fs.readFile(fullPath, 'utf8');
      }
      throw new Error(`File not found: ${filePath}`);
    }
  }

  /**
   * Create and switch to a branch
   */
  async createBranch(name: string): Promise<void> {
    try {
      await this.git.checkoutLocalBranch(name);
    } catch (err: any) {
      logger.error(`Failed to create branch ${name}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Switch to an existing branch
   */
  async checkout(branch: string): Promise<void> {
    try {
      await this.git.checkout(branch);
    } catch (err: any) {
      logger.error(`Failed to checkout branch ${branch}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Check if the repository exists on disk
   */
  exists(): boolean {
    return fs.existsSync(path.join(this.repoPath, '.git'));
  }

  /**
   * Get the full path of the repository
   */
  getPath(): string {
    return this.repoPath;
  }
}
