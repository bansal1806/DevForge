import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { verifyOwnership, verifyRepoAccess } from '../middleware/authorize';
import { supabaseAdmin } from '../index';

const router = Router();

/**
 * GET /api/issues
 * Returns all issues created by the authenticated user.
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const supabase = req.supabase!;

    const { data: issues, error } = await supabase
      .from('issues')
      .select('*, author:users(*), repo:repositories(id, name)')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch issues' });
      return;
    }

    res.json(issues || []);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/repos/:repoId/issues
 */
router.get('/repos/:repoId', verifyRepoAccess('read', 'repoId'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { repoId } = req.params;
    const supabase = req.supabase!;

    const { data: issues, error } = await supabase
      .from('issues')
      .select('*, author:users(*)')
      .eq('repo_id', repoId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

/**
 * POST /api/repos/:repoId/issues
 */
router.post('/repos/:repoId', requireAuth, verifyRepoAccess('write', 'repoId'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { repoId } = req.params;
    const { title, description } = req.body;
    const supabase = req.supabase!;

    const { data: issue, error } = await supabase
      .from('issues')
      .insert({
        repo_id: repoId,
        author_id: user.id,
        title,
        description,
        status: 'open'
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(issue);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create issue' });
  }
});

/**
 * GET /api/issues/:id
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // Fetch issue with repo privacy info
    const { data: issue, error } = await supabaseAdmin
      .from('issues')
      .select('*, author:users(*), repo:repositories(id, is_private, owner_id)')
      .eq('id', id)
      .single();

    if (error || !issue) return res.status(404).json({ error: 'Issue not found' });

    // IDOR Protection: If repository is private, verify access
    const repo = issue.repo as any;
    if (repo && repo.is_private) {
      if (!user) return res.status(404).json({ error: 'Issue not found' });
      
      const isOwner = repo.owner_id === user.id;
      const { data: collab } = await supabaseAdmin
        .from('repo_collaborators')
        .select('permission')
        .eq('repo_id', repo.id)
        .eq('user_id', user.id)
        .single();
        
      if (!isOwner && !collab) return res.status(404).json({ error: 'Issue not found' });
    }

    res.json(issue);
  } catch (err) {
    res.status(404).json({ error: 'Issue not found' });
  }
});

/**
 * PATCH /api/issues/:id
 * Only author or repo owner can update.
 */
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const { status, title, description } = req.body;
    const supabase = req.supabase!;

    // Manual ownership check for complex multi-role access
    const { data: issue } = await supabaseAdmin
      .from('issues')
      .select('author_id, repo:repositories(owner_id)')
      .eq('id', id)
      .single();

    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    
    const isAuthor = issue.author_id === user.id;
    const isRepoOwner = (issue.repo as any).owner_id === user.id;

    if (!isAuthor && !isRepoOwner) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { data: updatedIssue, error } = await supabase
      .from('issues')
      .update({ status, title, description, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(updatedIssue);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update issue' });
  }
});

/**
 * Comments
 */
router.get('/:id/comments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const supabase = req.supabase || supabaseAdmin;

    const { data: comments, error } = await supabase
      .from('issue_comments')
      .select('*, author:users(*)')
      .eq('issue_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

router.post('/:id/comments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { content } = req.body;
    const supabase = req.supabase!;

    const { data: comment, error } = await supabase
      .from('issue_comments')
      .insert({
        issue_id: id,
        author_id: user.id,
        content
      })
      .select('*, author:users(*)')
      .single();

    if (error) throw error;
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

export default router;
