import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: { global: 'window' },
  server: {
    allowedHosts: true, // Blocked error fix panna
    host: true,
    hmr: {
      // Vite-oda internal websocket error-ah fix panna
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
        // 🔥 Add this to bypass the Ngrok warning for the WebSocket handshake
        headers: {
          "ngrok-skip-browser-warning": "true"
        }
      }
    }
  }
})