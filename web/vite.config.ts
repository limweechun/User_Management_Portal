import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The portal is served by the IAM service at /portal (and at /), so built asset URLs must
// resolve under /portal/. In dev we proxy /api to the live IAM at :5100 so the wo_id login
// cookie flows on the same origin (no CORS) exactly like production.
export default defineConfig({
  base: '/portal/',
  plugins: [react()],
  server: {
    port: 4174,
    proxy: {
      '/api': { target: 'http://localhost:5100', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
