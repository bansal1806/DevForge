import dotenv from 'dotenv';

// Imported first by every entry point so env vars exist before any module
// reads them at load time (e.g. the OpenAI client, serverless detection).
dotenv.config({ quiet: true });

export const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
export const isDemoEmail = (email?: string | null) =>
  !!email && email.toLowerCase() === (process.env.DEMO_USER_EMAIL || 'demo@devforge.example.com').toLowerCase();
