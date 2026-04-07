import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { verifyOwnership } from '../middleware/authorize';
import { supabaseAdmin } from '../index';

const router = Router();

/**
 * GET /api/gists
 * Lists public gists.
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supabase = req.supabase || supabaseAdmin;
    const { data: gists, error } = await supabase
      .from('gists')
      .select('*, user:users(*), files:gist_files(*)')
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(gists);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch gists' });
  }
});

/**
 * GET /api/gists/:id
 * Secure read access: returns 404 if private and no ownership.
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const { data: gist, error } = await supabaseAdmin
      .from('gists')
      .select('*, user:users(*), files:gist_files(*)')
      .eq('id', id)
      .single();

    if (error || !gist) {
      return res.status(404).json({ error: 'Gist not found' });
    }

    // IDOR Protection: Private Gists
    if (!gist.is_public) {
      if (!user || gist.user_id !== user.id) {
        return res.status(404).json({ error: 'Gist not found' });
      }
    }

    res.json(gist);
  } catch (err) {
    res.status(404).json({ error: 'Gist not found' });
  }
});

/**
 * GET /api/gists/raw/:id/:filename
 * Secure raw access: returns 404 if private and no ownership.
 */
router.get('/raw/:id/:filename', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, filename } = req.params;
    const user = req.user;
    
    // Check gist visibility first
    const { data: gist } = await supabaseAdmin
      .from('gists')
      .select('is_public, user_id')
      .eq('id', id)
      .single();
      
    if (!gist) return res.status(404).send('File not found');
    if (!gist.is_public && (!user || gist.user_id !== user.id)) {
      return res.status(404).send('File not found');
    }

    const { data: file, error } = await supabaseAdmin
      .from('gist_files')
      .select('content')
      .eq('gist_id', id)
      .eq('filename', filename)
      .single();

    if (error || !file) throw error || new Error('File not found');
    res.setHeader('Content-Type', 'text/plain');
    res.send(file.content);
  } catch (err) {
    res.status(404).send('File not found');
  }
});

/**
 * POST /api/gists
 * Creates a multi-file gist.
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { title, description, is_public, files } = req.body;
    const supabase = req.supabase!;

    const { data: gist, error: gistError } = await supabase
      .from('gists')
      .insert({ user_id: user.id, title, description, is_public })
      .select()
      .single();

    if (gistError) throw gistError;

    const filesToInsert = files.map((f: any) => ({
      gist_id: gist.id,
      filename: f.filename,
      content: f.content,
      language: f.language
    }));

    const { error: filesError } = await supabase
      .from('gist_files')
      .insert(filesToInsert);

    if (filesError) throw filesError;

    res.status(201).json({ ...gist, files: filesToInsert });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create gist' });
  }
});

/**
 * DELETE /api/gists/:id
 * Only owner can delete.
 */
router.delete('/:id', requireAuth, verifyOwnership('gists', 'id', 'user_id'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const supabase = req.supabase!;

    const { error } = await supabase.from('gists').delete().eq('id', id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete gist' });
  }
});

export default router;
