import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Talks ONLY to /api/* → proxied to the central drivn-server (dev :8080), the
// only process with BigQuery access. Own dev port so it can run alongside the
// dashboard/reporting apps.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5182,
    proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } },
  },
})
