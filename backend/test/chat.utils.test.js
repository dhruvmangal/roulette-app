import { cleanChatText, summarizeBets } from '~/utils/chat.utils'

describe('cleanChatText', () => {
  it('collapses whitespace and line breaks into single spaces', () => {
    expect(cleanChatText('  nice\n\n spin   everyone\t ')).toBe('nice spin everyone')
  })

  it('removes invisible characters that could hide words or garble screens', () => {
    expect(cleanChatText('he​llo ‮evil‬')).toBe('hello evil')
    expect(cleanChatText('\u0000\u0007')).toBe('')
  })

  it('caps messages at 200 characters', () => {
    expect(cleanChatText('a'.repeat(500))).toHaveLength(200)
  })

  it('masks blocked words, whatever their case or ending', () => {
    expect(cleanChatText('what the FUCK, that was shitty')).toBe('what the F***, that was s*****')
  })

  it('does not mask words that only contain a blocked word', () => {
    expect(cleanChatText('Scunthorpe classic, a passage')).toBe('Scunthorpe classic, a passage')
  })

  it('keeps emoji and accented names', () => {
    expect(cleanChatText('🎉 bien joué, Zoë!')).toBe('🎉 bien joué, Zoë!')
  })
})

describe('summarizeBets', () => {
  const bet = (betType, selection, amount) => ({ betType, selection, amount })

  it('merges bets on the same spot and totals the stake', () => {
    const summary = summarizeBets([bet('STRAIGHT', { pockets: ['13'] }, 10), bet('RED', {}, 25), bet('STRAIGHT', { pockets: ['13'] }, 15)])
    expect(summary).toEqual({
      total: 50,
      bets: [{ type: 'STRAIGHT', pockets: ['13'], amount: 25 }, { type: 'RED', amount: 25 }]
    })
  })

  it('keeps different spots of the same kind apart', () => {
    const summary = summarizeBets([bet('DOZEN', { index: 1 }, 5), bet('DOZEN', { index: 2 }, 5)])
    expect(summary.bets).toHaveLength(2)
  })
})
