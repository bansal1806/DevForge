import { io } from 'socket.io-client'

// Realtime needs a long-running API host (not Vercel serverless). Set
// VITE_ENABLE_REALTIME=false to skip connecting where it isn't available.
export const realtimeEnabled = import.meta.env.VITE_ENABLE_REALTIME !== 'false'

const socket = io(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5050', {
  withCredentials: true,
  autoConnect: false,
  reconnectionAttempts: 5,
})

/** Connects with the user's Supabase access token (verified server-side). */
export function connectSocket(accessToken: string) {
  if (!realtimeEnabled) return
  socket.auth = { token: accessToken }
  if (!socket.connected) socket.connect()
}

export default socket
