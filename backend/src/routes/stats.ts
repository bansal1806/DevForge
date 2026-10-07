import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { logger } from '../utils/logger';

const router = Router();

const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; body: PlatformStats } | null = null;

export interface PlatformStats {
  publicRepositories: number;
  commits: number;
  mergedPullRequests: number;
  developers: number;
}

async function count(table: string, filter?: (q: any) => any): Promise<number> {
  let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
  if (filter) query = filter(query);
  const { count: n, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return n || 0;
}

/**
 * GET /api/stats — real platform totals for the landing page.
 * Aggregate counts only (nothing private is revealed); cached for 5 minutes.
 */
router.get('/', async (_req, res) => {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.json(cache.body);
    }

    const [publicRepositories, commits, mergedPullRequests, developers] = await Promise.all([
      count('repositories', (q) => q.eq('is_private', false)),
      count('commits'),
      count('pull_requests', (q) => q.eq('status', 'merged')),
      count('users'),
    ]);

    const body: PlatformStats = { publicRepositories, commits, mergedPullRequests, developers };
    cache = { at: Date.now(), body };
    res.set('Cache-Control', 'public, max-age=300');
    res.json(body);
  } catch (err: any) {
    logger.error(`Stats failed: ${err.message}`);
    res.status(503).json({ error: 'Stats are temporarily unavailable' });
  }
});

/** Test hook: clears the in-memory cache. */
export function resetStatsCache() {
  cache = null;
}

export default router;
