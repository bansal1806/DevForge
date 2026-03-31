import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { supabase } from '../index';

const router = Router();

/**
 * GET /api/users/:id
 * Returns a public user profile by ID.
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

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

    const { data: repos, error } = await supabase
      .from('repositories')
      .select('id, name, description, is_private, created_at, updated_at')
      .eq('owner_id', id)
      .eq('is_private', false)
      .order('updated_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch repositories' });
      return;
    }

    res.json(repos || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
