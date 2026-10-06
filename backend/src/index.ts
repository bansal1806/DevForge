import './lib/env';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import repoRoutes from './routes/repos';
import pullRequestRoutes from './routes/pullRequests';
import gistRoutes from './routes/gists';
import issueRoutes from './routes/issues';
import activityRoutes from './routes/activity';
import aiRoutes from './routes/ai';
import executeRoutes from './routes/execute';
import adminRoutes from './routes/admin';

import { blockBots, limitPayloadSize } from './middleware/abuseProtection';
import { PostgresRateLimitStore } from './middleware/rateLimitStore';
import { logger } from './utils/logger';

export { supabaseAdmin } from './lib/supabase';

const MAX_BODY_BYTES = 1024 * 1024; // 1MB

const app = express();
app.set('trust proxy', 1); // Trust first proxy for correct IP rate limiting in serverless environments

// FRONTEND_URL accepts a comma-separated list so preview deployments can be allowed too.
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const PORT = process.env.PORT || 5050;

// Security Headers (Enhanced for Production)
app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https://*.supabase.co"],
      "connect-src": ["'self'", "https://*.supabase.co"],
    }
  }
}));

// Traffic Logging (Morgan)
app.use(morgan(':method :url :status :res[content-length] - :response-time ms', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

// --- CORS --- registered before limiters and abuse checks so that 403/429
// responses still carry CORS headers and the browser can read them.
class CorsError extends Error {
  status = 403;
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new CorsError('Origin not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Health Check — registered before limiters/bot-blocking so monitoring tools
// (which often use curl-like User-Agents) are never rejected.
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'DevForge API', timestamp: new Date().toISOString() });
});

// --- RATE LIMITERS ---
// The global limiter uses the in-memory store (per instance — a soft limit on
// serverless, but free). Abuse-sensitive limiters share counters through
// Postgres so they hold across instances; if the database is unreachable they
// fail open instead of taking the API down. Tests use memory stores.
const limiterDefaults = { standardHeaders: 'draft-8', legacyHeaders: false } as const;
const sharedStore = (prefix: string) =>
  process.env.NODE_ENV === 'test'
    ? {}
    : { store: new PostgresRateLimitStore(prefix), passOnStoreError: true };

const globalLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  ...sharedStore('auth'),
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' }
});

const signupLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  ...sharedStore('signup'),
  message: { error: 'Account creation limit reached. Please try again later.' }
});

const aiLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60 * 1000,
  limit: 10,
  ...sharedStore('ai'),
  message: { error: 'AI generation limit reached. Please wait a moment.' }
});

const executionLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60 * 1000,
  limit: 10,
  ...sharedStore('execute'),
  message: { error: 'Execution limit reached. Please wait a moment.' }
});

// Apply Global & Abuse Protection
app.use('/api/', globalLimiter);
app.use('/api/', blockBots);
app.use('/api/', limitPayloadSize(MAX_BODY_BYTES));

// Specialized Limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/demo', authLimiter);
app.use('/api/auth/signup', signupLimiter);
app.use('/api/ai/', aiLimiter);
app.use('/api/execute/', executionLimiter);

app.use(express.json({ limit: MAX_BODY_BYTES }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/repos', repoRoutes);
app.use('/api/pull-requests', pullRequestRoutes);
app.use('/api/gists', gistRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/execute', executeRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global Error Handler — client errors (bad JSON, oversized body, CORS) keep
// their status with a safe message; everything else is a logged 500.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = Number(err.status || err.statusCode) || 500;

  if (status >= 400 && status < 500) {
    const message =
      err.type === 'entity.too.large' ? 'Payload too large'
      : err.type === 'entity.parse.failed' ? 'Malformed JSON body'
      : err instanceof CorsError ? err.message
      : 'Bad request';
    return res.status(status).json({ error: message });
  }

  logger.error(`[Unhandled Error] ${err.message}`, { stack: err.stack, path: req.path });
  res.status(500).json({ error: 'Internal server error occurred and has been logged.' });
});

// Start Server
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    logger.info(`⚡ DevForge API Listening on port ${PORT}`);
  });
}

export default app;
