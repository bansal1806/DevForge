import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import OpenAI from 'openai';
import { logger } from '../utils/logger';

const router = Router();

// Initialize OpenAI client (Optional key for mock mode support)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'mock-key',
});

/**
 * Helper to get AI completion with fallback to mock response
 */
async function getAICompletion(prompt: string, mockResponse: string) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock-key') {
    logger.info('[AI Service] Running in Mock Mode (No OPENAI_API_KEY found)');
    return `[MOCK AI Response] ${mockResponse}`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });
    return response.choices[0].message.content || 'AI returned an empty response.';
  } catch (err: any) {
    logger.error('[AI Service] OpenAI Error:', err.message);
    throw new Error('AI analysis failed. Please check your API configuration.');
  }
}

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

export default router;
