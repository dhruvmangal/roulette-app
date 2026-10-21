import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served under /admin/ by the stack's nginx, next to the game at /.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    // Running Vite outside Docker: send API calls to the stack.
    proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost' }
  }
})
