import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { verifyRepoAccess } from '../middleware/authorize';
import { SandboxService } from '../services/sandbox';
import { PistonService } from '../services/piston';
import { detectLanguage, ExecutionError, RunnableFile } from '../services/execution';
import { supabaseAdmin } from '../lib/supabase';
import { isServerless } from '../lib/env';
import { logger } from '../utils/logger';
import { logExecutionMetric } from '../utils/audit';
import { resolveBranch, isSafeRepoPath } from '../utils/versioning';

const router = Router();

const MAX_RUN_FILES = 100;
const MAX_RUN_BYTES = 2 * 1024 * 1024;

/**
 * POST /api/execute/:repoId/run   { filePath, branchId? }
 * Runs a file from a branch. Content comes from the database (the source of
 * truth), and the branch's other files are available for imports.
 * Engine: Docker sandbox locally, Piston API on serverless (or USE_PISTON=true).
 */
router.post('/:repoId/run', requireAuth, verifyRepoAccess('read', 'repoId'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repoId = req.params.repoId as string;
    const { filePath, branchId } = req.body || {};

    if (!isSafeRepoPath(filePath)) {
      return res.status(400).json({ error: 'Missing or invalid entry file path' });
    }

    const language = detectLanguage(filePath);
    if (!language) {
      return res.status(400).json({ error: 'Unsupported language. Supported: .js, .mjs, .cjs, .ts, .py, .cpp' });
    }

    const branch = await resolveBranch(repoId, branchId);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    const { data: rows, error } = await supabaseAdmin
      .from('files')
      .select('path, content')
      .eq('repo_id', repoId)
      .eq('branch_id', branch.id)
      .limit(MAX_RUN_FILES + 1);
    if (error) throw new Error(error.message);

    const files: RunnableFile[] = (rows || [])
      .filter((f) => isSafeRepoPath(f.path))
      .map((f) => ({ path: f.path, content: f.content ?? '' }));

    if (!files.some((f) => f.path === filePath)) {
      return res.status(404).json({ error: 'File not found on this branch' });
    }
    const totalBytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.content, 'utf8'), 0);
    if (files.length > MAX_RUN_FILES || totalBytes > MAX_RUN_BYTES) {
      return res.status(413).json({ error: 'This branch is too large to execute' });
    }

    const usePiston = process.env.USE_PISTON === 'true' || isServerless;
    logger.info(`Running ${filePath} (${language}) in repo ${repoId} via ${usePiston ? 'Piston' : 'Docker'}`);

    const startTime = Date.now();
    const result = usePiston
      ? await PistonService.run(files, filePath, language)
      : await SandboxService.run(files, filePath, language);
    const duration = Date.now() - startTime;

    await logExecutionMetric({
      repoId,
      language,
      status: result.timedOut ? 'timeout' : result.exitCode === 0 ? 'success' : 'error',
      duration
    });

    res.json(result);
  } catch (err: any) {
    logger.error(`Execution route error: ${err.message}`);
    if (err instanceof ExecutionError) return res.status(502).json({ error: err.message });
    res.status(500).json({ error: 'Execution failed' });
  }
});

export default router;
