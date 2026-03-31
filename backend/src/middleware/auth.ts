import { Request, Response, NextFunction } from 'express';
import { supabase } from '../index';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    user_metadata: Record<string, unknown>;
  };
}

/**
 * Middleware to verify Supabase JWT from Authorization header.
 * Attaches user object to req.user on success.
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
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.user = {
      id: data.user.id,
      email: data.user.email || '',
      user_metadata: data.user.user_metadata || {},
    };

    next();
  } catch (err) {
    res.status(500).json({ error: 'Authentication service error' });
  }
}
