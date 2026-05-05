import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Stub out Deno/ESM CDN imports so Vitest can load shared Edge Function modules
      {
        find: /^https:\/\/esm\.sh\/.*/,
        replacement: new URL('./tests/__mocks__/esm-stub.js', import.meta.url).pathname,
      },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    globals: true,
  },
})
