import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Set VITE_ENABLE_REALTIME=false to turn live collaboration off entirely.
export const realtimeEnabled = import.meta.env.VITE_ENABLE_REALTIME !== 'false'

const SEND_INTERVAL_MS = 150
// Supabase Realtime caps message size; very large files simply don't live-sync
const MAX_SYNC_CHARS = 200_000

export interface PresenceUser {
  id: string
  name: string
  color: string
}

export interface FileChange {
  branchId: string
  path: string
  content: string
  userId: string
}

// Stable per-user color so avatars don't change between sessions
function colorFor(userId: string) {
  let hash = 0
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return `hsl(${hash % 360}, 70%, 50%)`
}

/**
 * Live collaboration for one repository over a private Supabase Realtime
 * channel (`repo:<id>`). Who may join, track presence and broadcast edits is
 * enforced by RLS on realtime.messages (migration 012), using the same repo
 * access rules as the API — so it works on serverless hosting too.
 */
export function useRepoRealtime(
  repoId: string | undefined,
  userId: string | undefined,
  userName: string,
  onFileChange: (change: FileChange) => void
) {
  const [users, setUsers] = useState<PresenceUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const onFileChangeRef = useRef(onFileChange)
  const pending = useRef<FileChange | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    onFileChangeRef.current = onFileChange
  }, [onFileChange])

  useEffect(() => {
    if (!realtimeEnabled || !repoId || !userId) return

    const channel = supabase.channel(`repo:${repoId}`, {
      config: { private: true, broadcast: { self: false }, presence: { key: userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const unique = new Map<string, PresenceUser>()
        for (const entries of Object.values(channel.presenceState<PresenceUser>())) {
          for (const p of entries) unique.set(p.id, { id: p.id, name: p.name, color: p.color })
        }
        setUsers([...unique.values()])
      })
      .on('broadcast', { event: 'file-change' }, ({ payload }) => {
        onFileChangeRef.current(payload as FileChange)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ id: userId, name: userName, color: colorFor(userId) }).catch(() => undefined)
        }
      })

    channelRef.current = channel

    return () => {
      window.clearTimeout(timer.current)
      timer.current = undefined
      pending.current = null
      channelRef.current = null
      supabase.removeChannel(channel)
      setUsers([])
    }
  }, [repoId, userId, userName])

  /** Broadcast the latest content of a file (throttled; last write wins). */
  const sendFileChange = useCallback((change: Omit<FileChange, 'userId'>) => {
    if (!userId || change.content.length > MAX_SYNC_CHARS) return
    pending.current = { ...change, userId }
    if (timer.current !== undefined) return

    timer.current = window.setTimeout(() => {
      timer.current = undefined
      const message = pending.current
      pending.current = null
      if (message) {
        channelRef.current?.send({ type: 'broadcast', event: 'file-change', payload: message }).catch(() => undefined)
      }
    }, SEND_INTERVAL_MS)
  }, [userId])

  return { users, sendFileChange }
}
