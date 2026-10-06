import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth, optionalAuth } from '../middleware/auth';
import { verifyRepoAccess, getRepoAccess, hasLevel, denyRepoAccess, RepoLevel } from '../middleware/authorize';
import { supabaseAdmin } from '../lib/supabase';
import { PUBLIC_USER_COLUMNS, isUuid, isRequiredText, isOptionalText } from '../lib/validation';
import { buildPullRequestDiff, getBranchById } from '../utils/versioning';
import { logAudit } from '../utils/audit';
import { logger } from '../utils/logger';

const router = Router();

const PR_COLUMNS =
  `*, author:users(${PUBLIC_USER_COLUMNS}), ` +
  'source:branches!source_branch_id(id, name, last_commit_id), ' +
  'target:branches!target_branch_id(id, name, last_commit_id)';

const PR_STATUSES = ['open', 'closed', 'merged'];
const REVIEW_STATUSES = ['approved', 'changes_requested', 'commented'];

/**
 * Loads a PR and checks the caller's access to its repository. Sends the
 * error response itself and returns null when access is denied.
 */
async function loadPullRequest(req: AuthenticatedRequest, res: Response, level: RepoLevel) {
  const id = req.params.id as string;
  if (!isUuid(id)) {
    res.status(404).json({ error: 'Pull Request not found' });
    return null;
  }

  const { data: pr } = await supabaseAdmin
    .from('pull_requests')
    .select(`${PR_COLUMNS}, repo:repositories(id, name, is_private, owner_id)`)
    .eq('id', id)
    .maybeSingle();

  if (!pr) {
    res.status(404).json({ error: 'Pull Request not found' });
    return null;
  }

  const access = await getRepoAccess(pr.repo_id, req.user?.id);
  if (!hasLevel(access, level)) {
    denyRepoAccess(res, access, level, !!req.user, 'Pull Request not found');
    return null;
  }

  return { pr, access };
}

/**
 * GET /api/pull-requests
 * Pull requests authored by the current user.
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: prs, error } = await req.supabase!
      .from('pull_requests')
      .select(`${PR_COLUMNS}, repo:repositories(id, name)`)
      .eq('author_id', req.user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error(`List PRs failed: ${error.message}`);
      return res.status(500).json({ error: 'Failed to fetch Pull Requests' });
    }

    res.json(prs || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/pull-requests
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { repoId, sourceBranchId, targetBranchId, title, description } = req.body || {};

    if (!isUuid(repoId)) return res.status(400).json({ error: 'A valid repoId is required' });
    if (!isRequiredText(title, 200)) return res.status(400).json({ error: 'Title is required (max 200 characters)' });
    if (!isOptionalText(description, 20000)) return res.status(400).json({ error: 'Description is too long' });

    const access = await getRepoAccess(repoId, user.id);
    if (!hasLevel(access, 'write')) return denyRepoAccess(res, access, 'write', true);

    if (!isUuid(sourceBranchId) || !isUuid(targetBranchId)) {
      return res.status(400).json({ error: 'Source and target branches are required' });
    }
    if (sourceBranchId === targetBranchId) {
      return res.status(400).json({ error: 'Source and target branches must be different' });
    }

    // Both branches must belong to this repository (prevents cross-repo diff reads)
    const [source, target] = await Promise.all([
      getBranchById(repoId, sourceBranchId),
      getBranchById(repoId, targetBranchId),
    ]);
    if (!source || !target) return res.status(400).json({ error: 'Branch not found in this repository' });

    const { data: duplicate } = await supabaseAdmin
      .from('pull_requests')
      .select('id')
      .eq('repo_id', repoId)
      .eq('source_branch_id', source.id)
      .eq('target_branch_id', target.id)
      .eq('status', 'open')
      .maybeSingle();
    if (duplicate) {
      return res.status(409).json({ error: 'An open pull request already exists for these branches', id: duplicate.id });
    }

    const { data: pr, error } = await supabaseAdmin
      .from('pull_requests')
      .insert({
        repo_id: repoId,
        author_id: user.id,
        source_branch_id: source.id,
        target_branch_id: target.id,
        title: title.trim(),
        description: description?.trim() || null,
        status: 'open',
      })
      .select()
      .single();

    if (error) {
      logger.error(`Create PR failed: ${error.message}`);
      return res.status(500).json({ error: 'Failed to create Pull Request' });
    }

    await logAudit({ userId: user.id, repoId, action: 'pr_opened', metadata: { prId: pr.id, title: pr.title } });
    res.status(201).json(pr);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/pull-requests/repo/:repoId?status=open|closed|merged
 */
