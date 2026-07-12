import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';
import { supabaseAdmin } from '../index';
import { SandboxService } from '../services/sandbox';
import { logger } from '../utils/logger';

const router = Router();

// All admin endpoints require the platform 'admin' role (users.role)
router.use(requireAuth, requireAdmin);

/**
 * GET /api/admin/system-health
 * High-fidelity health check for all core infrastructure
 */
router.get('/system-health', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const health = {
      api: 'online',
      supabase: 'unknown',
      docker: 'unknown',
      timestamp: new Date().toISOString()
    };

    // 1. Check Supabase
    const { error: dbError } = await supabaseAdmin.from('users').select('id').limit(1);
    health.supabase = dbError ? 'error' : 'online';

    // 2. Check Docker
    try {
       const isDockerHealthy = await SandboxService.checkHealth();
       health.docker = isDockerHealthy ? 'online' : 'offline';
    } catch (err) {
      health.docker = 'offline';
    }

    res.json(health);
  } catch (err: any) {
    logger.error(`Health check failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch system health' });
  }
});

/**
 * GET /api/admin/metrics
 * Site-wide usage and storage analytics
 */
router.get('/metrics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 1. Execution Ratios
    const { data: stats, error: statsError } = await supabaseAdmin
      .from('execution_stats')
      .select('language, status, duration');

    // 2. User Count
    const { count: userCount } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true });

    // 3. Repo Count
    const { count: repoCount } = await supabaseAdmin
      .from('repositories')
      .select('*', { count: 'exact', head: true });

    if (statsError) throw statsError;

    res.json({
      executions: stats || [],
      users: userCount,
      repos: repoCount,
    });
  } catch (err: any) {
    logger.error(`Metrics fetch failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * GET /api/admin/logs
 * Global activity feed
 */
router.get('/logs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: logs, error } = await supabaseAdmin
      .from('audit_logs')
      .select('*, user:users(name, email), repository:repositories(name)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(logs || []);
  } catch (err: any) {
    logger.error(`Audit logs fetch failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
