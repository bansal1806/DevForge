import { Request, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin, createUserScopedClient } from '../lib/supabase';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    user_metadata: Record<string, unknown>;
  };
  supabase?: SupabaseClient; // User-scoped client (RLS enforced)
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/** Verifies a Supabase access token and returns the user, or null. */
export async function verifyAccessToken(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email || '',
    user_metadata: data.user.user_metadata || {},
  };
}

/**
 * Like requireAuth, but anonymous requests pass through with req.user unset.
 * Use on routes that serve public resources but personalize for logged-in users.
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = bearerToken(req);

  if (token) {
    try {
      const user = await verifyAccessToken(token);
      if (user) {
        req.user = user;
        req.supabase = createUserScopedClient(token);
      }
    } catch {
      // Invalid token on an optional route — treat as anonymous.
    }
  }

  next();
}

/**
 * Middleware to verify Supabase JWT from Authorization header.
 * Attaches user object and a user-scoped Supabase client to the request.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = bearerToken(req);

  if (!token) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  try {
    const user = await verifyAccessToken(token);

    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.user = user;
    req.supabase = createUserScopedClient(token);

    next();
  } catch (err: any) {
    logger.error(`Auth Middleware Error: ${err.message}`);
    res.status(500).json({ error: 'Authentication service error' });
  }
}
