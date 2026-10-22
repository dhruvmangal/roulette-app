import { SITE_NAME, type Route } from './routes'

function setTag (selector: string, create: () => HTMLElement, attribute: string, value: string) {
  let element = document.head.querySelector<HTMLElement>(selector)
  if (!element) {
    element = create()
    document.head.appendChild(element)
  }
  element.setAttribute(attribute, value)
}

const meta = (key: 'name' | 'property', name: string, content: string) =>
  setTag(`meta[${key}="${name}"]`, () => { const tag = document.createElement('meta'); tag.setAttribute(key, name); return tag }, 'content', content)

/**
 * Points the page's title, description, canonical address and share previews at
 * `route`. The same tags are written into the built pages; this keeps them right
 * as the player moves between screens without a reload.
 */
export function applyRouteMeta (route: Route, origin = window.location.origin) {
  const url = origin + route.path
  document.title = route.title
  meta('name', 'description', route.description)
  meta('name', 'robots', route.indexable ? 'index, follow' : 'noindex, nofollow')
  setTag('link[rel="canonical"]', () => { const tag = document.createElement('link'); tag.rel = 'canonical'; return tag }, 'href', url)
  meta('property', 'og:title', route.title)
  meta('property', 'og:description', route.description)
  meta('property', 'og:url', url)
  meta('property', 'og:site_name', SITE_NAME)
  meta('name', 'twitter:title', route.title)
  meta('name', 'twitter:description', route.description)
}
