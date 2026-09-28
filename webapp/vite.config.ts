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
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll('\\', '/')
          const feature = normalized.match(/\/src\/features\/([^/]+)\//)?.[1]
          if (feature) return `feature-${feature}`
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
