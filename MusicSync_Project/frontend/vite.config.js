import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* global process */
const backend = process.env.BACKEND_URL || 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  build: {
    // The production build is served by Spring Boot, so one jar runs the whole app.
    outDir: '../backend/music-sync-backend/src/main/resources/static',
    emptyOutDir: true,
  },
  server: {
    allowedHosts: true,
    proxy: {
      '/api': backend,
      '/ws': { target: backend, ws: true },
    },
  },
})
