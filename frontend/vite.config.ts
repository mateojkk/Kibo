import { defineConfig } from 'vite'
import type { UserConfigExport } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  envDir: '..',
  plugins: [react()],
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
  build: {
    outDir: '../dist',
    chunkSizeWarningLimit: 3000,
  },
  resolve: {
    alias: {
      eventemitter3: 'eventemitter3',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'global',
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
} as UserConfigExport)
