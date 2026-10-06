import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { blockDemoUser } from '../middleware/authorize';
import { supabaseAdmin, createAuthClient } from '../lib/supabase';
import { logAuth, logger } from '../utils/logger';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function demoCredentials() {
  return {
    email: process.env.DEMO_USER_EMAIL || 'demo@devforge.example.com',
    password: process.env.DEMO_USER_PASSWORD || 'devforge-demo-2026!',
  };
}

/** Only the fields the frontend needs to establish a session. */
function sessionPayload(data: { session: any; user: any }) {
  return {
    session: data.session && {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    },
    user: data.user && { id: data.user.id, email: data.user.email },
  };
}

/**
 * POST /api/auth/signup
 */
router.post('/signup', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, name } = req.body || {};

    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > 72) {
      return res.status(400).json({ error: `Password must be between ${MIN_PASSWORD_LENGTH} and 72 characters` });
    }
    if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
      return res.status(400).json({ error: 'Name must be at most 100 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await createAuthClient().auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { full_name: (name || '').trim() },
        emailRedirectTo: (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim(),
      },
    });

    if (error) {
      logger.warn(`Supabase signUp error: ${error.message}`, { status: error.status, code: error.code });
      logAuth(normalizedEmail, 'failure', `Signup failed: ${error.code || error.message}`);
      // Password policy errors are safe and useful to show; anything else
      // (notably "already registered") is generic to prevent account enumeration.
      if (error.code === 'weak_password') {
        return res.status(400).json({ error: error.message });
      }
      return res.status(400).json({ error: 'Unable to create an account with those details.' });
    }

    logAuth(normalizedEmail, 'success', 'User registered via proxied auth');
    // Same response whether or not email confirmation is required / the
    // account already existed, so the endpoint can't be used to probe emails.
    res.status(201).json({
      message: 'Registration received. Check your email if confirmation is required, then sign in.',
      confirmed: !!data.session,
    });
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
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await createAuthClient().auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data.session) {
      logAuth(normalizedEmail, 'failure', `Login failed: ${error?.code || 'no session'}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    logAuth(normalizedEmail, 'success', 'User logged in via proxied auth');
    res.json(sessionPayload(data));
  } catch (err: any) {
    logger.error(`Unhandled login error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

/**
 * POST /api/auth/demo
 * One-click guest access to a shared demo account. Self-healing: the account
 * is created on first use, and if a visitor changed its password through the
 * Supabase API the password is reset before signing in.
 */
router.post('/demo', async (_req, res: Response) => {
  try {
    const { email, password } = demoCredentials();
    const signIn = () => createAuthClient().auth.signInWithPassword({ email, password });

    let { data, error } = await signIn();

    if (error) {
      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      const { error: provisionError } = existing
        ? await supabaseAdmin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
        : await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: 'Demo Explorer' },
          });

      if (provisionError) {
        logger.error(`Demo user provisioning failed: ${provisionError.message}`);
        return res.status(503).json({ error: 'Demo access is temporarily unavailable' });
      }

      ({ data, error } = await signIn());
      if (error || !data.session) {
        logAuth(email, 'failure', `Demo login failed: ${error?.message}`);
        return res.status(503).json({ error: 'Demo access is temporarily unavailable' });
      }
    }

    logAuth(email, 'success', 'Demo user logged in');
    res.json(sessionPayload(data));
  } catch (err: any) {
    logger.error(`Unhandled demo login error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error during demo login' });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;

    const { data: profile, error } = await supabaseAdmin
      .from('users')
      .select('name, avatar_url, bio, role, created_at')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: 'Failed to fetch profile' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: profile?.name || (user.user_metadata?.full_name as string) || '',
      avatar_url: profile?.avatar_url || (user.user_metadata?.avatar_url as string) || '',
      bio: profile?.bio || '',
      role: profile?.role || 'user',
      created_at: profile?.created_at || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/auth/profile
 * Updates only the caller's display fields (never role/email).
 */
router.put('/profile', requireAuth, blockDemoUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { name, bio, avatar_url } = req.body || {};

    if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
      return res.status(400).json({ error: 'Name must be at most 100 characters' });
    }
    if (bio !== undefined && (typeof bio !== 'string' || bio.length > 500)) {
      return res.status(400).json({ error: 'Bio must be at most 500 characters' });
    }
    if (avatar_url !== undefined && avatar_url !== '' &&
        (typeof avatar_url !== 'string' || avatar_url.length > 2048 || !/^https:\/\//i.test(avatar_url))) {
      return res.status(400).json({ error: 'Avatar URL must be an https:// URL' });
    }

    const fields = {
      ...(name !== undefined && { name: name.trim() }),
      ...(bio !== undefined && { bio: bio.trim() }),
      ...(avatar_url !== undefined && { avatar_url }),
      updated_at: new Date().toISOString(),
    };

    // The signup trigger creates the row; insert it for legacy accounts that predate it.
    const { data, error } = await supabaseAdmin
      .from('users')
      .upsert({ id: user.id, email: user.email, ...fields }, { onConflict: 'id' })
      .select('id, name, avatar_url, bio, created_at')
      .single();

    if (error) {
      logger.error(`Profile update failed: ${error.message}`);
      res.status(500).json({ error: 'Failed to update profile' });
      return;
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
