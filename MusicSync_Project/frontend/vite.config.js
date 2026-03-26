import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: { global: 'window' },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws-music': {
        target: 'http://localhost:8080',
        ws: true
      }
    }
  }
})