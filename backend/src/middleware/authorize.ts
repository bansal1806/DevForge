import { Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { AuthenticatedRequest } from './auth';
import { isDemoEmail } from '../lib/env';
import { logger } from '../utils/logger';

export type RepoLevel = 'read' | 'write' | 'admin';

const LEVEL_RANK: Record<RepoLevel, number> = { read: 1, write: 2, admin: 3 };

export interface RepoAccess {
  /** 0 = none, 1 = read, 2 = write, 3 = admin/owner */
  rank: number;
  exists: boolean;
  isPrivate: boolean;
  isOwner: boolean;
}

/**
 * Effective access of a user (or anonymous visitor) to a repository.
 * Mirrors private.repo_access_level() in migration 009.
 */
export async function getRepoAccess(repoId: string, userId?: string): Promise<RepoAccess> {
  const { data: repo } = await supabaseAdmin
    .from('repositories')
    .select('owner_id, is_private')
    .eq('id', repoId)
    .maybeSingle();

  if (!repo) return { rank: 0, exists: false, isPrivate: true, isOwner: false };

  let rank = repo.is_private ? 0 : 1;
  const isOwner = !!userId && repo.owner_id === userId;

  if (isOwner) {
    rank = 3;
  } else if (userId) {
    const { data: collab } = await supabaseAdmin
      .from('repo_collaborators')
      .select('permission')
      .eq('repo_id', repoId)
      .eq('user_id', userId)
      .maybeSingle();
    if (collab) rank = Math.max(rank, LEVEL_RANK[collab.permission as RepoLevel] || 0);
  }

  return { rank, exists: true, isPrivate: repo.is_private, isOwner };
}

export function hasLevel(access: RepoAccess, level: RepoLevel) {
  return access.rank >= LEVEL_RANK[level];
}

/**
 * Sends the appropriate denial for a repo-scoped resource. Private resources
 * the caller cannot read are reported as 404 to prevent enumeration.
 */
export function denyRepoAccess(res: Response, access: RepoAccess, level: RepoLevel, authenticated: boolean, notFound = 'Repository not found') {
  if (!access.exists || access.rank === 0) return res.status(404).json({ error: notFound });
  if (!authenticated) return res.status(401).json({ error: 'Authentication required' });
  return res.status(403).json({ error: `Permission denied: ${level} access required` });
}

/**
 * Validates that the logged-in user is the owner of a specific resource.
 * @param table - Database table name
 * @param idParam - req.params key for the resource ID
 * @param ownerColumn - Database column name for the owner ID (default: 'owner_id')
 */
export const verifyOwnership = (table: string, idParam: string = 'id', ownerColumn: string = 'owner_id') => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      const resourceId = req.params[idParam];

      if (!user) return res.status(401).json({ error: 'Authentication required' });
      if (!resourceId) return res.status(400).json({ error: `${idParam} is required` });

      const { data: resource, error } = await supabaseAdmin
        .from(table)
        .select(ownerColumn)
        .eq('id', resourceId)
        .maybeSingle();

      if (error || !resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      if ((resource as any)[ownerColumn] !== user.id) {
        return res.status(403).json({ error: 'Permission denied: ownership required' });
      }

      next();
    } catch (err: any) {
      logger.error(`Authorization Error [${table}]: ${err.message}`);
      res.status(500).json({ error: 'Internal server error during authorization' });
    }
  };
};

/**
 * Validates that the logged-in user has the platform 'admin' role
 * (users.role, added in migration 008). Use after requireAuth.
 */
export const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile, error } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied: administrator role required' });
    }

    next();
  } catch (err: any) {
    logger.error(`Admin Authorization Error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error during authorization' });
  }
};

/**
 * Blocks the shared demo account from destructive or account-level actions
 * (deleting repos, changing visibility, managing collaborators, editing the
 * profile) so one visitor cannot ruin the demo for the next.
 */
export const blockDemoUser = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (isDemoEmail(req.user?.email)) {
    return res.status(403).json({ error: 'This action is disabled for the shared demo account. Sign up to try it!' });
  }
  next();
};

/**
 * Validates that the caller has at least the required permission level for a
 * repository. Public repos are readable anonymously (pair with optionalAuth).
 */
export const verifyRepoAccess = (level: RepoLevel = 'read', idParam: string = 'id') => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const repoId = req.params[idParam];
      if (!repoId) return res.status(400).json({ error: 'Repository ID is required' });

      const access = await getRepoAccess(repoId as string, req.user?.id);
      if (!hasLevel(access, level)) return denyRepoAccess(res, access, level, !!req.user);

      next();
    } catch (err: any) {
      logger.error(`Repo Authorization Error: ${err.message}`);
      res.status(500).json({ error: 'Internal server error during authorization' });
    }
  };
};
