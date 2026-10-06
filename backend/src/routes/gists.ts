import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth, optionalAuth } from '../middleware/auth';
import { verifyOwnership, blockDemoUser } from '../middleware/authorize';
import { supabaseAdmin } from '../lib/supabase';
import { PUBLIC_USER_COLUMNS, MAX_FILE_BYTES, isUuid, isOptionalText } from '../lib/validation';
import { logger } from '../utils/logger';

const router = Router();

const GIST_COLUMNS = `*, user:users(${PUBLIC_USER_COLUMNS}), files:gist_files(*)`;
const MAX_GIST_FILES = 20;

async function loadReadableGist(req: AuthenticatedRequest) {
  const id = req.params.id as string;
  if (!isUuid(id)) return null;

  const { data: gist } = await supabaseAdmin.from('gists').select(GIST_COLUMNS).eq('id', id).maybeSingle();
  if (!gist) return null;
  // Private gists are visible to their owner only
  if (!gist.is_public && gist.user_id !== req.user?.id) return null;
  return gist;
}

/**
 * GET /api/gists
 * Public gists, newest first.
 */
router.get('/', async (_req, res: Response) => {
  try {
    const { data: gists, error } = await supabaseAdmin
      .from('gists')
      .select(GIST_COLUMNS)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(gists || []);
  } catch (err: any) {
    logger.error(`List gists failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch gists' });
  }
});

/**
 * GET /api/gists/mine
 * All gists (public and private) of the current user.
 */
router.get('/mine', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: gists, error } = await supabaseAdmin
      .from('gists')
      .select(GIST_COLUMNS)
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(gists || []);
  } catch (err: any) {
    logger.error(`List own gists failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch gists' });
  }
});

/**
 * GET /api/gists/raw/:id/:filename
 */
router.get('/raw/:id/:filename', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gist = await loadReadableGist(req);
    const file = gist?.files?.find((f: any) => f.filename === req.params.filename);
    if (!file) return res.status(404).type('text/plain').send('File not found');

    // Served as an inert download-safe text document, never rendered as HTML
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(file.content);
  } catch (err) {
    res.status(404).type('text/plain').send('File not found');
  }
});

/**
 * GET /api/gists/:id
 * Returns 404 if private and not owned by the caller.
 */
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gist = await loadReadableGist(req);
    if (!gist) return res.status(404).json({ error: 'Gist not found' });
    res.json(gist);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch gist' });
  }
});

/**
 * POST /api/gists
 * Creates a multi-file gist.
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  let createdGistId: string | null = null;
  try {
    const user = req.user!;
    const { title, description, is_public = true, files } = req.body || {};

    if (!isOptionalText(title, 200)) return res.status(400).json({ error: 'Title must be at most 200 characters' });
    if (!isOptionalText(description, 1000)) return res.status(400).json({ error: 'Description must be at most 1000 characters' });
    if (typeof is_public !== 'boolean') return res.status(400).json({ error: 'is_public must be a boolean' });

    if (!Array.isArray(files) || files.length === 0 || files.length > MAX_GIST_FILES) {
      return res.status(400).json({ error: `A gist needs between 1 and ${MAX_GIST_FILES} files` });
    }

    const filenames = new Set<string>();
    for (const f of files) {
      const filename = typeof f?.filename === 'string' ? f.filename.trim() : '';
      if (!filename || filename.length > 255 || /[\\/\x00-\x1f]/.test(filename)) {
        return res.status(400).json({ error: 'Each file needs a valid filename (no slashes)' });
      }
      if (filenames.has(filename)) return res.status(400).json({ error: `Duplicate filename: ${filename}` });
      filenames.add(filename);
      if (typeof f.content !== 'string' || !f.content.length || Buffer.byteLength(f.content, 'utf8') > MAX_FILE_BYTES) {
        return res.status(400).json({ error: `File ${filename} must have content (max ${MAX_FILE_BYTES / 1024}KB)` });
      }
      if (!isOptionalText(f.language, 50)) return res.status(400).json({ error: 'Invalid language' });
    }

    const { data: gist, error: gistError } = await supabaseAdmin
      .from('gists')
      .insert({ user_id: user.id, title: title?.trim() || null, description: description?.trim() || null, is_public })
      .select()
      .single();

    if (gistError || !gist) throw gistError || new Error('gist insert failed');
    createdGistId = gist.id;

    const { data: insertedFiles, error: filesError } = await supabaseAdmin
      .from('gist_files')
      .insert(files.map((f: any) => ({
        gist_id: gist.id,
        filename: f.filename.trim(),
        content: f.content,
        language: f.language || null,
      })))
      .select();

    if (filesError) throw filesError;

    res.status(201).json({ ...gist, files: insertedFiles });
  } catch (err: any) {
    logger.error(`Create gist failed: ${err.message}`);
    if (createdGistId) await supabaseAdmin.from('gists').delete().eq('id', createdGistId);
    res.status(500).json({ error: 'Failed to create gist' });
  }
});

/**
 * DELETE /api/gists/:id
 * Only owner can delete.
 */
router.delete('/:id', requireAuth, verifyOwnership('gists', 'id', 'user_id'), blockDemoUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('gists').delete().eq('id', req.params.id as string);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete gist' });
  }
});

export default router;
