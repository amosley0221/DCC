import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  // Electron loads the bundle off the filesystem, so every asset URL must be relative.
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, '../../shared') },
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
  server: { port: 5273, strictPort: true },
})
