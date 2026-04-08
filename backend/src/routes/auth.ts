import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../index';
import { logAuth } from '../utils/logger';

const router = Router();

/**
 * POST /api/auth/signup
 */
router.post('/signup', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    logger.info(`Attempting proxied signUp for ${email}`);

    const { data, error } = await supabaseAdmin.auth.signUp({
      email,
      password,
      options: { 
        data: { full_name: name || '' },
        emailRedirectTo: process.env.FRONTEND_URL || 'http://localhost:5173'
      }
    });

    if (error) {
      logger.error(`Supabase signUp error for ${email}: ${error.message}`, { 
        status: error.status,
        code: error.code 
      });
      logAuth(email, 'failure', `Signup failed: ${error.message}`);
      return res.status(error.status || 400).json({ error: error.message });
    }

    if (!data.user) {
      logger.warn(`Supabase signUp returned no user for ${email}. Check your Supabase project settings.`);
      return res.status(400).json({ error: 'Registration succeeded but no user was returned. Verification might be required.' });
    }

    logAuth(email, 'success', 'User registered via proxied auth');
    res.status(201).json(data);
  } catch (err: any) {
    logger.error(`Unhandled registration error: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logAuth(email, 'failure', `Login failed: ${error.message}`);
      return res.status(error.status || 401).json({ error: 'Invalid email or password' });
    }

    logAuth(email, 'success', 'User logged in via proxied auth');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const supabase = req.supabase!;

    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
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
 */
router.put('/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const supabase = req.supabase!;
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
