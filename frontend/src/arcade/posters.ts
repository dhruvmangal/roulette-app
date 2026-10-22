import type { ArcadeScreen } from '../routes'

/** The artwork behind each game's card (public/games/*.jpg). */
export const posterOf = (game: ArcadeScreen) => `${import.meta.env.BASE_URL}games/${game}.jpg`
