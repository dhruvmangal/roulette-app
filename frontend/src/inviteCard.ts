import { variantTitle, type InviteDetails } from './invite'

const SIZE = 1080
const GOLD = '#e8c36a'
const GOLD_HI = '#fbe3a1'
const GOLD_LO = '#a97b2c'
const INK = '#f5efe2'
const MUTED = '#a49e92'
const RED = '#c8283c'
const BLACK = '#15151c'
const GREEN = '#0f8a5a'

const goldGradient = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
  gradient.addColorStop(0, GOLD_HI)
  gradient.addColorStop(0.45, GOLD)
  gradient.addColorStop(1, GOLD_LO)
  return gradient
}

/** A roulette wheel seen from above: pockets, rim and hub. */
function drawWheel (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, pockets: number) {
  ctx.save()
  ctx.shadowColor = 'rgba(232, 195, 106, 0.35)'
  ctx.shadowBlur = 60
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = goldGradient(ctx, cx - radius, cy - radius, cx + radius, cy + radius)
  ctx.fill()
  ctx.restore()

  const inner = radius * 0.9
  const step = (Math.PI * 2) / pockets
  for (let i = 0; i < pockets; i++) {
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, inner, i * step - Math.PI / 2, (i + 1) * step - Math.PI / 2)
    ctx.closePath()
    ctx.fillStyle = i === 0 ? GREEN : i % 2 ? RED : BLACK
    ctx.fill()
    ctx.strokeStyle = 'rgba(232, 195, 106, 0.55)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.arc(cx, cy, inner * 0.62, 0, Math.PI * 2)
  ctx.fillStyle = '#101018'
  ctx.fill()
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 4
  ctx.stroke()

  // Hub and turret spokes.
  ctx.strokeStyle = goldGradient(ctx, cx - 60, cy - 60, cx + 60, cy + 60)
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(angle) * inner * 0.5, cy + Math.sin(angle) * inner * 0.5)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(cx, cy, inner * 0.14, 0, Math.PI * 2)
  ctx.fillStyle = goldGradient(ctx, cx - 30, cy - 30, cx + 30, cy + 30)
  ctx.fill()

  // The ball.
  const ballAngle = -Math.PI / 2 + step * 7.5
  ctx.beginPath()
  ctx.arc(cx + Math.cos(ballAngle) * inner * 0.8, cy + Math.sin(ballAngle) * inner * 0.8, radius * 0.06, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
}

/** Draws text with even spacing between letters (canvas letterSpacing is not everywhere yet). */
function spacedText (ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const widths = [...text].map(char => ctx.measureText(char).width)
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * (text.length - 1)
  let x = cx - total / 2
  ctx.textAlign = 'left';
  [...text].forEach((char, i) => {
    ctx.fillText(char, x, y)
    x += widths[i] + spacing
  })
  ctx.textAlign = 'center'
}

/** Shrinks a font until the text fits the width. */
function fitFont (ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, maxWidth: number) {
  let current = size
  do {
    ctx.font = `${weight} ${current}px ${family}`
    current -= 2
  } while (ctx.measureText(text).width > maxWidth && current > 18)
}

/** The invite as a square picture (PNG) to send along with the message. */
export async function renderInviteCard ({ code, variant, from }: InviteDetails): Promise<Blob> {
  await Promise.all([
    document.fonts.load('600 64px Cinzel'),
    document.fonts.load('600 32px Manrope'),
    document.fonts.load('700 32px Manrope'),
    document.fonts.load('600 96px "JetBrains Mono"')
  ]).catch(() => {})

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const background = ctx.createRadialGradient(SIZE / 2, SIZE * 0.3, 40, SIZE / 2, SIZE / 2, SIZE * 0.8)
  background.addColorStop(0, '#1d1d2b')
  background.addColorStop(1, '#07070b')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Frame.
  ctx.strokeStyle = 'rgba(232, 195, 106, 0.35)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(36, 36, SIZE - 72, SIZE - 72, 44)
  ctx.stroke()

  drawWheel(ctx, SIZE / 2, 290, 180, variant === 'AMERICAN' ? 38 : 37)

  ctx.fillStyle = GOLD
  ctx.font = '700 26px Manrope, system-ui, sans-serif'
  spacedText(ctx, 'PRIVATE TABLE', SIZE / 2, 545, 9)

  ctx.fillStyle = INK
  ctx.font = '600 76px Cinzel, Georgia, serif'
  ctx.fillText('You’re invited', SIZE / 2, 630)

  const line = from ? `${from} saved you a seat at` : 'A seat is waiting for you at'
  ctx.fillStyle = MUTED
  fitFont(ctx, line, 600, 36, 'Manrope, system-ui, sans-serif', SIZE - 200)
  ctx.fillText(line, SIZE / 2, 695)
  ctx.fillStyle = INK
  ctx.font = '700 40px Manrope, system-ui, sans-serif'
  ctx.fillText(`${variantTitle(variant)} roulette`, SIZE / 2, 745)

  // The code, in a dashed ticket.
  const boxWidth = 620
  const boxHeight = 150
  const boxX = (SIZE - boxWidth) / 2
  const boxY = 800
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
  ctx.beginPath()
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 28)
  ctx.fill()
  ctx.setLineDash([14, 10])
  ctx.strokeStyle = 'rgba(232, 195, 106, 0.7)'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = MUTED
  ctx.font = '700 20px Manrope, system-ui, sans-serif'
  spacedText(ctx, 'TABLE CODE', SIZE / 2, boxY + 40, 6)
  ctx.fillStyle = goldGradient(ctx, boxX, boxY, boxX + boxWidth, boxY + boxHeight)
  ctx.font = '600 84px "JetBrains Mono", ui-monospace, monospace'
  spacedText(ctx, code, SIZE / 2, boxY + 122, 22)

  ctx.fillStyle = '#6e695f'
  ctx.font = '600 24px Manrope, system-ui, sans-serif'
  ctx.fillText('Tap the link to join · Play chips only, no real money', SIZE / 2, 1008)

  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not draw the invite'))), 'image/png'))
}
