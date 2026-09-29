/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Deployed at the root of the GitHub Pages project site
  // (github.com/ranamrameez/WealthCrescent -> ranamrameez.github.io/WealthCrescent/).
  // The legacy static apps that used to occupy the repo root (and the
  // /webapp/ subpath this app used to deploy to alongside them) are gone —
  // see .github/workflows/static.yml's own history/comment for why. HashRouter
  // means routing itself doesn't care about the base path; this only
  // affects built asset URLs.
  base: '/WealthCrescent/',
  build: {
    // Do not force source features into manual chunks: Planning, Cash,
    // Banking, Transfers, and Account intentionally share components and
    // stores, and manual feature boundaries can turn those cycles into a
    // production-only temporal-dead-zone crash. Vendor libraries remain
    // isolated below; route-level dynamic imports are the safe future path.
    chunkSizeWarningLimit: 1900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('firebase')) return 'vendor-firebase'
          if (id.includes('chart.js') || id.includes('react-chartjs-2') || id.includes('chartjs-plugin-datalabels')) return 'vendor-charts'
          if (id.includes('react') || id.includes('zustand')) return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
