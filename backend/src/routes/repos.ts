import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth, optionalAuth } from '../middleware/auth';
import { verifyOwnership, verifyRepoAccess, getRepoAccess, blockDemoUser, RepoLevel } from '../middleware/authorize';
import { supabaseAdmin } from '../lib/supabase';
import { isServerless } from '../lib/env';
import {
  PUBLIC_USER_COLUMNS,
  MAX_FILE_BYTES,
  isUuid,
  isValidRepoName,
  isValidBranchName,
  isOptionalText,
  isRequiredText,
} from '../lib/validation';
import { GitManager } from '../utils/git';
import { logger } from '../utils/logger';
import { logAudit } from '../utils/audit';
import {
  getDefaultBranch,
  resolveBranch,
  createCommitWithSnapshots,
  isSafeRepoPath,
} from '../utils/versioning';

const router = Router();

// Supabase SQL is the source of truth for file content and history.
// On long-running hosts we also mirror writes into a real on-disk git repo
// (used by the local Docker sandbox); serverless filesystems are read-only.
async function mirrorToGit(repoId: string, action: (git: GitManager) => Promise<void>) {
  if (isServerless) return;
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

const PERMISSION_BY_RANK: Record<number, RepoLevel | null> = { 0: null, 1: 'read', 2: 'write', 3: 'admin' };
const REPO_LIST_COLUMNS = `*, owner:users(${PUBLIC_USER_COLUMNS}), stars(count)`;

/**
 * POST /api/repos
 * Create a repository with a default branch, README, and initial commit.
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  let createdRepoId: string | null = null;

  try {
    const { name, description, isPrivate } = req.body || {};

    if (!isValidRepoName(typeof name === 'string' ? name.trim() : name)) {
      return res.status(400).json({ error: 'Repository name may only contain letters, numbers, ".", "-" and "_" (max 100)' });
    }
    if (!isOptionalText(description, 500)) {
      return res.status(400).json({ error: 'Description must be at most 500 characters' });
    }

    const repoName = name.trim();

    const { data: repo, error } = await req.supabase!
      .from('repositories')
      .insert({
        name: repoName,
        description: description?.trim() || null,
        is_private: !!isPrivate,
        owner_id: user.id,
        default_branch: 'main'
      })
      .select()
      .single();

    if (error || !repo) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'You already have a repository with that name' });
      }
      logger.error(`Failed to create repository record: ${error?.message}`);
      return res.status(500).json({ error: 'Failed to create repository' });
    }
    createdRepoId = repo.id;

    const { data: branch, error: branchError } = await supabaseAdmin
      .from('branches')
      .insert({ repo_id: repo.id, name: 'main', is_default: true })
      .select()
      .single();
    if (branchError || !branch) throw new Error(`default branch: ${branchError?.message}`);

    // Seed a README so the repo is never empty and PR diffs have a baseline
    const readmeContent = `# ${repo.name}\n\n${repo.description || 'Created with DevForge.'}\n`;
    const { error: readmeError } = await supabaseAdmin.from('files').insert({
      repo_id: repo.id,
      branch_id: branch.id,
      path: 'README.md',
      content: readmeContent,
    });
    if (readmeError) throw new Error(`README: ${readmeError.message}`);

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
    // Don't leave a half-initialized repository behind
    if (createdRepoId) await supabaseAdmin.from('repositories').delete().eq('id', createdRepoId);
    res.status(500).json({ error: 'Failed to create repository' });
  }
});

/**
 * GET /api/repos
 * Repositories the user owns or collaborates on.
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;

    const { data: collabRows } = await supabaseAdmin
      .from('repo_collaborators')
      .select('repo_id')
      .eq('user_id', user.id);
    const collabIds = (collabRows || []).map((r) => r.repo_id).filter(isUuid);

    let query = supabaseAdmin.from('repositories').select(REPO_LIST_COLUMNS);
    query = collabIds.length
      ? query.or(`owner_id.eq.${user.id},id.in.(${collabIds.join(',')})`)
      : query.eq('owner_id', user.id);

    const { data: repos, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      logger.error(`Failed to list repositories: ${error.message}`);
      return res.status(500).json({ error: 'Failed to fetch repositories' });
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
    // Strip PostgREST filter syntax characters so the term can't alter the query
    const q = typeof req.query.q === 'string'
      ? req.query.q.replace(/[%,()*"\\:.]/g, ' ').trim().slice(0, 100)
      : '';

    let query = supabaseAdmin
      .from('repositories')
      .select(REPO_LIST_COLUMNS)
      .eq('is_private', false);

    if (q) {
      query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
    }

    const { data: repos, error } = await query
      .order('updated_at', { ascending: false })
      .limit(30);

    if (error) {
      logger.error(`Explore query failed: ${error.message}`);
      return res.status(500).json({ error: 'Failed to fetch repositories' });
    }

    res.json((repos || []).map(mapStarsCount));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/repos/starred
 * Repositories starred by the current user (that they can still read).
 */
router.get('/starred', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;

    const { data: rows, error } = await supabaseAdmin
      .from('stars')
      .select(`created_at, repo:repositories(${REPO_LIST_COLUMNS})`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Failed to fetch starred repositories' });

    const repos = (rows || []).map((r: any) => r.repo).filter(Boolean);
    const visible = await Promise.all(
      repos.map(async (repo: any) =>
        !repo.is_private || (await getRepoAccess(repo.id, user.id)).rank >= 1 ? repo : null
      )
    );

    res.json(visible.filter(Boolean).map(mapStarsCount));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/repos/:id
 * Returns 404 if private and the caller has no access.
 */
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = req.user;
    if (!isUuid(id)) return res.status(404).json({ error: 'Repository not found' });

    const access = await getRepoAccess(id, user?.id);
    if (access.rank < 1) return res.status(404).json({ error: 'Repository not found' });

    const { data: repo, error } = await supabaseAdmin
      .from('repositories')
      .select(REPO_LIST_COLUMNS)
      .eq('id', id)
      .single();

    if (error || !repo) return res.status(404).json({ error: 'Repository not found' });

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

    res.json({
      ...mapStarsCount(repo),
      starred_by_me: starredByMe,
      // Effective permission of the caller, so the UI can hide write actions
      permission: user ? PERMISSION_BY_RANK[access.rank] : null,
    });
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
    const id = req.params.id as string;
    const user = req.user!;

    const { data: removed } = await supabaseAdmin
      .from('stars')
      .delete()
      .eq('repo_id', id)
      .eq('user_id', user.id)
      .select('id');

    const starred = !removed || removed.length === 0;
    if (starred) {
      await supabaseAdmin
        .from('stars')
        .upsert({ repo_id: id, user_id: user.id }, { onConflict: 'user_id,repo_id', ignoreDuplicates: true });
    }

    const { count } = await supabaseAdmin
      .from('stars')
      .select('*', { count: 'exact', head: true })
      .eq('repo_id', id);

    res.json({ starred, stars_count: count || 0 });
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
    const branch = await resolveBranch(id, req.query.branchId);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    const { data: files, error } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('repo_id', id)
      .eq('branch_id', branch.id)
      .order('path');

    if (error) throw new Error(error.message);

    // Legacy fallback: rows created before branching landed have no branch_id
    if ((!files || files.length === 0) && branch.is_default) {
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
    const { data: branches, error } = await supabaseAdmin
      .from('branches')
      .select('*')
      .eq('repo_id', req.params.id as string)
      .order('is_default', { ascending: false })
      .order('name');

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
    const id = req.params.id as string;
    const branchId = req.query.branchId;
    if (branchId !== undefined && !isUuid(branchId)) {
      return res.status(400).json({ error: 'Invalid branchId' });
    }

    let query = supabaseAdmin
      .from('commits')
      .select(`*, author:users(${PUBLIC_USER_COLUMNS})`)
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
    const { data: stats, error } = await supabaseAdmin
      .from('execution_stats')
      .select('language, status, duration, created_at')
      .eq('repo_id', req.params.id as string)
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
  let createdBranchId: string | null = null;
  try {
    const repoId = req.params.id as string;
    const { name, fromBranchId } = req.body || {};
    const branchName = typeof name === 'string' ? name.trim() : name;

    if (!isValidBranchName(branchName)) {
      return res.status(400).json({ error: 'Branch names may contain letters, numbers, ".", "-", "_" and "/" (max 100)' });
    }

    const sourceBranch = await resolveBranch(repoId, fromBranchId);
    if (!sourceBranch) return res.status(400).json({ error: 'Source branch not found' });

    const { data: branch, error: branchError } = await supabaseAdmin
      .from('branches')
      .insert({
        repo_id: repoId,
        name: branchName,
        // Same commit pointer as the source → a fresh branch diffs as "no changes"
        last_commit_id: sourceBranch.last_commit_id || null,
      })
      .select()
      .single();

    if (branchError || !branch) {
      if (branchError?.code === '23505') {
        return res.status(409).json({ error: 'A branch with that name already exists' });
      }
      throw new Error(branchError?.message || 'branch insert failed');
    }
    createdBranchId = branch.id;

    const { data: sourceFiles, error: readError } = await supabaseAdmin
      .from('files')
      .select('path, content')
      .eq('repo_id', repoId)
      .eq('branch_id', sourceBranch.id);
    if (readError) throw new Error(readError.message);

    if (sourceFiles && sourceFiles.length > 0) {
      const { error: copyError } = await supabaseAdmin.from('files').insert(
        sourceFiles.map((f) => ({ repo_id: repoId, branch_id: branch.id, path: f.path, content: f.content }))
      );
      if (copyError) throw new Error(`file copy: ${copyError.message}`);
    }

    res.status(201).json(branch);
  } catch (err: any) {
    logger.error(`Branch creation failed: ${err.message}`);
    if (createdBranchId) await supabaseAdmin.from('branches').delete().eq('id', createdBranchId);
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

/**
 * POST /api/repos/:id/files
 * Save (upsert) a file on a branch.
 */
router.post('/:id/files', requireAuth, verifyRepoAccess('write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repoId = req.params.id as string;
    const { path: filePath, content = '', branchId } = req.body || {};

    if (!isSafeRepoPath(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'File content must be a string' });
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
      return res.status(413).json({ error: `Files are limited to ${MAX_FILE_BYTES / 1024}KB` });
    }

    const branch = await resolveBranch(repoId, branchId);
    if (!branch) return res.status(400).json({ error: 'Target branch not found' });

    const { data: file, error } = await supabaseAdmin
      .from('files')
      .upsert(
        {
          repo_id: repoId,
          branch_id: branch.id,
          path: filePath,
          content,
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

    if (branch.is_default) await mirrorToGit(repoId, (git) => git.writeFile(filePath, content));

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
    const { path: filePath, branchId } = req.body || {};

    if (!isSafeRepoPath(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const branch = await resolveBranch(repoId, branchId);
    if (!branch) return res.status(400).json({ error: 'Target branch not found' });

    const { data: deleted, error } = await supabaseAdmin
      .from('files')
      .delete()
      .eq('repo_id', repoId)
      .eq('branch_id', branch.id)
      .eq('path', filePath)
      .select('id');

    if (error) return res.status(500).json({ error: 'Failed to delete file' });
    if (!deleted || deleted.length === 0) return res.status(404).json({ error: 'File not found' });

    if (branch.is_default) await mirrorToGit(repoId, (git) => git.removeFile(filePath));

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
    const { message, branchId } = req.body || {};

    if (!isRequiredText(message, 500)) {
      return res.status(400).json({ error: 'Commit message is required (max 500 characters)' });
    }

    const branch = await resolveBranch(repoId, branchId);
    if (!branch) return res.status(400).json({ error: 'Target branch not found' });

    const commit = await createCommitWithSnapshots(repoId, branch.id, user.id, message.trim());

    if (branch.is_default) {
      await mirrorToGit(repoId, (git) =>
        git.commit(message.trim(), {
          name: (user.user_metadata?.full_name as string) || 'Developer',
          email: user.email,
        })
      );
    }

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
 * PATCH /api/repos/:id — owner only.
 */
router.patch('/:id', requireAuth, verifyOwnership('repositories'), blockDemoUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description, is_private, default_branch } = req.body || {};
    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      if (!isValidRepoName(typeof name === 'string' ? name.trim() : name)) {
        return res.status(400).json({ error: 'Invalid repository name' });
      }
      updates.name = name.trim();
    }
    if (description !== undefined) {
      if (!isOptionalText(description, 500)) return res.status(400).json({ error: 'Description must be at most 500 characters' });
      updates.description = description?.trim() || null;
    }
    if (is_private !== undefined) {
      if (typeof is_private !== 'boolean') return res.status(400).json({ error: 'is_private must be a boolean' });
      updates.is_private = is_private;
    }

    if (default_branch !== undefined) {
      const { data: target } = await supabaseAdmin
        .from('branches')
        .select('id, is_default')
        .eq('repo_id', id)
        .eq('name', default_branch)
        .maybeSingle();
      if (!target) return res.status(400).json({ error: 'default_branch must be an existing branch' });

      if (!target.is_default) {
        // Only one default per repo (unique partial index): clear, then set
        await supabaseAdmin.from('branches').update({ is_default: false }).eq('repo_id', id).eq('is_default', true);
        await supabaseAdmin.from('branches').update({ is_default: true }).eq('id', target.id);
      }
      updates.default_branch = default_branch;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data: updatedRepo, error: updateError } = await supabaseAdmin
      .from('repositories')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === '23505') return res.status(409).json({ error: 'You already have a repository with that name' });
      return res.status(500).json({ error: 'Failed to update repository' });
    }

    await logAudit({
      userId: req.user!.id,
      repoId: id,
      action: 'repo_updated',
      metadata: { fields: Object.keys(updates) }
    });

    res.json(updatedRepo);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireAuth, verifyOwnership('repositories'), blockDemoUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const { error: deleteError } = await supabaseAdmin.from('repositories').delete().eq('id', id);
    if (deleteError) return res.status(500).json({ error: 'Failed to delete repository' });

    await mirrorToGit(id, (git) => git.destroy());

    // repo_id is omitted: audit rows cascade with the repository
    await logAudit({
      userId: req.user!.id,
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
    const id = req.params.id as string;
    const access = await getRepoAccess(id, req.user!.id);

    const { data: collaborators, error } = await supabaseAdmin
      .from('repo_collaborators')
      .select('id, repo_id, user_id, permission, created_at, user:users(id, name, avatar_url, email)')
      .eq('repo_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Only the owner (who invited them by email) may see collaborator emails
    res.json((collaborators || []).map((c: any) => (
      access.isOwner ? c : { ...c, user: c.user && { id: c.user.id, name: c.user.name, avatar_url: c.user.avatar_url } }
    )));
  } catch (err: any) {
    logger.error(`List collaborators failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to list collaborators' });
  }
});

router.post('/:id/collaborators', requireAuth, verifyOwnership('repositories'), blockDemoUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { email, permission = 'write' } = req.body || {};

    if (typeof email !== 'string' || !email.trim()) return res.status(400).json({ error: 'Email is required' });
    if (!['read', 'write', 'admin'].includes(permission)) {
      return res.status(400).json({ error: 'Permission must be read, write or admin' });
    }

    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (!targetUser) return res.status(404).json({ error: 'User with that email not found' });
    if (targetUser.id === req.user!.id) return res.status(400).json({ error: 'You already own this repository' });

    const { data: collaborator, error: insertError } = await supabaseAdmin
      .from('repo_collaborators')
      .insert({ repo_id: id, user_id: targetUser.id, permission })
      .select('id, repo_id, user_id, permission, created_at, user:users(id, name, avatar_url, email)')
      .single();

    if (insertError) {
      if (insertError.code === '23505') return res.status(409).json({ error: 'User is already a collaborator' });
      throw insertError;
    }

    await logAudit({ userId: req.user!.id, repoId: id, action: 'collaborator_added', metadata: { permission } });
    res.status(201).json(collaborator);
  } catch (err: any) {
    logger.error(`Add collaborator failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to add collaborator' });
  }
});

router.delete('/:id/collaborators/:userId', requireAuth, verifyOwnership('repositories'), blockDemoUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.params.userId as string;
    if (!isUuid(userId)) return res.status(404).json({ error: 'Collaborator not found' });

    const { data: removed, error } = await supabaseAdmin
      .from('repo_collaborators')
      .delete()
      .eq('repo_id', id)
      .eq('user_id', userId)
      .select('id');

    if (error) throw error;
    if (!removed || removed.length === 0) return res.status(404).json({ error: 'Collaborator not found' });

    await logAudit({ userId: req.user!.id, repoId: id, action: 'collaborator_removed', metadata: {} });
    res.status(204).send();
  } catch (err: any) {
    logger.error(`Remove collaborator failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to remove collaborator' });
  }
});

export default router;
