import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../index';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    user_metadata: Record<string, unknown>;
  };
  supabase?: SupabaseClient; // User-scoped client
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
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    // 1. Verify token with Supabase Admin
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // 2. Attach user data
    req.user = {
      id: data.user.id,
      email: data.user.email || '',
      user_metadata: data.user.user_metadata || {},
    };

    // 3. Create a user-scoped Supabase client that respects RLS
    // This client uses the user's JWT instead of the service role key
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
    
    req.supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    next();
  } catch (err) {
    console.error('Auth Middleware Error:', err);
    res.status(500).json({ error: 'Authentication service error' });
  }
}
