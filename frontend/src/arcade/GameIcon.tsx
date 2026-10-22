import type { ArcadeScreen } from '../routes'

/** A line drawing for each game, in the colour of the text around it. */
export function GameIcon ({ game }: { game: ArcadeScreen }) {
  const common = { viewBox: '0 0 48 48', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: 'game-icon' } as const
  switch (game) {
    case 'aviator':
      return (
        <svg {...common}>
          <path d="M6 28l32-18c3-2 6 1 4 4L26 36l-4 8-4-10-12-6Z" />
          <path d="M18 34l8-9" />
        </svg>
      )
    case 'plinko':
      return (
        <svg {...common}>
          <circle cx="24" cy="8" r="3.6" />
          <circle cx="24" cy="18" r="1.4" fill="currentColor" />
          <circle cx="17" cy="26" r="1.4" fill="currentColor" /><circle cx="31" cy="26" r="1.4" fill="currentColor" />
          <circle cx="10" cy="34" r="1.4" fill="currentColor" /><circle cx="24" cy="34" r="1.4" fill="currentColor" /><circle cx="38" cy="34" r="1.4" fill="currentColor" />
          <path d="M6 42h8M18 42h12M34 42h8" />
        </svg>
      )
    case 'wheel':
      return (
        <svg {...common}>
          <circle cx="24" cy="26" r="16" />
          <circle cx="24" cy="26" r="3" />
          <path d="M24 10v13M24 29v13M8 26h13M27 26h13M12.7 14.7l9.2 9.2M26.1 28.1l9.2 9.2M35.3 14.7l-9.2 9.2M21.9 28.1l-9.2 9.2" />
          <path d="M24 3l-3.4 6h6.8L24 3Z" fill="currentColor" />
        </svg>
      )
    case 'horses':
      return (
        <svg {...common}>
          <path d="M14 40V22c0-7 4-12 10-12s10 5 10 12v18" />
          <path d="M14 40h-6l2-7M34 40h6l-2-7" />
          <circle cx="14" cy="28" r="1.2" fill="currentColor" /><circle cx="14" cy="34" r="1.2" fill="currentColor" />
          <circle cx="34" cy="28" r="1.2" fill="currentColor" /><circle cx="34" cy="34" r="1.2" fill="currentColor" />
          <circle cx="16" cy="20" r="1.2" fill="currentColor" /><circle cx="32" cy="20" r="1.2" fill="currentColor" />
        </svg>
      )
  }
}
