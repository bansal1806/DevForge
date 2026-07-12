import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../index';
import { getAICompletion } from '../services/ai';
import { buildCommitDiff } from '../utils/versioning';

const router = Router();

/**
 * POST /api/ai/explain
 * Explain a file's content
 */
router.post('/explain', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { path, content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required for analysis' });

    const prompt = `Explain the following code file (${path}):\n\n${content}`;
    const mock = `This file (${path}) appears to be a functional module that handles specialized logic within the DevForge platform. it uses standard conventions for its language and shows good modularity.`;

    const explanation = await getAICompletion(prompt, mock);
    res.json({ explanation });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai/fix
 * Suggest a fix for a code snippet
 */
router.post('/fix', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { path, content, error } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required for repair' });

    const prompt = `Identify and fix bugs in this code snippet (${path}). ${error ? `Context error: ${error}` : ''}\n\n${content}`;
    const mock = `I have analyzed the snippet in ${path}. Potential fixes include ensuring proper null-checks and validating input types before processing. Recommendation: add a guard clause at the start of the function.`;

    const fix = await getAICompletion(prompt, mock);
    res.json({ fix });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai/summarize
 * Summarize a repository context (Mocked for metadata)
 */
router.post('/summarize', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { repoName, description, filePaths } = req.body;

    const prompt = `Summarize this repository (${repoName}). Description: ${description}. Files: ${filePaths?.join(', ')}`;
    const mock = `The ${repoName} repository is a comprehensive development project focused on providing ${description || 'high-quality developer tools'}. Based on the file structure, it implements a robust modular architecture.`;

    const summary = await getAICompletion(prompt, mock);
    res.json({ summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai/review-pr
 * Generates an AI code review of a pull request's diff.
 */
router.post('/review-pr', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { prId } = req.body;
    if (!prId) return res.status(400).json({ error: 'prId is required' });

    const { data: pr, error } = await supabaseAdmin
      .from('pull_requests')
      .select('*, source:branches!source_branch_id(last_commit_id, name), target:branches!target_branch_id(last_commit_id, name), repo:repositories(id, name, is_private, owner_id)')
      .eq('id', prId)
      .single();

    if (error || !pr) return res.status(404).json({ error: 'Pull Request not found' });

    // IDOR protection for private repos
    const repo = pr.repo as any;
    if (repo?.is_private && repo.owner_id !== user.id) {
      const { data: collab } = await supabaseAdmin
        .from('repo_collaborators')
        .select('permission')
        .eq('repo_id', repo.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!collab) return res.status(404).json({ error: 'Pull Request not found' });
    }

    const diff = await buildCommitDiff(
      (pr.source as any)?.last_commit_id || null,
      (pr.target as any)?.last_commit_id || null
    );

    const changedFiles = Object.entries(diff);
    if (changedFiles.length === 0) {
      return res.json({ review: 'This pull request contains no file changes to review.' });
    }

    // Cap the prompt size so huge diffs don't blow the context window
    const MAX_CHARS = 24000;
    let used = 0;
    const sections: string[] = [];
    for (const [path, entry] of changedFiles) {
      const e = entry as any;
      const body =
        e.status === 'deleted'
          ? `(file deleted)\n--- previous content ---\n${e.originalContent || ''}`
          : e.status === 'added'
            ? `(new file)\n${e.content || ''}`
            : `--- before ---\n${e.originalContent || ''}\n--- after ---\n${e.content || ''}`;
      const section = `### ${path} [${e.status}]\n${body}`;
      if (used + section.length > MAX_CHARS) {
        sections.push(`### (${changedFiles.length - sections.length} more files omitted for length)`);
        break;
      }
      sections.push(section);
      used += section.length;
    }

    const system =
      'You are a rigorous senior code reviewer. Review the pull request diff. ' +
      'Structure your review as markdown with: a one-paragraph summary, a "Issues" section (bugs, security problems, edge cases — be specific, reference file and code), and a "Suggestions" section (style, simplification). ' +
      'If the change looks good, say so plainly. Do not invent issues.';

    const prompt = `Pull Request: "${pr.title}"\nDescription: ${pr.description || '(none)'}\nBranch: ${(pr.source as any)?.name} → ${(pr.target as any)?.name}\n\nDiff:\n${sections.join('\n\n')}`;

    const mock = `**Summary:** This PR ("${pr.title}") modifies ${changedFiles.length} file(s). The changes look structurally consistent.\n\n**Issues:** No blocking issues detected in mock mode.\n\n**Suggestions:** Configure OPENAI_API_KEY on the server to enable real AI reviews.`;

    const review = await getAICompletion(prompt, mock, system);
    res.json({ review });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI review failed' });
  }
});

export default router;
