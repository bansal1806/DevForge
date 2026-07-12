import OpenAI from 'openai';
import { logger } from '../utils/logger';

// Initialize OpenAI client (Optional key for mock mode support)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'mock-key',
});

export function isMockMode(): boolean {
  return !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock-key';
}

/**
 * Get an AI completion, falling back to a canned mock response when no
 * API key is configured (keeps the demo functional without spend).
 */
export async function getAICompletion(prompt: string, mockResponse: string, system?: string): Promise<string> {
  if (isMockMode()) {
    logger.info('[AI Service] Running in Mock Mode (No OPENAI_API_KEY found)');
    return `[MOCK AI Response] ${mockResponse}`;
  }

  try {
    const messages: { role: 'system' | 'user'; content: string }[] = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      temperature: 0.3,
    });
    return response.choices[0].message.content || 'AI returned an empty response.';
  } catch (err: any) {
    logger.error('[AI Service] OpenAI Error:', err.message);
    throw new Error('AI analysis failed. Please check your API configuration.');
  }
}
