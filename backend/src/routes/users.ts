import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../index';

const router = Router();

/**
 * GET /api/users/:id
 * Returns a public user profile by ID.
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const supabase = req.supabase || supabaseAdmin;

    const { data: profile, error } = await supabase
      .from('users')
      .select('id, name, avatar_url, bio, created_at')
      .eq('id', id)
      .single();

    if (error || !profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/users/:id/repos
 * Returns public repositories for a user.
 */
router.get('/:id/repos', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const supabase = req.supabase || supabaseAdmin;

    const { data: repos, error } = await supabase
      .from('repositories')
      .select('id, name, description, is_private, created_at, updated_at, stars(count)')
      .eq('owner_id', id)
      .eq('is_private', false)
      .order('updated_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch repositories' });
      return;
    }

    res.json((repos || []).map((repo: any) => {
      const { stars, ...rest } = repo;
      return { ...rest, stars_count: Array.isArray(stars) ? stars[0]?.count || 0 : 0 };
    }));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/users/:id/activity
 * Recent public activity for a user's profile page.
 */
router.get('/:id/activity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: logs, error } = await supabaseAdmin
      .from('audit_logs')
      .select('id, user_id, repo_id, action, metadata, created_at, repository:repositories(name, is_private)')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch activity' });
      return;
    }

    // Only expose activity on public repositories, mapped to the timeline
    // shape the profile page renders (type: commit | pr | issue).
    const typeByAction: Record<string, 'commit' | 'pr' | 'issue'> = {
      commit_created: 'commit',
      repo_created: 'commit',
      pr_merged: 'pr',
    };

    const activity = (logs || [])
      .filter((log: any) => !log.repository || !log.repository.is_private)
      .filter((log: any) => typeByAction[log.action])
      .map((log: any) => ({
        id: log.id,
        type: typeByAction[log.action],
        message: log.action === 'repo_created'
          ? `Created repository ${log.metadata?.name || ''}`.trim()
          : log.metadata?.message,
        title: log.metadata?.title,
        repo_id: log.repo_id,
        repo: log.repository ? { name: log.repository.name } : undefined,
        created_at: log.created_at,
      }));

    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
