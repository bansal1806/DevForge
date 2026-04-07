import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger';

const REPO_BASE_PATH = path.join(process.cwd(), 'data', 'repos');

// Ensure base path exists
fs.ensureDirSync(REPO_BASE_PATH);

export class GitManager {
  private repoPath: string;
  private git: SimpleGit;

  constructor(repoId: string) {
    this.repoPath = path.join(REPO_BASE_PATH, repoId);
    this.git = simpleGit(this.repoPath);
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
   * Commit staged changes
   */
  async commit(message: string, author?: { name: string, email: string }): Promise<void> {
    try {
      const options: any = {};
      if (author) {
        options['--author'] = `"${author.name} <${author.email}>"`;
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
