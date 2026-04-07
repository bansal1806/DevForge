import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { verifyOwnership, verifyRepoAccess } from '../middleware/authorize';
import { supabaseAdmin } from '../index';
import { GitManager } from '../utils/git';
import { migrateSqlToGit } from '../utils/migration';
import { logger } from '../utils/logger';
import { logAudit } from '../utils/audit';

const router = Router();

/**
 * POST /api/repos
 * Create a new repository and initialize Git engine
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { name, description, isPrivate } = req.body;
    const supabase = req.supabase!;

    // 1. Create entry in Supabase
    const { data: repo, error } = await supabase
      .from('repositories')
      .insert({
        name,
        description,
        is_private: isPrivate,
        owner_id: user.id,
        default_branch: 'main'
      })
      .select()
      .single();

    if (error || !repo) {
      logger.error(`Failed to create repository record: ${error?.message}`);
      return res.status(500).json({ error: 'Failed to create repository' });
    }

    // 2. Initialize physical Git repository
    const git = new GitManager(repo.id);
    await git.init();

    await supabase.from('branches').insert({
      repo_id: repo.id,
      name: 'main',
      is_default: true
    });

    // 4. Log Audit Entry
    await logAudit({
      userId: user.id,
      repoId: repo.id,
      action: 'repo_created',
      metadata: { name: repo.name }
    });

    res.status(201).json(repo);
  } catch (err: any) {
    logger.error(`Error in repo creation: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/repos
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const supabase = req.supabase!;

    const { data: repos, error } = await supabase
      .from('repositories')
      .select('*')
      .eq('owner_id', user.id)
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

/**
 * GET /api/repos/explore
 */
