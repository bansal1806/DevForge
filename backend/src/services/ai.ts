import OpenAI from 'openai';
import { logger } from '../utils/logger';

/** Thrown when the AI provider fails; the message is safe to show to users. */
export class AIServiceError extends Error {}

let client: OpenAI | null = null;

export function isMockMode(): boolean {
  return !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock-key';
}

// Created lazily so the key is read after env loading, never at import time.
function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25_000, maxRetries: 1 });
  }
  return client;
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

    const response = await getClient().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      temperature: 0.3,
      max_tokens: 1200,
    });
    return response.choices[0]?.message?.content || 'AI returned an empty response.';
  } catch (err: any) {
    logger.error(`[AI Service] OpenAI error: ${err.status || ''} ${err.message}`);
    throw new AIServiceError('AI analysis failed. Please try again later.');
  }
}
