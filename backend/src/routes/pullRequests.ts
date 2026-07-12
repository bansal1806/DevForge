import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth, optionalAuth } from '../middleware/auth';
import { verifyRepoAccess } from '../middleware/authorize';
import { supabaseAdmin } from '../index';
import { buildCommitDiff } from '../utils/versioning';
import { logAudit } from '../utils/audit';

const router = Router();

/**
 * GET /api/pull-requests
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const supabase = req.supabase!;

    const { data: prs, error } = await supabase
      .from('pull_requests')
      .select('*, author:users(*), source:branches!source_branch_id(id, name), target:branches!target_branch_id(id, name), repo:repositories(id, name)')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch Pull Requests' });
      return;
    }

    res.json(prs || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/pull-requests
 */
router.post('/', requireAuth, verifyRepoAccess('write', 'repoId'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { repoId, sourceBranchId, targetBranchId, title, description } = req.body;
    const supabase = req.supabase!;

    const { data: pr, error } = await supabase
      .from('pull_requests')
      .insert({ repo_id: repoId, author_id: user.id, source_branch_id: sourceBranchId, target_branch_id: targetBranchId, title, description, status: 'open' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to create Pull Request' });
    res.json(pr);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/pull-requests/repo/:repoId
 */
router.get('/repo/:repoId', optionalAuth, verifyRepoAccess('read', 'repoId'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { repoId } = req.params;
    const { status } = req.query;

    let query = supabaseAdmin.from('pull_requests').select('*, author:users(*), source:branches!source_branch_id(id, name), target:branches!target_branch_id(id, name)').eq('repo_id', repoId);
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
 */
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // Always check as admin first to see if it's private
    const { data: pr, error } = await supabaseAdmin
      .from('pull_requests')
      .select('*, author:users(*), source:branches!source_branch_id(id, name, last_commit_id), target:branches!target_branch_id(id, name, last_commit_id), repo:repositories(id, is_private, owner_id)')
      .eq('id', id)
      .single();

    if (error || !pr) return res.status(404).json({ error: 'Pull Request not found' });

    // IDOR Protection: If private, verify access
    const repo = pr.repo as any;
    if (repo && repo.is_private) {
      if (!user) return res.status(404).json({ error: 'Pull Request not found' });
      
      const isOwner = repo.owner_id === user.id;
      const { data: collab } = await supabaseAdmin
        .from('repo_collaborators')
        .select('permission')
        .eq('repo_id', repo.id)
        .eq('user_id', user.id)
        .single();
        
      if (!isOwner && !collab) return res.status(404).json({ error: 'Pull Request not found' });
    }

    const diffMap = await buildCommitDiff(
      (pr.source as any)?.last_commit_id || null,
      (pr.target as any)?.last_commit_id || null
    );

    res.json({ pr, diff: diffMap });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Comments & Reviews
 */
router.get('/:id/activity', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const supabase = req.supabase || supabaseAdmin;

    const [comments, reviews] = await Promise.all([
      supabase.from('pr_comments').select('*, author:users(*)').eq('pr_id', id).order('created_at', { ascending: true }),
      supabase.from('pr_reviews').select('*, reviewer:users(*)').eq('pr_id', id).order('created_at', { ascending: true }),
    ]);

    const activity = [
      ...(comments.data || []).map(c => ({ ...c, type: 'comment' })),
      ...(reviews.data || []).map(r => ({ ...r, type: 'review' })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/comments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { content } = req.body;
    const supabase = req.supabase!;

    const { data: comment, error } = await supabase.from('pr_comments').insert({ pr_id: id, author_id: user.id, content }).select('*, author:users(*)').single();
    if (error) throw error;
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

router.post('/:id/reviews', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { status, content } = req.body;
    const supabase = req.supabase!;

    const { data: review, error } = await supabase.from('pr_reviews').insert({ pr_id: id, reviewer_id: user.id, status, content }).select('*, reviewer:users(*)').single();
    if (error) throw error;
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

/**
 * POST /api/pull-requests/:id/merge
 * Only Admin or Repo Owner can merge.
 */
router.post('/:id/merge', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    // IDOR Protection: Verify repository admin rights
    const { data: pr, error: prError } = await supabaseAdmin.from('pull_requests').select('*, repo:repositories(id, owner_id)').eq('id', id).single();
    if (prError || !pr) return res.status(404).json({ error: 'Pull Request not found' });
    
    // Check if user is owner or admin collaborator
    const isOwner = (pr.repo as any).owner_id === user.id;
    const { data: collab } = await supabaseAdmin.from('repo_collaborators').select('permission').eq('repo_id', pr.repo_id).eq('user_id', user.id).single();
    const isAdminCollab = collab && collab.permission === 'admin';

    if (!isOwner && !isAdminCollab) return res.status(403).json({ error: 'Permission denied: Repository administrator rights required for merging.' });

    if (pr.status !== 'open') return res.status(400).json({ error: 'Pull Request must be open for merging.' });

    // Authorization is checked above — perform the merge with the admin client
    // so collaborator merges aren't silently blocked by owner-only RLS policies.
    const { data: sourceFiles, error: sourceError } = await supabaseAdmin
      .from('files')
      .select('path, content')
      .eq('repo_id', pr.repo_id)
      .eq('branch_id', pr.source_branch_id);
    if (sourceError || !sourceFiles) return res.status(500).json({ error: 'Failed to fetch source files for merge.' });

    for (const sf of sourceFiles) {
      const { error: upsertError } = await supabaseAdmin.from('files').upsert(
        { repo_id: pr.repo_id, branch_id: pr.target_branch_id, path: sf.path, content: sf.content, updated_at: new Date().toISOString() },
        { onConflict: 'repo_id,branch_id,path' }
      );
      if (upsertError) return res.status(500).json({ error: `Merge failed while applying ${sf.path}` });
    }

    const { data: mergeCommit, error: commitError } = await supabaseAdmin
      .from('commits')
      .insert({ repo_id: pr.repo_id, branch_id: pr.target_branch_id, author_id: user.id, message: `Merge pull request #${pr.id.slice(0, 8)}: ${pr.title}` })
      .select()
      .single();
    if (commitError || !mergeCommit) return res.status(500).json({ error: 'Merge failed while recording the merge commit' });

    // Snapshot the FULL post-merge state of the target branch (not just the
    // source files) so subsequent PR diffs against this branch are correct.
    const { data: mergedFiles } = await supabaseAdmin
      .from('files')
      .select('path, content')
      .eq('repo_id', pr.repo_id)
      .eq('branch_id', pr.target_branch_id);

    if (mergedFiles && mergedFiles.length > 0) {
      const snapshots = mergedFiles.map(f => ({ commit_id: mergeCommit.id, repo_id: pr.repo_id, path: f.path, content: f.content }));
      await supabaseAdmin.from('file_snapshots').insert(snapshots);
    }
    await supabaseAdmin.from('branches').update({ last_commit_id: mergeCommit.id }).eq('id', pr.target_branch_id);

    await supabaseAdmin.from('pull_requests').update({ status: 'merged', merged_at: new Date().toISOString() }).eq('id', id);

    await logAudit({
      userId: user.id,
      repoId: pr.repo_id,
      action: 'pr_merged',
      metadata: { prId: pr.id, title: pr.title }
    });

    res.json({ message: 'Successfully merged Pull Request' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