router.get('/explore', async (_req, res: Response) => {
  try {
    const { data: repos, error } = await supabaseAdmin
      .from('repositories')
      .select('*, owner:users(id, name, avatar_url)')
      .eq('is_private', false)
      .limit(20);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch repositories' });
      return;
    }

    res.json(repos || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/repos/:id
 * Secure read access: returns 404 if private and no access.
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // Always check as admin first to see if it's private
    const { data: repo, error } = await supabaseAdmin
      .from('repositories')
      .select('*, owner:users(*)')
      .eq('id', id)
      .single();

    if (error || !repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // IDOR Protection: If private, verify access
    if (repo.is_private) {
      if (!user) return res.status(404).json({ error: 'Repository not found' });
      
      // Check if user is owner or collaborator
      const isOwner = repo.owner_id === user.id;
      const { data: collab } = await supabaseAdmin
        .from('repo_collaborators')
        .select('permission')
        .eq('repo_id', id)
        .eq('user_id', user.id)
        .single();
        
      if (!isOwner && !collab) {
        return res.status(404).json({ error: 'Repository not found' });
      }
    }

    res.json(repo);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * File/Branch Read Access (GET)
 */
router.get('/:id/files', verifyRepoAccess('read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { branchId } = req.query;
    const git = new GitManager(id);

    // Ensure repo exists on disk (Auto-migrate if needed)
    if (!git.exists()) {
      await migrateSqlToGit(id);
    }

    // List files from Git instead of SQL
    const filePaths = await git.listFiles();
    
    // We map these to the FileNode structure for frontend compatibility
    const files = await Promise.all(filePaths.map(async (filePath) => {
      const content = await git.getFileContent(filePath);
      return {
        id: `${id}-${filePath}`, // Synthetic ID
        repo_id: id,
        path: filePath,
        content: content,
        updated_at: new Date().toISOString()
      };
    }));

    res.json(files);
  } catch (err: any) {
    logger.error(`Error fetching files for repo ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/branches', verifyRepoAccess('read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const supabase = req.supabase!;

    const { data: branches, error } = await supabase
      .from('branches')
      .select('*')
      .eq('repo_id', id)
      .order('is_default', { ascending: false });

    if (error) return res.status(500).json({ error: 'Failed to fetch branches' });
    res.json(branches || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * File/Branch Write Access (POST)
 */
router.post('/:id/branches', requireAuth, verifyRepoAccess('write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: repoId } = req.params;
    const { name, fromBranchId } = req.body;
    const supabase = req.supabase!;

    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .insert({ repo_id: repoId, name })
      .select()
      .single();

    if (branchError) return res.status(500).json({ error: 'Failed to create branch' });

    if (fromBranchId) {
      const { data: sourceFiles } = await supabase
        .from('files')
        .select('*')
        .eq('branch_id', fromBranchId);
      
      if (sourceFiles && sourceFiles.length > 0) {
        const newFiles = sourceFiles.map(f => ({
          repo_id: repoId,
          branch_id: branch.id,
          path: f.path,
          content: f.content,
        }));
        await supabase.from('files').insert(newFiles);
      }
    }

    res.json(branch);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/files', requireAuth, verifyRepoAccess('write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repoId = req.params.id as string;
    const { path: filePath, content } = req.body;
    const git = new GitManager(repoId);

    if (!git.exists()) {
      await migrateSqlToGit(repoId);
    }

    // Write to physical disk via Git manager
    await git.writeFile(filePath, content);

    res.json({ success: true, path: filePath });
  } catch (err: any) {
    logger.error(`Error writing file for repo ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'Failed to save file' });
  }
});

router.post('/:id/commits', requireAuth, verifyRepoAccess('write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const repoId = req.params.id as string;
    const { message } = req.body;
    const git = new GitManager(repoId);

    if (!git.exists()) {
      await migrateSqlToGit(repoId);
    }

    // Perform actual Git commit
    const authorName = (user.user_metadata?.full_name as string) || 'Developer';
    await git.commit(message, { name: authorName, email: user.email! });

    // We still log the commit metadata in Supabase for tracking/activity
    const supabase = req.supabase!;
    const { data: commit } = await supabase
      .from('commits')
      .insert({ 
        repo_id: repoId, 
        author_id: user.id, 
        message 
      })
      .select()
      .single();

    res.json(commit);
  } catch (err: any) {
    logger.error(`Error committing for repo ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'Failed to create commit' });
  }
});

/**
 * Admin Only Access (PATCH/DELETE)
 */
router.patch('/:id', requireAuth, verifyOwnership('repositories'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id;
    const { name, description, is_private, default_branch } = req.body;
    const supabase = req.supabase!;

    const { data: updatedRepo, error: updateError } = await supabase
      .from('repositories')
      .update({ name, description, is_private, default_branch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) return res.status(500).json({ error: 'Failed to update repository' });

    // Log Audit Entry
    await logAudit({
      userId: req.user!.id,
      repoId: id as string,
      action: 'repo_updated',
      metadata: { changes: req.body }
    });

    res.json(updatedRepo);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireAuth, verifyOwnership('repositories'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const supabase = req.supabase!;

    const { error: deleteError } = await supabase.from('repositories').delete().eq('id', id);
    if (deleteError) return res.status(500).json({ error: 'Failed to delete repository' });

    // Log Audit Entry
    await logAudit({
      userId: req.user!.id,
      repoId: id as string,
      action: 'repo_deleted',
      metadata: { repoId: id }
    });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Collaborator Management
 */
router.get('/:id/collaborators', requireAuth, verifyRepoAccess('read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const supabase = req.supabase!;

    const { data: collaborators, error } = await supabase
      .from('repo_collaborators')
      .select('*, user:users(id, name, email)')
      .eq('repo_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(collaborators);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list collaborators' });
  }
});

router.post('/:id/collaborators', requireAuth, verifyOwnership('repositories'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { email, permission = 'write' } = req.body;
    const supabase = req.supabase!;

    const { data: targetUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (userError || !targetUser) return res.status(404).json({ error: 'User with that email not found' });

    const { data: collaborator, error: insertError } = await supabase
      .from('repo_collaborators')
      .insert({ repo_id: id, user_id: targetUser.id, permission })
      .select('*, user:users(id, name, email)')
      .single();

    if (insertError) {
      if (insertError.code === '23505') return res.status(400).json({ error: 'User is already a collaborator' });
      throw insertError;
    }

    res.status(201).json(collaborator);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to add collaborator' });
  }
});

export default router;
