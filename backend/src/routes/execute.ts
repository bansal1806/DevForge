import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { verifyRepoAccess } from '../middleware/authorize';
import { SandboxService } from '../services/sandbox';
import { PistonService } from '../services/piston';
import { supabaseAdmin } from '../index';
import { logger } from '../utils/logger';
import { logExecutionMetric } from '../utils/audit';
import { getDefaultBranch, getBranchById, isSafeRepoPath } from '../utils/versioning';
import { GitManager } from '../utils/git';

const router = Router();

const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

/**
 * POST /api/execute/:repoId/run
 * Runs a file from the repository. File content comes from the database
 * (the source of truth), so this works both locally and on serverless.
 * Engine: Docker sandbox locally, Piston API otherwise (or USE_PISTON=true).
 */
router.post('/:repoId/run', requireAuth, verifyRepoAccess('read', 'repoId'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repoId = req.params.repoId as string;
    const { filePath, branchId } = req.body;

    if (!filePath || !isSafeRepoPath(filePath)) {
      return res.status(400).json({ error: 'Missing or invalid entry file path' });
    }

    // Determine language from file extension
    const ext = filePath.split('.').pop()?.toLowerCase();
    let language: 'javascript' | 'typescript' | 'python' | 'cpp' | undefined;

    if (['js', 'mjs', 'cjs'].includes(ext!)) language = 'javascript';
    else if (['ts'].includes(ext!)) language = 'typescript';
    else if (['py'].includes(ext!)) language = 'python';
    else if (['cpp', 'cc', 'cxx'].includes(ext!)) language = 'cpp';

    if (!language) {
      return res.status(400).json({ error: 'Unsupported language for execution' });
    }

    // Read the file content from the database (branch-aware)
    const branch = branchId
      ? await getBranchById(repoId, branchId)
      : await getDefaultBranch(repoId);

    const { data: file } = await supabaseAdmin
      .from('files')
      .select('content')
      .eq('repo_id', repoId)
      .eq('path', filePath)
      .eq('branch_id', branch?.id || '')
      .maybeSingle();

    if (!file || file.content == null) {
      return res.status(404).json({ error: 'File not found on this branch' });
    }

    const usePiston = process.env.USE_PISTON === 'true' || isServerless;
    const startTime = Date.now();
    let result;

    if (usePiston) {
      logger.info(`Using Piston API for ${filePath} (${language}) in repo ${repoId}`);
      result = await PistonService.runCode(file.content, language);
    } else {
      logger.info(`Using Docker Sandbox for ${filePath} (${language}) in repo ${repoId}`);
      // Sync the DB content to the on-disk mirror the sandbox mounts
      const git = new GitManager(repoId);
      if (!git.exists()) await git.init();
      await git.writeFile(filePath, file.content);

      const sandbox = new SandboxService(repoId);
      // The Docker sandbox has no TypeScript toolchain image — run TS as JS
      const sandboxLanguage = language === 'typescript' ? 'javascript' : language;
      result = await sandbox.runFile(filePath, sandboxLanguage as 'javascript' | 'python' | 'cpp');
    }

    const duration = Date.now() - startTime;

    // Log Execution Metrics
    await logExecutionMetric({
      repoId,
      language,
      status: (result as any).exitCode === 0 ? 'success' : 'error',
      duration
    });

    res.json(result);
  } catch (err: any) {
    logger.error(`Execution route error: ${err.message}`);
    res.status(500).json({ error: err.message || 'Execution failed' });
  }
});

export default router;
