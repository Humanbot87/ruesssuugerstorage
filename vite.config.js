import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Diese Datei sagt Vite, dass es den React-Code verarbeiten soll
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000
  }
})
