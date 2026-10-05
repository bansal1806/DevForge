import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth, optionalAuth } from '../middleware/auth';
import { verifyRepoAccess, getRepoAccess, hasLevel, denyRepoAccess } from '../middleware/authorize';
import { supabaseAdmin } from '../lib/supabase';
import { PUBLIC_USER_COLUMNS, isUuid, isRequiredText, isOptionalText } from '../lib/validation';
import { logAudit } from '../utils/audit';
import { logger } from '../utils/logger';

const router = Router();

const ISSUE_COLUMNS = `*, author:users(${PUBLIC_USER_COLUMNS})`;

/**
 * Loads an issue and checks read access to its repository. Sends the error
 * response itself and returns null when denied.
 */
async function loadIssue(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  if (!isUuid(id)) {
    res.status(404).json({ error: 'Issue not found' });
    return null;
  }

  const { data: issue } = await supabaseAdmin
    .from('issues')
    .select(`${ISSUE_COLUMNS}, repo:repositories(id, name)`)
    .eq('id', id)
    .maybeSingle();

  if (!issue) {
    res.status(404).json({ error: 'Issue not found' });
    return null;
  }

  const access = await getRepoAccess(issue.repo_id, req.user?.id);
  if (!hasLevel(access, 'read')) {
    denyRepoAccess(res, access, 'read', !!req.user, 'Issue not found');
    return null;
  }

  return { issue, access };
}

/**
 * GET /api/issues
 * Issues created by the authenticated user.
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: issues, error } = await req.supabase!
      .from('issues')
      .select(`${ISSUE_COLUMNS}, repo:repositories(id, name)`)
      .eq('author_id', req.user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error(`List issues failed: ${error.message}`);
      return res.status(500).json({ error: 'Failed to fetch issues' });
    }

    res.json(issues || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/issues/repos/:repoId
 */
router.get('/repos/:repoId', optionalAuth, verifyRepoAccess('read', 'repoId'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: issues, error } = await supabaseAdmin
      .from('issues')
      .select(ISSUE_COLUMNS)
      .eq('repo_id', req.params.repoId as string)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(issues || []);
  } catch (err: any) {
    logger.error(`List repo issues failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

/**
 * POST /api/issues/repos/:repoId
 * Anyone who can read the repository may open an issue (like GitHub).
 */
router.post('/repos/:repoId', requireAuth, verifyRepoAccess('read', 'repoId'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const repoId = req.params.repoId as string;
    const { title, description } = req.body || {};

    if (!isRequiredText(title, 200)) return res.status(400).json({ error: 'Title is required (max 200 characters)' });
    if (!isOptionalText(description, 20000)) return res.status(400).json({ error: 'Description is too long' });

    const { data: issue, error } = await supabaseAdmin
      .from('issues')
      .insert({
        repo_id: repoId,
        author_id: user.id,
        title: title.trim(),
        description: description?.trim() || null,
        status: 'open'
      })
      .select(ISSUE_COLUMNS)
      .single();

    if (error) throw error;

    await logAudit({ userId: user.id, repoId, action: 'issue_opened', metadata: { issueId: issue.id, title: issue.title } });
    res.status(201).json(issue);
  } catch (err: any) {
    logger.error(`Create issue failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to create issue' });
  }
});

/**
 * GET /api/issues/:id
 */
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const loaded = await loadIssue(req, res);
    if (!loaded) return;
    const { issue, access } = loaded;

    res.json({
      ...issue,
      permissions: { canEdit: !!req.user && (issue.author_id === req.user.id || hasLevel(access, 'write')) },
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/issues/:id
 * The author or anyone with write access to the repository.
 */
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const loaded = await loadIssue(req, res);
    if (!loaded) return;
    const { issue, access } = loaded;

    if (issue.author_id !== req.user!.id && !hasLevel(access, 'write')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { status, title, description } = req.body || {};
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

    const { data: updatedIssue, error } = await supabaseAdmin
      .from('issues')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', issue.id)
      .select(ISSUE_COLUMNS)
      .single();

    if (error) throw error;
    res.json(updatedIssue);
  } catch (err: any) {
    logger.error(`Update issue failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to update issue' });
  }
});

/**
 * Comments
 */
router.get('/:id/comments', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const loaded = await loadIssue(req, res);
    if (!loaded) return;

    const { data: comments, error } = await supabaseAdmin
      .from('issue_comments')
      .select(`*, author:users(${PUBLIC_USER_COLUMNS})`)
      .eq('issue_id', loaded.issue.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json((comments || []).map((c) => ({ ...c, type: 'comment' })));
  } catch (err: any) {
    logger.error(`List issue comments failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

router.post('/:id/comments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content } = req.body || {};
    if (!isRequiredText(content, 10000)) return res.status(400).json({ error: 'Comment is required (max 10000 characters)' });

    const loaded = await loadIssue(req, res);
    if (!loaded) return;

    const { data: comment, error } = await supabaseAdmin
      .from('issue_comments')
      .insert({ issue_id: loaded.issue.id, author_id: req.user!.id, content: content.trim() })
      .select(`*, author:users(${PUBLIC_USER_COLUMNS})`)
      .single();

    if (error) throw error;
    res.status(201).json({ ...comment, type: 'comment' });
  } catch (err: any) {
    logger.error(`Create issue comment failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

export default router;
