import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: { global: 'window' },
  server: {
    allowedHosts: true,
    host: true,
    hmr: {
      protocol: 'wss',
      clientPort: 443
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        headers: { "ngrok-skip-browser-warning": "true" }
      },
      '/ws-music': {
        target: 'http://localhost:8080',
        ws: true,
        changeOrigin: true,
        secure: false,
        headers: {
          "ngrok-skip-browser-warning": "true"
        }
      }
    }
  }
})