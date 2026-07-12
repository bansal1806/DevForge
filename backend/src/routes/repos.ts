import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth, optionalAuth } from '../middleware/auth';
import { verifyOwnership, verifyRepoAccess } from '../middleware/authorize';
import { supabaseAdmin } from '../index';
import { GitManager } from '../utils/git';
import { logger } from '../utils/logger';
import { logAudit } from '../utils/audit';
import {
  getDefaultBranch,
  getBranchById,
  createCommitWithSnapshots,
  isSafeRepoPath,
} from '../utils/versioning';

const router = Router();

// Supabase SQL is the source of truth for file content and history.
// On long-running hosts we also mirror writes into a real on-disk git repo
// (used by the local Docker sandbox); serverless filesystems are read-only.
const gitMirrorEnabled = !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME;

async function mirrorToGit(repoId: string, action: (git: GitManager) => Promise<void>) {
  if (!gitMirrorEnabled) return;
  try {
    const git = new GitManager(repoId);
    if (!git.exists()) await git.init();
    await action(git);
  } catch (err: any) {
    logger.warn(`Git mirror skipped for repo ${repoId}: ${err.message}`);
  }
}

function mapStarsCount(repo: any) {
  if (!repo) return repo;
  const { stars, ...rest } = repo;
  return { ...rest, stars_count: Array.isArray(stars) ? stars[0]?.count || 0 : 0 };
}

/**
 * POST /api/repos
 * Create a repository with a default branch, README, and initial commit.
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { name, description, isPrivate } = req.body;
    const supabase = req.supabase!;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Repository name is required' });
    }

    const { data: repo, error } = await supabase
      .from('repositories')
      .insert({
        name: name.trim(),
        description,
        is_private: !!isPrivate,
        owner_id: user.id,
        default_branch: 'main'
      })
      .select()
      .single();

    if (error || !repo) {
      logger.error(`Failed to create repository record: ${error?.message}`);
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'You already have a repository with that name' });
      }
      return res.status(500).json({ error: 'Failed to create repository' });
    }

    const { data: branch, error: branchError } = await supabaseAdmin
      .from('branches')
      .insert({ repo_id: repo.id, name: 'main', is_default: true })
      .select()
      .single();

    if (branchError || !branch) {
      logger.error(`Failed to create default branch: ${branchError?.message}`);
      return res.status(500).json({ error: 'Failed to initialize repository branch' });
    }

    // Seed a README so the repo is never empty and PR diffs have a baseline
    const readmeContent = `# ${repo.name}\n\n${description || 'Created with DevForge.'}\n`;
    await supabaseAdmin.from('files').insert({
      repo_id: repo.id,
      branch_id: branch.id,
      path: 'README.md',
      content: readmeContent,
    });

    await createCommitWithSnapshots(repo.id, branch.id, user.id, 'Initial commit');

    await mirrorToGit(repo.id, async (git) => {
      await git.writeFile('README.md', readmeContent);
      await git.commit('Initial commit', {
        name: (user.user_metadata?.full_name as string) || 'Developer',
        email: user.email,
      });
    });

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
      .select('*, stars(count)')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch repositories' });
      return;
    }

    res.json((repos || []).map(mapStarsCount));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/repos/explore?q=<search>
 */
