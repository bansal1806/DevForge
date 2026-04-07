import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { verifyRepoAccess } from '../middleware/authorize';
import { SandboxService } from '../services/sandbox';
import { logger } from '../utils/logger';
import { logExecutionMetric } from '../utils/audit';

const router = Router();

/**
 * POST /api/execute/:repoId/run
 */
router.post('/:repoId/run', requireAuth, verifyRepoAccess('read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repoId = req.params.repoId as string;
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'Missing entry file path' });
    }

    // Determine language from file extension
    const ext = filePath.split('.').pop()?.toLowerCase();
    let language: 'javascript' | 'python' | 'cpp' | undefined;

    if (['js', 'ts', 'mjs'].includes(ext!)) language = 'javascript';
    else if (['py'].includes(ext!)) language = 'python';
    else if (['cpp', 'cc', 'cxx'].includes(ext!)) language = 'cpp';

    if (!language) {
      return res.status(400).json({ error: 'Unsupported language for execution' });
    }

    const sandbox = new SandboxService(repoId);
    logger.info(`Requesting execution for ${filePath} (${language}) in repo ${repoId}`);

    const startTime = Date.now();
    const result = await sandbox.runFile(filePath, language!);
    const duration = Date.now() - startTime;

    // Log Execution Metrics
    await logExecutionMetric({
      repoId,
      language: language!,
      status: result.exitCode === 0 ? 'success' : 'error',
      duration
    });
    
    res.json(result);
  } catch (err: any) {
    logger.error(`Execution route error: ${err.message}`);
    res.status(500).json({ error: err.message || 'Execution failed' });
  }
});

export default router;
