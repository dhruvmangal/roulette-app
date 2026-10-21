import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const CANDIDATES_DIR = fileURLToPath(new URL('./assets-src/candidates', import.meta.url))

/**
 * Dev only: lists models dropped in assets-src/candidates/ so they can be trialled as dealers.
 * Production builds get an empty list, so candidate files are never referenced or bundled.
 */
function dealerCandidates (): Plugin {
  const id = 'virtual:dealer-candidates'
  let serving = false
  return {
    name: 'dealer-candidates',
    configResolved (config) { serving = config.command === 'serve' },
    resolveId (source) { return source === id ? `\0${id}` : undefined },
    load (resolved) {
      if (resolved !== `\0${id}`) return
      const files = serving && existsSync(CANDIDATES_DIR) ? readdirSync(CANDIDATES_DIR).filter(file => /\.(vrm|glb)$/i.test(file)) : []
      return `export default ${JSON.stringify(files.map(file => ({ file, url: `/@fs${CANDIDATES_DIR}/${file}` })))}`
    }
  }
}

export default defineConfig({
  plugins: [react(), dealerCandidates()],
  // Use the packages' TypeScript source directly so dev and lint need no prebuilt dist.
  resolve: {
    alias: {
      '@roulette/engine': fileURLToPath(new URL('../packages/roulette-engine/src/index.ts', import.meta.url)),
      '@roulette/game-client': fileURLToPath(new URL('../packages/game-client/src/index.ts', import.meta.url)),
      '@roulette/contracts': fileURLToPath(new URL('../packages/contracts/src/index.ts', import.meta.url)),
      '@roulette/api-client': fileURLToPath(new URL('../packages/api-client/src/index.ts', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Reached through a tunnel or Discord's proxy, whose host names aren't known in advance.
    allowedHosts: true,
    // Running Vite outside Docker (e.g. `npx vite --port 5188`): send API and
    // socket traffic to the stack. Behind nginx these paths never reach Vite.
    proxy: {
      '/api': process.env.VITE_API_PROXY ?? 'http://localhost',
      '/socket.io': { target: process.env.VITE_API_PROXY ?? 'http://localhost', ws: true }
    }
  }
})