router.get('/explore', async (req, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    let query = supabaseAdmin
      .from('repositories')
      .select('*, owner:users(id, name, avatar_url), stars(count)')
      .eq('is_private', false);

    if (q) {
      query = query.or(`name.ilike.%${q.replace(/[%,()]/g, '')}%,description.ilike.%${q.replace(/[%,()]/g, '')}%`);
    }

    const { data: repos, error } = await query
      .order('updated_at', { ascending: false })
      .limit(30);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch repositories' });
      return;
    }

    res.json((repos || []).map(mapStarsCount));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/repos/starred
 * Repositories starred by the current user.
 */
router.get('/starred', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;

    const { data: rows, error } = await supabaseAdmin
      .from('stars')
      .select('created_at, repo:repositories(*, owner:users(id, name, avatar_url), stars(count))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Failed to fetch starred repositories' });

    const repos = (rows || [])
      .map((r: any) => r.repo)
      .filter(Boolean)
      // Never surface private repos the user has since lost access to
      .filter((repo: any) => !repo.is_private || repo.owner_id === user.id)
      .map(mapStarsCount);

    res.json(repos);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/repos/:id
 * Secure read access: returns 404 if private and no access.
 */
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Always check as admin first to see if it's private
    const { data: repo, error } = await supabaseAdmin
      .from('repositories')
      .select('*, owner:users(*), stars(count)')
      .eq('id', id)
      .single();

    if (error || !repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // IDOR Protection: If private, verify access
    if (repo.is_private) {
      if (!user) return res.status(404).json({ error: 'Repository not found' });

      const isOwner = repo.owner_id === user.id;
      const { data: collab } = await supabaseAdmin
        .from('repo_collaborators')
        .select('permission')
        .eq('repo_id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!isOwner && !collab) {
        return res.status(404).json({ error: 'Repository not found' });
      }
    }

    let starredByMe = false;
    if (user) {
      const { data: myStar } = await supabaseAdmin
        .from('stars')
        .select('id')
        .eq('repo_id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      starredByMe = !!myStar;
    }

    res.json({ ...mapStarsCount(repo), starred_by_me: starredByMe });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/repos/:id/star
 * Toggle a star on a repository.
 */
router.post('/:id/star', requireAuth, verifyRepoAccess('read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const { data: existing } = await supabaseAdmin
      .from('stars')
      .select('id')
      .eq('repo_id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin.from('stars').delete().eq('id', existing.id);
    } else {
      await supabaseAdmin.from('stars').insert({ repo_id: id, user_id: user.id });
    }

    const { count } = await supabaseAdmin
      .from('stars')
      .select('*', { count: 'exact', head: true })
      .eq('repo_id', id);

    res.json({ starred: !existing, stars_count: count || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle star' });
  }
});

/**
 * GET /api/repos/:id/files?branchId=<uuid>
 * Reads file content from SQL (branch-scoped).
 */
router.get('/:id/files', optionalAuth, verifyRepoAccess('read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    let branchId = typeof req.query.branchId === 'string' ? req.query.branchId : '';

    if (!branchId) {
      const defaultBranch = await getDefaultBranch(id);
      branchId = defaultBranch?.id || '';
    }

    let query = supabaseAdmin.from('files').select('*').eq('repo_id', id).order('path');
    const { data: files, error } = branchId
      ? await query.eq('branch_id', branchId)
      : await query;

    if (error) throw new Error(error.message);

    // Legacy fallback: rows created before branching landed have no branch_id
    if ((!files || files.length === 0) && branchId) {
      const { data: legacy } = await supabaseAdmin
        .from('files')
        .select('*')
        .eq('repo_id', id)
        .is('branch_id', null)
        .order('path');
      return res.json(legacy || []);
    }

    res.json(files || []);
  } catch (err: any) {
    logger.error(`Error fetching files for repo ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/branches', optionalAuth, verifyRepoAccess('read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: branches, error } = await supabaseAdmin
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
 * GET /api/repos/:id/commits?branchId=<uuid>
 */
router.get('/:id/commits', optionalAuth, verifyRepoAccess('read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : '';

    let query = supabaseAdmin
      .from('commits')
      .select('*, author:users(id, name, avatar_url)')
      .eq('repo_id', id);
    if (branchId) query = query.eq('branch_id', branchId);

    const { data: commits, error } = await query.order('created_at', { ascending: false }).limit(50);
    if (error) return res.status(500).json({ error: 'Failed to fetch commits' });
    res.json(commits || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/repos/:id/metrics
 * Execution stats for this repository (feeds the Insights tab).
 */
router.get('/:id/metrics', optionalAuth, verifyRepoAccess('read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: stats, error } = await supabaseAdmin
      .from('execution_stats')
      .select('*')
      .eq('repo_id', id)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) return res.status(500).json({ error: 'Failed to fetch metrics' });
    res.json(stats || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/repos/:id/branches
 * Creates a branch from an existing one, copying its files and commit pointer.
 */
router.post('/:id/branches', requireAuth, verifyRepoAccess('write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repoId = req.params.id as string;
    const { name, fromBranchId } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Branch name is required' });
    }

    const sourceBranch = fromBranchId
      ? await getBranchById(repoId, fromBranchId)
      : await getDefaultBranch(repoId);

    const { data: branch, error: branchError } = await supabaseAdmin
      .from('branches')
      .insert({
        repo_id: repoId,
        name: name.trim(),
        // Same commit pointer as the source → a fresh branch diffs as "no changes"
        last_commit_id: sourceBranch?.last_commit_id || null,
      })
      .select()
      .single();

    if (branchError) {
      if (branchError.code === '23505') {
        return res.status(409).json({ error: 'A branch with that name already exists' });
      }
      return res.status(500).json({ error: 'Failed to create branch' });
    }

    if (sourceBranch) {
      const { data: sourceFiles } = await supabaseAdmin
        .from('files')
        .select('path, content')
        .eq('repo_id', repoId)
        .eq('branch_id', sourceBranch.id);

      if (sourceFiles && sourceFiles.length > 0) {
        const newFiles = sourceFiles.map(f => ({
          repo_id: repoId,
          branch_id: branch.id,
          path: f.path,
          content: f.content,
        }));
        const { error: copyError } = await supabaseAdmin.from('files').insert(newFiles);
        if (copyError) logger.error(`Branch file copy failed: ${copyError.message}`);
      }
    }

    res.status(201).json(branch);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/repos/:id/files
 * Save (upsert) a file on a branch.
 */
router.post('/:id/files', requireAuth, verifyRepoAccess('write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repoId = req.params.id as string;
    const { path: filePath, content, branchId } = req.body;

    if (!isSafeRepoPath(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const branch = branchId
      ? await getBranchById(repoId, branchId)
      : await getDefaultBranch(repoId);

    if (!branch) {
      return res.status(400).json({ error: 'Target branch not found' });
    }

    const { data: file, error } = await supabaseAdmin
      .from('files')
      .upsert(
        {
          repo_id: repoId,
          branch_id: branch.id,
          path: filePath,
          content: content ?? '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'repo_id,branch_id,path' }
      )
      .select()
      .single();

    if (error) {
      logger.error(`Error saving file for repo ${repoId}: ${error.message}`);
      return res.status(500).json({ error: 'Failed to save file' });
    }

    await mirrorToGit(repoId, (git) => git.writeFile(filePath, content ?? ''));

    res.json(file);
  } catch (err: any) {
    logger.error(`Error writing file for repo ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'Failed to save file' });
  }
});

/**
 * DELETE /api/repos/:id/files
 * Remove a file from a branch.
 */
router.delete('/:id/files', requireAuth, verifyRepoAccess('write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repoId = req.params.id as string;
    const { path: filePath, branchId } = req.body;

    if (!isSafeRepoPath(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const branch = branchId
      ? await getBranchById(repoId, branchId)
      : await getDefaultBranch(repoId);
    if (!branch) return res.status(400).json({ error: 'Target branch not found' });

    const { error } = await supabaseAdmin
      .from('files')
      .delete()
      .eq('repo_id', repoId)
      .eq('branch_id', branch.id)
      .eq('path', filePath);

    if (error) return res.status(500).json({ error: 'Failed to delete file' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

/**
 * POST /api/repos/:id/commits
 * Commit the current state of a branch: records the commit, snapshots every
 * file (PR diffs read these snapshots), and advances the branch pointer.
 */
router.post('/:id/commits', requireAuth, verifyRepoAccess('write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const repoId = req.params.id as string;
    const { message, branchId } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Commit message is required' });
    }

    const branch = branchId
      ? await getBranchById(repoId, branchId)
      : await getDefaultBranch(repoId);

    if (!branch) {
      return res.status(400).json({ error: 'Target branch not found' });
    }

    const commit = await createCommitWithSnapshots(repoId, branch.id, user.id, message.trim());

    await mirrorToGit(repoId, (git) =>
      git.commit(message.trim(), {
        name: (user.user_metadata?.full_name as string) || 'Developer',
        email: user.email,
      }).then(() => undefined)
    );

    await logAudit({
      userId: user.id,
      repoId,
      action: 'commit_created',
      metadata: { message: message.trim(), branch: branch.name }
    });

    res.status(201).json(commit);
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

    const { data: collaborators, error } = await supabaseAdmin
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
