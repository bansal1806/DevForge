import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import repoRoutes from './routes/repos';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
});
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Initialize Supabase Connection
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  Supabase URL or Key is missing. Check your .env file!');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/repos', repoRoutes);

// Health Check
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'DevForge API',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Socket logic
io.on('connection', (socket) => {
  socket.on('join-room', (roomId: string) => {
    socket.join(roomId);
  });

  socket.on('file-change', ({ roomId, content }) => {
    socket.to(roomId).emit('file-sync', content);
  });

  socket.on('cursor-move', ({ roomId, cursor, userId, userName }) => {
    socket.to(roomId).emit('cursor-sync', { cursor, userId, userName });
  });
});

// Start Server
httpServer.listen(PORT, () => {
  console.log(`\n  ⚡ DevForge API Server (Sockets Enabled)`);
  console.log(`  → Local:   http://localhost:${PORT}`);
  console.log(`  → Health:  http://localhost:${PORT}/api/health\n`);
});
