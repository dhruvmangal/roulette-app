const escapeHtml = (text) => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

/**
 * The page behind a shared link (/join/CODE for a table, /r/CODE for a
 * referral). Chat apps read its Open Graph tags to show a preview card; people
 * are sent straight on to the game, which seats them or applies the code.
 */
export const createInvitePageTemplate = ({
  title, description, imageUrl, pageUrl, gameUrl,
  imageAlt = 'An invitation to a private roulette table',
  callToAction = 'Take your seat →'
}) => {
  const [t, d, image, page, game, alt, cta] = [title, description, imageUrl, pageUrl, gameUrl, imageAlt, callToAction].map(escapeHtml)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t}</title>
  <meta name="description" content="${d}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Roulette">
  <meta property="og:title" content="${t}">
  <meta property="og:description" content="${d}">
  <meta property="og:url" content="${page}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${alt}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${t}">
  <meta name="twitter:description" content="${d}">
  <meta name="twitter:image" content="${image}">
  <meta name="theme-color" content="#07070b">
  <meta http-equiv="refresh" content="0; url=${game}">
  <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07070b;color:#f5efe2;font:16px system-ui,sans-serif;text-align:center}a{color:#e8c36a}</style>
</head>
<body>
  <p>${t}<br><a href="${game}">${cta}</a></p>
</body>
</html>
`
}
