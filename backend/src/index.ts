import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';

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
import { SandboxService } from './services/sandbox';

import { blockBots, limitPayloadSize } from './middleware/abuseProtection';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
});
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

// --- RATE LIMITERS ---
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' }
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Account creation limit reached. Please try again later.' }
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'AI generation limit reached. Please wait a moment.' }
});

// Apply Global & Abuse Protection
app.use('/api/', globalLimiter);
app.use('/api/', blockBots);
app.use('/api/', limitPayloadSize(1024 * 1024)); // Default to 1MB

// Specialized Limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', signupLimiter);
app.use('/api/ai/', aiLimiter);

// --- CORS ---
const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// Initialize Supabase Connection
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  logger.error('⚠️  Supabase URL or Service Role Key is missing. Check your .env file!');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

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

// Health Check
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'DevForge API', timestamp: new Date().toISOString() });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`[Unhandled Error] ${err.message}`, { stack: err.stack, path: req.path });
  res.status(err.status || 500).json({ error: 'Internal server error occurred and has been logged.' });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Presence Tracking Store (Local, or Redis in production)
const roomUsers = new Map<string, Array<{ id: string, name: string, color: string }>>();

// Socket logic
io.on('connection', (socket) => {
  socket.on('join-room', (roomId: string, user: { id: string, name: string, color: string }) => {
    socket.join(roomId);
    
    // Add user to room presence tracking
    const users = roomUsers.get(roomId) || [];
    if (!users.find(u => u.id === user.id)) {
      users.push(user);
      roomUsers.set(roomId, users);
    }
    
    // Broadcast updated presence list
    io.to(roomId).emit('room-users', users);
  });

  socket.on('leave-room', (roomId: string, userId: string) => {
    socket.leave(roomId);
    const users = roomUsers.get(roomId) || [];
    const filtered = users.filter(u => u.id !== userId);
    roomUsers.set(roomId, filtered);
    io.to(roomId).emit('room-users', filtered);
  });

  socket.on('file-change', ({ roomId, content }) => {
    socket.to(roomId).emit('file-sync', content);
  });

  socket.on('cursor-move', ({ roomId, cursor, userId, userName, color }) => {
    socket.to(roomId).emit('cursor-sync', { cursor, userId, userName, color });
  });

  socket.on('execution-request', ({ roomId, filePath }) => {
    // This is a bridge for real-time output if we decide to stream 
    // instead of waiting for the full POST response.
    // In Phase 3, we use the POST for results, but we can stream logs here too.
    logger.info(`Execution requested via socket for ${filePath} in ${roomId}`);
  });

  socket.on('disconnecting', () => {
    // Handle unexpected disconnects by cleaning up active rooms
    for (const room of socket.rooms) {
      if (roomUsers.has(room)) {
        // Since we don't have user context on raw disconnect, client should handle it normally,
        // but simple mapping can be improved.
      }
    }
  });
});

// Start Server
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  httpServer.listen(PORT, () => {
    logger.info(`⚡ DevForge API Listening on port ${PORT}`);
  });
}

export default app;
