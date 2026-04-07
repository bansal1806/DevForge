import { Response, NextFunction } from 'express';
import { supabaseAdmin } from '../index';
import { AuthenticatedRequest } from './auth';

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

      // Use supabaseAdmin to check ownership (bypassing user-scoped RLS to perform a raw check)
      const { data: resource, error } = await supabaseAdmin
        .from(table)
        .select(ownerColumn)
        .eq('id', resourceId)
        .single();

      if (error || !resource) {
        // Industry standard: return 404 for unauthorized access to private resources to prevent enumeration
        return res.status(404).json({ error: 'Resource not found' });
      }

      const actualOwnerId = (resource as any)[ownerColumn];

      if (actualOwnerId !== user.id) {
        return res.status(403).json({ error: 'Permission denied: ownership required' });
      }

      next();
    } catch (err) {
      console.error(`Authorization Error [${table}]:`, err);
      res.status(500).json({ error: 'Internal server error during authorization' });
    }
  };
};

/**
 * Validates that the user has at least the required permission level for a repository.
 * Handles owner (implicit admin) and collaborator roles.
 */
export const verifyRepoAccess = (level: 'read' | 'write' | 'admin' = 'read', idParam: string = 'id') => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      const repoId = req.params[idParam];

      if (!user) return res.status(401).json({ error: 'Authentication required' });
      if (!repoId) return res.status(400).json({ error: 'Repository ID is required' });

      // 1. Check if user is the Owner
      const { data: repo, error: repoError } = await supabaseAdmin
        .from('repositories')
        .select('owner_id, is_private')
        .eq('id', repoId)
        .single();

      if (repoError || !repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      if (repo.owner_id === user.id) {
        return next(); // Owner has full access
      }

      // 2. Check if user is a Collaborator
      const { data: collab, error: collabError } = await supabaseAdmin
        .from('repo_collaborators')
        .select('permission')
        .eq('repo_id', repoId)
        .eq('user_id', user.id)
        .single();

      if (collabError || !collab) {
        // If it's a private repo and use is not owner/collab, return 404
        return res.status(404).json({ error: 'Repository not found' });
      }

      // 3. Permission Level Check
      const roles = ['read', 'write', 'admin'];
      const userLevelIndex = roles.indexOf(collab.permission);
      const requiredLevelIndex = roles.indexOf(level);

      if (userLevelIndex < requiredLevelIndex) {
        return res.status(403).json({ error: `Permission denied: ${level} access required` });
      }

      next();
    } catch (err) {
      console.error('Repo Authorization Error:', err);
      res.status(500).json({ error: 'Internal server error during authorization' });
    }
  };
};
