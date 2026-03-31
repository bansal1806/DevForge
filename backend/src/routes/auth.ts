import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { supabase } from '../index';

const router = Router();

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile.
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;

    // Fetch extended profile from our users table
    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = row not found, which is okay for new users
      res.status(500).json({ error: 'Failed to fetch profile' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: profile?.name || user.user_metadata?.full_name || '',
      avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || '',
      bio: profile?.bio || '',
      created_at: profile?.created_at || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/auth/profile
 * Updates the authenticated user's profile.
 */
router.put('/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { name, bio, avatar_url } = req.body;

    const { data, error } = await supabase
      .from('users')
      .upsert({
        id: user.id,
        email: user.email,
        name: name || '',
        bio: bio || '',
        avatar_url: avatar_url || '',
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to update profile' });
      return;
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
