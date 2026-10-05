import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from './middleware/auth';
import { getRepoAccess } from './middleware/authorize';
import { logger } from './utils/logger';

const MAX_SYNC_BYTES = 1024 * 1024;

interface PresenceUser {
  id: string;
  name: string;
  color: string;
}

interface SocketData {
  user: { id: string; email: string; name: string };
  /** repoId -> access rank, resolved when the socket joins the room */
  access: Map<string, number>;
}

const roomName = (repoId: string) => `repo:${repoId}`;

// Stable per-user color so presence avatars don't change on every reconnect.
function colorFor(userId: string) {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360}, 70%, 50%)`;
}

const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * Real-time collaboration: presence and live file sync per repository.
 * Every socket must authenticate with a Supabase access token, and room
 * membership is gated by the same repo access rules as the REST API.
 */
export function attachRealtime(httpServer: HttpServer, allowedOrigins: string[]) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
    maxHttpBufferSize: MAX_SYNC_BYTES + 64 * 1024,
  });

  // repo room -> socket id -> user (a user may have several tabs open)
  const presence = new Map<string, Map<string, PresenceUser>>();

  const broadcastPresence = (room: string) => {
    const members = presence.get(room);
    const unique = new Map<string, PresenceUser>();
    members?.forEach((u) => unique.set(u.id, u));
    io.to(room).emit('room-users', [...unique.values()]);
  };

  const leaveRoom = (socket: Socket, room: string) => {
    socket.leave(room);
    const members = presence.get(room);
    if (!members) return;
    members.delete(socket.id);
    if (members.size === 0) presence.delete(room);
    broadcastPresence(room);
  };

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token) return next(new Error('Authentication required'));

      const user = await verifyAccessToken(token);
      if (!user) return next(new Error('Invalid or expired token'));

      const data = socket.data as SocketData;
      data.user = {
        id: user.id,
        email: user.email,
        name: (user.user_metadata?.full_name as string) || user.email.split('@')[0] || 'User',
      };
      data.access = new Map();
      next();
    } catch (err: any) {
      logger.warn(`Socket auth failed: ${err.message}`);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const data = socket.data as SocketData;

    socket.on('join-room', async (repoId: unknown) => {
      if (!isUuid(repoId)) return;
      try {
        const access = await getRepoAccess(repoId, data.user.id);
        if (access.rank < 1) {
          socket.emit('room-error', { repoId, error: 'Repository not found' });
          return;
        }

        // One repo room at a time per socket
        for (const room of socket.rooms) {
          if (room.startsWith('repo:') && room !== roomName(repoId)) leaveRoom(socket, room);
        }

        data.access.set(repoId, access.rank);
        const room = roomName(repoId);
        socket.join(room);

        const members = presence.get(room) || new Map<string, PresenceUser>();
        members.set(socket.id, { id: data.user.id, name: data.user.name, color: colorFor(data.user.id) });
        presence.set(room, members);
        broadcastPresence(room);
      } catch (err: any) {
        logger.warn(`join-room failed for ${repoId}: ${err.message}`);
      }
    });

    socket.on('leave-room', (repoId: unknown) => {
      if (!isUuid(repoId)) return;
      data.access.delete(repoId);
      leaveRoom(socket, roomName(repoId));
    });

    // Live edits: write access only, scoped to an exact branch + path so a
    // collaborator's edit can never land in a different open file.
    socket.on('file-change', (payload: any) => {
      const { repoId, branchId, path, content } = payload || {};
      if (!isUuid(repoId) || !isUuid(branchId) || typeof path !== 'string' || typeof content !== 'string') return;
      if ((data.access.get(repoId) || 0) < 2) return;
      if (Buffer.byteLength(content, 'utf8') > MAX_SYNC_BYTES) return;

      socket.to(roomName(repoId)).emit('file-sync', { branchId, path, content, userId: data.user.id });
    });

    socket.on('cursor-move', (payload: any) => {
      const { repoId, branchId, path, cursor } = payload || {};
      if (!isUuid(repoId) || typeof path !== 'string') return;
      if ((data.access.get(repoId) || 0) < 1) return;

      socket.to(roomName(repoId)).emit('cursor-sync', {
        branchId,
        path,
        cursor,
        userId: data.user.id,
        userName: data.user.name,
        color: colorFor(data.user.id),
      });
    });

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('repo:')) leaveRoom(socket, room);
      }
    });
  });

  return io;
}