router.get('/repo/:repoId', optionalAuth, verifyRepoAccess('read', 'repoId'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.query;
    if (status !== undefined && (typeof status !== 'string' || !PR_STATUSES.includes(status))) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    let query = supabaseAdmin.from('pull_requests').select(PR_COLUMNS).eq('repo_id', req.params.repoId as string);
    if (status) query = query.eq('status', status);

    const { data: prs, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Failed to fetch Pull Requests' });
    res.json(prs || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/pull-requests/:id
 * The PR plus its diff: source head vs. merge base with the target.
 */
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const loaded = await loadPullRequest(req, res, 'read');
    if (!loaded) return;
    const { pr, access } = loaded;

    const diff = await buildPullRequestDiff(
      (pr.source as any)?.last_commit_id || null,
      (pr.target as any)?.last_commit_id || null
    );

    const { repo, ...rest } = pr as any;
    res.json({
      pr: { ...rest, repo: repo && { id: repo.id, name: repo.name } },
      diff,
      permissions: {
        canMerge: hasLevel(access, 'admin'),
        canClose: hasLevel(access, 'write') || pr.author_id === req.user?.id,
      },
    });
  } catch (err: any) {
    logger.error(`Get PR failed: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/pull-requests/:id — close or reopen (author or write access).
 */
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const loaded = await loadPullRequest(req, res, 'read');
    if (!loaded) return;
    const { pr, access } = loaded;
    const { status, title, description } = req.body || {};

    if (!hasLevel(access, 'write') && pr.author_id !== req.user!.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    if (pr.status === 'merged') return res.status(400).json({ error: 'Merged pull requests cannot be changed' });

    const updates: Record<string, unknown> = {};
    if (status !== undefined) {
      if (!['open', 'closed'].includes(status)) return res.status(400).json({ error: 'Status must be open or closed' });
      updates.status = status;
    }
    if (title !== undefined) {
      if (!isRequiredText(title, 200)) return res.status(400).json({ error: 'Title is required (max 200 characters)' });
      updates.title = title.trim();
    }
    if (description !== undefined) {
      if (!isOptionalText(description, 20000)) return res.status(400).json({ error: 'Description is too long' });
      updates.description = description?.trim() || null;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    const { data: updated, error } = await supabaseAdmin
      .from('pull_requests')
      .update(updates)
      .eq('id', pr.id)
      .select()
      .single();
    if (error) throw error;

    res.json(updated);
  } catch (err: any) {
    logger.error(`Update PR failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to update Pull Request' });
  }
});

/**
 * Comments & Reviews
 */
router.get('/:id/activity', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const loaded = await loadPullRequest(req, res, 'read');
    if (!loaded) return;
    const prId = loaded.pr.id;

    const [comments, reviews] = await Promise.all([
      supabaseAdmin.from('pr_comments').select(`*, author:users(${PUBLIC_USER_COLUMNS})`).eq('pr_id', prId).order('created_at', { ascending: true }),
      supabaseAdmin.from('pr_reviews').select(`*, reviewer:users(${PUBLIC_USER_COLUMNS})`).eq('pr_id', prId).order('created_at', { ascending: true }),
    ]);

    if (comments.error || reviews.error) throw comments.error || reviews.error;

    const activity = [
      ...(comments.data || []).map(c => ({ ...c, type: 'comment' })),
      // Reviews render with the same `author` shape as comments
      ...(reviews.data || []).map(r => ({ ...r, author: r.reviewer, type: 'review' })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    res.json(activity);
  } catch (err: any) {
    logger.error(`PR activity failed: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/comments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content } = req.body || {};
    if (!isRequiredText(content, 10000)) return res.status(400).json({ error: 'Comment is required (max 10000 characters)' });

    const loaded = await loadPullRequest(req, res, 'read');
    if (!loaded) return;

    const { data: comment, error } = await supabaseAdmin
      .from('pr_comments')
      .insert({ pr_id: loaded.pr.id, author_id: req.user!.id, content: content.trim() })
      .select(`*, author:users(${PUBLIC_USER_COLUMNS})`)
      .single();
    if (error) throw error;

    res.status(201).json({ ...comment, type: 'comment' });
  } catch (err: any) {
    logger.error(`PR comment failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

router.post('/:id/reviews', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, content } = req.body || {};
    if (!REVIEW_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid review status' });
    if (!isOptionalText(content, 10000)) return res.status(400).json({ error: 'Review is too long' });

    const loaded = await loadPullRequest(req, res, 'read');
    if (!loaded) return;
    const { pr } = loaded;

    if (pr.status !== 'open') return res.status(400).json({ error: 'Only open pull requests can be reviewed' });
    if (status !== 'commented' && pr.author_id === req.user!.id) {
      return res.status(400).json({ error: 'You cannot approve or request changes on your own pull request' });
    }

    const { data: review, error } = await supabaseAdmin
      .from('pr_reviews')
      .insert({ pr_id: pr.id, reviewer_id: req.user!.id, status, content: content?.trim() || null })
      .select(`*, reviewer:users(${PUBLIC_USER_COLUMNS})`)
      .single();
    if (error) throw error;

    res.status(201).json({ ...review, author: review.reviewer, type: 'review' });
  } catch (err: any) {
    logger.error(`PR review failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

/**
 * POST /api/pull-requests/:id/merge
 * Repository owner or admin collaborator. Atomic three-way merge in SQL
 * (migration 009); responds 409 with the conflicting paths if it can't merge.
 */
router.post('/:id/merge', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const loaded = await loadPullRequest(req, res, 'admin');
    if (!loaded) return;
    const { pr } = loaded;
    const user = req.user!;

    if (pr.status !== 'open') return res.status(400).json({ error: 'Pull Request must be open for merging.' });

    const { data: result, error } = await supabaseAdmin.rpc('merge_pull_request', { p_pr: pr.id, p_user: user.id });

    if (error) {
      if (error.code === '22023') return res.status(400).json({ error: error.message });
      throw error;
    }

    if (!result?.merged) {
      return res.status(409).json({
        error: 'This pull request has conflicts that must be resolved before merging.',
        conflicts: result?.conflicts || [],
      });
    }

    await logAudit({
      userId: user.id,
      repoId: pr.repo_id,
      action: 'pr_merged',
      metadata: { prId: pr.id, title: pr.title }
    });

    res.json({ message: 'Successfully merged Pull Request', commitId: result.commit_id });
  } catch (err: any) {
    logger.error(`Merge failed: ${err.message}`);
    res.status(500).json({ error: 'Merge failed' });
  }
});

export default router;
