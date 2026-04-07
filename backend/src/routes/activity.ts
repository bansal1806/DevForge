import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../index';

const router = Router();

/**
 * GET /api/activity
 * Returns a unified feed of recent activities (commits, PRs, issues) for the authenticated user.
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const supabase = req.supabase!;
    
    // Fetch latest commits
    const { data: commits } = await supabase
      .from('commits')
      .select('*, repo:repositories(name), author:users(name, avatar_url)')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    // Fetch latest PRs
    const { data: prs } = await supabase
      .from('pull_requests')
      .select('*, repo:repositories(name), author:users(name, avatar_url)')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    // Fetch latest Issues
    const { data: issues } = await supabase
      .from('issues')
      .select('*, repo:repositories(name), author:users(name, avatar_url)')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    // Merge and sort
    const activity = [
      ...(commits || []).map(c => ({ ...c, type: 'commit' })),
      ...(prs || []).map(p => ({ ...p, type: 'pr' })),
      ...(issues || []).map(i => ({ ...i, type: 'issue' })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
