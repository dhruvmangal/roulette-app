import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { ROUTES, SITE_NAME, sitemapPaths, type Route } from '../src/routes'

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** `html` (the built index page) with the tags that differ per page pointed at `route`. */
function pageFor (html: string, route: Route, origin: string): string {
  const title = escape(route.title)
  const description = escape(route.description)
  const url = origin ? origin + route.path : ''
  const head = [
    url && `<link rel="canonical" href="${url}" />`,
    url && `<meta property="og:url" content="${url}" />`
  ].filter(Boolean).join('\n    ')
  const structured = origin && route.screen === 'home'
    ? `\n    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: SITE_NAME,
      url,
      description: route.description,
      applicationCategory: 'GameApplication',
      genre: 'Casino game (play chips only)',
      operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
    }).replace(/</g, '\\u003c')}</script>`
    : ''
  const links = ROUTES.filter(other => other.indexable).map(other => `<li><a href="${other.path}">${escape(other.title.split(/[:|]/)[0].trim())}</a></li>`).join('')
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${description}"`)
    .replace(/(<meta name="robots" content=")[^"]*"/, `$1${route.indexable ? 'index, follow' : 'noindex, nofollow'}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${title}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${description}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${title}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${description}"`)
    .replace('</head>', `${head ? `  ${head}` : ''}${structured}\n  </head>`)
    // What a crawler or a reader without scripts sees; the app replaces it as soon as it loads.
    .replace('<!--seo:noscript-->', `<noscript><main><h1>${title}</h1><p>${description}</p><p>Roulette needs JavaScript to run.</p><nav><ul>${links}</ul></nav></main></noscript>`)
}

/**
 * Build only. Writes one HTML page per route (each with its own title,
 * description, canonical address and a noscript summary), plus sitemap.xml and
 * robots.txt. The site's address comes from VITE_SITE_URL; without it the
 * canonical, sitemap and structured data are left out rather than guessed.
 */
export function seoPages (siteUrl = process.env.VITE_SITE_URL ?? ''): Plugin {
  const origin = siteUrl.replace(/\/+$/, '')
  let outDir = ''
  return {
    name: 'seo-pages',
    apply: 'build',
    configResolved (config) { outDir = resolve(config.root, config.build.outDir) },
    // Vite writes index.html last, so the pages are derived from the finished file.
    closeBundle () {
      const indexPath = resolve(outDir, 'index.html')
      if (!existsSync(indexPath)) return
      const html = readFileSync(indexPath, 'utf8')
      for (const route of ROUTES) {
        const page = pageFor(html, route, origin)
        writeFileSync(resolve(outDir, route.path === '/' ? 'index.html' : `${route.path.slice(1)}.html`), page)
      }
      const robots = ['User-agent: *', 'Allow: /', ...ROUTES.filter(route => !route.indexable).map(route => `Disallow: ${route.path}`)]
      if (origin) robots.push('', `Sitemap: ${origin}/sitemap.xml`)
      writeFileSync(resolve(outDir, 'robots.txt'), robots.join('\n') + '\n')
      if (origin) {
        const urls = sitemapPaths().map(path => `  <url><loc>${origin}${path}</loc></url>`).join('\n')
        writeFileSync(resolve(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
      }
    }
  }
}
