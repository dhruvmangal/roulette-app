import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AchievementUnlockedPayload, FriendEventPayload, FriendInvitedPayload } from '@roulette/contracts'
import { useSession } from './session'

/** Something that just happened that the player should hear about, once. */
export type SocialNotice =
  | { id: number, kind: 'friendRequest', from: string }
  | { id: number, kind: 'friendAccepted', from: string }
  | { id: number, kind: 'achievement', code: string, reward: number }

interface Social {
  /** Friend requests waiting for an answer. */
  incoming: number
  /** Bumps when the friends list may have changed, so open screens reload it. */
  version: number
  refresh: () => void
  /** A friend's invitation to their table, until answered. */
  invite: FriendInvitedPayload | null
  dismissInvite: () => void
  notice: SocialNotice | null
}

const SocialContext = createContext<Social>({ incoming: 0, version: 0, refresh: () => {}, invite: null, dismissInvite: () => {}, notice: null })

/** The server wraps each event as { data }; take what's inside. */
const unwrap = <T,>(payload: { data?: T } | T): T => ((payload as { data?: T })?.data ?? payload) as T

let noticeId = 0

/** Listens for friend and achievement events while signed in, and keeps the count of waiting requests. */
export function SocialProvider ({ children }: { children: ReactNode }) {
  const { api, socket, status } = useSession()
  const [incoming, setIncoming] = useState(0)
  const [version, setVersion] = useState(0)
  const [invite, setInvite] = useState<FriendInvitedPayload | null>(null)
  const [notice, setNotice] = useState<SocialNotice | null>(null)

  const refresh = useCallback(() => setVersion(current => current + 1), [])

  // Count requests waiting, now and whenever something may have changed them.
  useEffect(() => {
    if (status !== 'signedIn') { setIncoming(0); return }
    let cancelled = false
    api.friends().then(list => { if (!cancelled) setIncoming(list.incoming.length) }).catch(() => {})
    return () => { cancelled = true }
  }, [api, status, version])

  useEffect(() => {
    if (!socket) { setInvite(null); return }
    const request = (payload: { data?: FriendEventPayload }) => { setNotice({ id: ++noticeId, kind: 'friendRequest', from: unwrap(payload).from.username }); refresh() }
    const accepted = (payload: { data?: FriendEventPayload }) => { setNotice({ id: ++noticeId, kind: 'friendAccepted', from: unwrap(payload).from.username }); refresh() }
    const invited = (payload: { data?: FriendInvitedPayload }) => setInvite(unwrap(payload))
    const unlocked = (payload: { data?: AchievementUnlockedPayload }) => { const { code, reward } = unwrap(payload); setNotice({ id: ++noticeId, kind: 'achievement', code, reward }) }
    socket.on('friend:request', request)
    socket.on('friend:accepted', accepted)
    socket.on('friend:invited', invited)
    socket.on('achievement:unlocked', unlocked)
    return () => {
      socket.off('friend:request', request)
      socket.off('friend:accepted', accepted)
      socket.off('friend:invited', invited)
      socket.off('achievement:unlocked', unlocked)
    }
  }, [socket, refresh])

  const value = useMemo<Social>(() => ({ incoming, version, refresh, invite, dismissInvite: () => setInvite(null), notice }), [incoming, version, refresh, invite, notice])
  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>
}

export const useSocial = () => useContext(SocialContext)
