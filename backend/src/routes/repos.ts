import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { supabase } from '../index';

const router = Router();

/**
 * GET /api/repos/:id
 * Returns full repository details including owner.
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: repo, error } = await supabase
      .from('repositories')
      .select('*, owner:users(*)')
      .eq('id', id)
      .single();

    if (error || !repo) {
      res.status(404).json({ error: 'Repository not found' });
      return;
    }

    // Check visibility
    if (repo.is_private) {
      // For private repos, we would need to check auth
      // For simplicity in Phase 1-2, we assume public visibility or owner check
      // Real check would use requireAuth and compare auth.uid() == repo.owner_id
    }

    res.json(repo);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/repos/:id/files
 * Returns all files for a repository, filtered by branchId.
 */
router.get('/:id/files', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { branchId } = req.query;

    let query = supabase
      .from('files')
      .select('*')
      .eq('repo_id', id);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    } else {
      // Default to the main/default branch if no branchId provided
      const { data: defaultBranch } = await supabase
        .from('branches')
        .select('id')
        .eq('repo_id', id)
        .eq('is_default', true)
        .single();
      
      if (defaultBranch) {
        query = query.eq('branch_id', defaultBranch.id);
      }
    }

    const { data: files, error } = await query.order('path', { ascending: true });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch files' });
      return;
    }

    res.json(files || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/repos/:id/branches
 * Returns all branches for a repository.
 */
router.get('/:id/branches', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data: branches, error } = await supabase
      .from('branches')
      .select('*')
      .eq('repo_id', id)
      .order('is_default', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch branches' });
      return;
    }

    res.json(branches || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/repos/:id/branches
 * Creates a new branch from an existing point.
 */
router.post('/:id/branches', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: repoId } = req.params;
    const { name, fromBranchId } = req.body;

    // 1. Create the branch entry
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .insert({ repo_id: repoId, name })
      .select()
      .single();

    if (branchError) {
      res.status(500).json({ error: 'Failed to create branch' });
      return;
    }

    // 2. If forked from another branch, copy all its current files
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

/**
 * POST /api/repos/:id/files
 * Creates or updates a file.
 */
router.post('/:id/files', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { id: repoId } = req.params;
    const { path, content } = req.body;

    // Verify ownership
    const { data: repo } = await supabase
      .from('repositories')
      .select('owner_id')
      .eq('id', repoId)
      .single();

    if (!repo || repo.owner_id !== user.id) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const { data, error } = await supabase
      .from('files')
      .upsert({
        repo_id: repoId,
        branch_id: req.body.branchId, // Optional, defaults to main if handled correctly
        path,
        content,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to save file' });
      return;
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/repos/:id/commits
 * Creates a commit snapshot of the current branch state.
 */
router.post('/:id/commits', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { id: repoId } = req.params;
    const { message, branchId } = req.body;

    // 1. Create Commit entry
    const { data: commit, error: commitError } = await supabase
      .from('commits')
      .insert({
        repo_id: repoId,
        branch_id: branchId,
        author_id: user.id,
        message,
      })
      .select()
      .single();

    if (commitError) {
      res.status(500).json({ error: 'Failed to create commit' });
      return;
    }

    // 2. Fetch all current files for this branch
    const { data: currentFiles } = await supabase
      .from('files')
      .select('*')
      .eq('branch_id', branchId);

    if (currentFiles && currentFiles.length > 0) {
      // 3. Save Snapshots
      const snapshots = currentFiles.map(f => ({
        commit_id: commit.id,
        repo_id: repoId,
        path: f.path,
        content: f.content,
      }));
      await supabase.from('file_snapshots').insert(snapshots);

      // 4. Update branch HEAD
      await supabase
        .from('branches')
        .update({ last_commit_id: commit.id })
        .eq('id', branchId);
    }

    res.json(commit);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/repos/:id/commits
 * Returns history for a repository or branch.
 */
router.get('/:id/commits', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: repoId } = req.params;
    const { branchId } = req.query;

    let query = supabase
      .from('commits')
      .select('*, author:users(*)')
      .eq('repo_id', repoId);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data: commits, error } = await query.order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch commits' });
      return;
    }

    res.json(commits || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
