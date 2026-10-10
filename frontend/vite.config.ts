import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The API (`uv run api`): chat and the catalogue endpoints, proxied so the browser
    // sees one origin, no CORS.
    proxy: {
      '/chat': 'http://127.0.0.1:8010',
      '/tables': 'http://127.0.0.1:8010',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
