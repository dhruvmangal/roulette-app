import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { REACTIONS, type ChatBetsData, type ChatMessage, type ChatResultData } from '@roulette/contracts'
import { pocketColor } from '@roulette/engine'
import type { ActionResult } from '@roulette/game-client'
import { useI18n, type MessageKey, type Translate } from './i18n'
import { readSetting, writeSetting } from './settings'

const MAX_LENGTH = 200
const MUTED_KEY = 'roulette.mutedPlayers'
const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

const errorNotice = (error: string, t: Translate) => ({
  RateLimited: t('chat.rateLimited'),
  TableClosed: t('chat.closed'),
  NetworkError: t('chat.network')
} as Partial<Record<string, string>>)[error] ?? t('chat.failed')

/** The icon for each quick reaction; the server only knows the ids. */
const REACTION_ICONS: Record<string, string> = {
  sorrow: '😢', frustration: '😤', emptyPocket: '💸', win: '🎉', jackpot: '🎰', fire: '🔥', luck: '🍀', nervous: '😬'
}
const reactionIcon = (id: string) => REACTION_ICONS[id] ?? '💬'

type BetLine = ChatBetsData['bets'][number]

/** Where a bet sits, in words: "13", "Split 1-2", "Dozen 2", "Red". */
function spotOf (bet: BetLine, t: Translate): string {
  const kind = t(`bet.${bet.type}` as MessageKey)
  if (bet.type === 'STRAIGHT') return bet.pockets?.[0] ?? kind
  if (bet.pockets?.length) return `${kind} ${bet.pockets.join('-')}`
  if (bet.index) return `${kind} ${bet.index}`
  return kind
}

/** The table's own line about a player: what they bet, or how the round went for them. */
function tableLine (message: ChatMessage, who: string, t: Translate, number: (value: number) => string): string {
  if (message.kind === 'BETS') {
    const data = message.data as ChatBetsData
    const parts = data.bets.map(bet => t('chat.betPart', { amount: number(bet.amount), spot: spotOf(bet, t) })).join(', ')
    return t('chat.bets', { name: who, total: number(data.total), parts })
  }
  const data = message.data as ChatResultData
  const net = data.returned - data.staked
  const vars = { name: who, amount: number(Math.abs(net)), pocket: data.pocket, color: t(`color.${pocketColor(data.pocket)}` as MessageKey) }
  return t(data.jackpot ? 'chat.result.jackpot' : net > 0 ? 'chat.result.win' : net < 0 ? 'chat.result.lose' : 'chat.result.even', vars)
}

function readMuted (): Set<string> {
  try {
    const stored = JSON.parse(readSetting(MUTED_KEY, '[]'))
    return new Set(Array.isArray(stored) ? stored.filter(name => typeof name === 'string') : [])
  } catch { return new Set() }
}

interface Props {
  messages: ChatMessage[]
  /** The local player's seat id, to tell their own messages apart. */
  me: string
  send: (text: string) => Promise<ActionResult>
  react: (reaction: string) => Promise<ActionResult>
  /** Whether to show the table's lines about bets and results. */
  showBets: boolean
  report: (chatMessageId: number) => Promise<ActionResult>
}

/**
 * Table chat for online tables. Players can mute others (on this device) and
 * report messages to the moderators, as app stores require for user content.
 */
