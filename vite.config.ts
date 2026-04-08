import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'FairRent Canada',
        short_name: 'FairRent',
        description:
          'Estimate fair monthly rent in Canada using ownership costs and CMHC-style market references.',
        theme_color: '#f5f3ff',
        background_color: '#faf5ff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  server: {
    proxy: {
      // Avoid browser CORS when fetching Statistics Canada CSV zips in dev.
      '/statcan': {
        target: 'https://www150.statcan.gc.ca',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/statcan/, ''),
      },
      '/oeb': {
        target: 'https://www.oeb.ca',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/oeb/, ''),
      },
      '/cmhc-assets': {
        target: 'https://assets.cmhc-schl.gc.ca',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cmhc-assets/, ''),
      },
      '/cmhc-www': {
        target: 'https://www.cmhc-schl.gc.ca',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cmhc-www/, ''),
      },
      // Geocodio: browser direct calls can fail CORS; dev uses same-origin + proxy.
      '/geocodio': {
        target: 'https://api.geocod.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/geocodio/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
