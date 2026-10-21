import { CHAT_BLOCKED_WORDS, CHAT_KINDS, CHAT_MAX_LENGTH } from '~/utils/constants/game.constants'

// Control and invisible formatting characters (zero-width joiners, bidi
// overrides) can hide words from the filter or garble other people's screens.
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu
const BLOCKED = new RegExp(`\\b(${CHAT_BLOCKED_WORDS.join('|')})\\w*`, 'gi')

/**
 * A chat message as it will be stored and shown: invisible characters removed,
 * whitespace collapsed, capped in length, blocked words masked. Empty when
 * nothing printable is left.
 */
export const cleanChatText = (text) => text
  .normalize('NFKC')
  // Whitespace first, so a line break becomes a space rather than vanishing.
  .replace(/\s+/g, ' ')
  .replace(INVISIBLE, '')
  .trim()
  .slice(0, CHAT_MAX_LENGTH)
  .replace(BLOCKED, word => word[0] + '*'.repeat(word.length - 1))

export const toChatView = (message, seat, name) => ({
  chatMessageId: message.chatMessageId,
  roomPlayerId: message.roomPlayerId,
  seat,
  name,
  text: message.text,
  sentAt: message.createdAt,
  kind: message.kind ?? CHAT_KINDS.TEXT,
  data: message.data ?? null
})

/**
 * What a player put down, as the chat line shows it: bets on the same spot are
 * merged, in the order first placed. `bets` are rows with betType, selection, amount.
 */
export const summarizeBets = (bets) => {
  const merged = new Map()
  for (const { betType, selection, amount } of bets) {
    const key = `${betType}:${JSON.stringify(selection)}`
    const known = merged.get(key)
    if (known) known.amount += amount
    else merged.set(key, { type: betType, ...selection, amount })
  }
  const lines = [...merged.values()]
  return { total: lines.reduce((sum, bet) => sum + bet.amount, 0), bets: lines }
}

/** The English fallback stored in the line's text; clients draw their own wording from `data`. */
export const describeBets = ({ total, bets }) => `${total} chips: ${bets.map(bet => `${bet.amount} on ${bet.pockets?.join('-') ?? bet.type}`).join(', ')}`.slice(0, 200)