export function ChatPanel ({ messages, me, send, react, showBets, report }: Props) {
  const { t, date, number } = useI18n()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [muted, setMuted] = useState(readMuted)
  const [readUpTo, setReadUpTo] = useState(() => messages.at(-1)?.chatMessageId ?? 0)
  const list = useRef<HTMLOListElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const isLine = (message: ChatMessage) => message.kind === 'BETS' || message.kind === 'RESULT'
  const shown = useMemo(
    () => messages.filter(message => !muted.has(message.name) && (showBets || !isLine(message))),
    [messages, muted, showBets]
  )
  const mine = (message: ChatMessage) => String(message.roomPlayerId) === me
  // The table's own lines come every round: they don't count as unread.
  const unread = open ? 0 : shown.filter(message => message.chatMessageId > readUpTo && !mine(message) && !isLine(message)).length

  // While open, everything is read and the newest message stays in view.
  const newest = shown.at(-1)?.chatMessageId ?? 0
  useEffect(() => {
    if (!open) return
    setReadUpTo(newest)
    const element = list.current
    if (element) element.scrollTop = element.scrollHeight
  }, [open, newest])

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function submit (event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    const result = await send(text)
    setSending(false)
    if (result.ok) setDraft('')
    else setNotice(errorNotice(result.error, t))
  }

  async function sendReaction (reaction: string) {
    if (sending) return
    setSending(true)
    const result = await react(reaction)
    setSending(false)
    if (!result.ok) setNotice(errorNotice(result.error, t))
  }

  function mute (name: string) {
    const next = new Set(muted).add(name)
    setMuted(next)
    writeSetting(MUTED_KEY, JSON.stringify([...next]))
    setMenuFor(null)
    setNotice(t('chat.muted', { name }))
  }

  function unmuteAll () {
    setMuted(new Set())
    writeSetting(MUTED_KEY, '[]')
  }

  async function flag (message: ChatMessage) {
    setMenuFor(null)
    const result = await report(message.chatMessageId)
    setNotice(result.ok ? t('chat.reported') : t('chat.reportFailed'))
  }

  return (
    <>
      <button
        type="button"
        className={`chat-toggle${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls="table-chat"
        onClick={() => setOpen(value => !value)}
      >
        <svg className="chat-icon" viewBox="0 0 24 24" aria-hidden="true">
          {open
            ? <path d="M6 6l12 12M18 6L6 18" />
            : <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />}
        </svg>
        <span className="chat-toggle-label">{open ? t('chat.close') : t('chat.open')}</span>
        {unread > 0 && <span className="chat-unread" aria-label={t('chat.unread', { count: unread })}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <section id="table-chat" className="chat-panel" aria-label={t('chat.title')}>
          <header className="chat-head">
            <p className="eyebrow">{t('chat.title')}</p>
            {muted.size > 0 && <button type="button" className="link-button" onClick={unmuteAll}>{t('chat.unmute', { count: muted.size })}</button>}
          </header>
          <ol className="chat-list" ref={list} role="log" aria-live="polite">
            {shown.length === 0 && <li className="chat-empty">{t('chat.empty')}</li>}
            {shown.map(message => {
              const who = mine(message) ? t('lobby.you') : message.name
              if (isLine(message)) {
                return (
                  <li key={message.chatMessageId} className={`chat-line${message.kind === 'RESULT' && (message.data as ChatResultData).jackpot ? ' is-jackpot' : ''}`}>
                    <i className={`chat-dot seat-${message.seat ?? 0}`} aria-hidden="true" />
                    <span>{tableLine(message, who, t, number)}</span>
                  </li>
                )
              }
              if (message.kind === 'REACTION') {
                const label = t(`react.${message.text}` as MessageKey)
                return (
                  <li key={message.chatMessageId} className={`chat-reaction${mine(message) ? ' is-mine' : ''}`}>
                    <i className={`chat-dot seat-${message.seat ?? 0}`} aria-hidden="true" />
                    <strong>{who}</strong>
                    <span className="chat-reaction-icon" role="img" aria-label={t('chat.reacted', { name: who, reaction: label })}>{reactionIcon(message.text)}</span>
                    <span className="chat-reaction-label" aria-hidden="true">{label}</span>
                  </li>
                )
              }
              return (
              <li key={message.chatMessageId} className={mine(message) ? 'is-mine' : ''}>
                <p className="chat-meta">
                  <i className={`chat-dot seat-${message.seat ?? 0}`} aria-hidden="true" />
                  <strong>{who}</strong>
                  <time dateTime={message.sentAt}>{date(message.sentAt, TIME)}</time>
                  {!mine(message) && (
                    <button type="button" className="chat-more" aria-label={t('chat.options', { name: message.name })} aria-expanded={menuFor === message.chatMessageId} onClick={() => setMenuFor(current => current === message.chatMessageId ? null : message.chatMessageId)}>⋯</button>
                  )}
                </p>
                <p className="chat-text">{message.text}</p>
                {menuFor === message.chatMessageId && (
                  <div className="chat-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => mute(message.name)}>{t('chat.mute', { name: message.name })}</button>
                    <button type="button" role="menuitem" onClick={() => { void flag(message) }}>{t('chat.report')}</button>
                  </div>
                )}
              </li>
              )
            })}
          </ol>
          {notice && <p className="chat-notice" role="status">{notice}</p>}
          <div className="chat-reactions" role="group" aria-label={t('chat.reactions')}>
            {REACTIONS.map(id => (
              <button key={id} type="button" title={t(`react.${id}` as MessageKey)} aria-label={t('chat.react', { reaction: t(`react.${id}` as MessageKey) })} disabled={sending} onClick={() => { void sendReaction(id) }}>
                {reactionIcon(id)}
              </button>
            ))}
          </div>
          <form className="chat-form" onSubmit={submit}>
            <input
              ref={input}
              value={draft}
              maxLength={MAX_LENGTH}
              placeholder={t('chat.placeholder')}
              aria-label={t('chat.label')}
              enterKeyHint="send"
              onChange={event => setDraft(event.target.value)}
            />
            <button type="submit" className="btn-gold small" disabled={!draft.trim() || sending}>{t('chat.send')}</button>
          </form>
        </section>
      )}
    </>
  )
}
