import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `npm run dev:cloud` (mode "cloud"): run the UI locally against the deployed AWS API.
  // The dev server forwards /api/* to CloudFront, so the browser stays same-origin (no CORS)
  // and nothing runs on LocalStack. Target comes from the shell or frontend/.env.cloud.local.
  const env = loadEnv(mode, '.', '')
  const cloudTarget = mode === 'cloud' ? env.VITE_PROXY_TARGET : undefined
  if (mode === 'cloud' && !cloudTarget) {
    throw new Error('Set VITE_PROXY_TARGET to the CloudFront URL, e.g. VITE_PROXY_TARGET=https://dxxxx.cloudfront.net npm run dev:cloud')
  }

  return {
    plugins: [react()],
    server: {
      port: 3000,
      ...(cloudTarget && {
        proxy: { '/api': { target: cloudTarget.replace(/\/$/, ''), changeOrigin: true, secure: true } },
      }),
    },
    // Vitest: browser-like DOM, shared setup; tests live in tests/, mirroring src/ (*.test.js[x])
    test: {
      environment: 'jsdom',
      setupFiles: './tests/setup.js',
      include: ['tests/**/*.test.{js,jsx}'],
    },
  }
})
