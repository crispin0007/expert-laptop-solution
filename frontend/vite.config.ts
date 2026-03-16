import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// When running inside Docker the backend is reachable via the Docker-compose
// service name 'web', not 'localhost'. Set VITE_API_BASE in the container's
// environment to 'http://web:8000'. Locally (outside Docker) this falls back
// to http://localhost:8000 so zero config is required for local dev.
const API_TARGET = process.env.VITE_API_BASE ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,                          // listen on all interfaces (0.0.0.0)
    allowedHosts: ['localhost', '192.168.100.100', '192.168.100.109', '.localhost'],  // root + Barrier PC + all *.localhost subdomains
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        // Forward the original browser Host so Django TenantMiddleware can
        // extract the subdomain (e.g. pro.localhost → slug 'pro').
        // Without this, changeOrigin rewrites Host to the target hostname and
        // unauthenticated public endpoints (no X-Tenant-Slug header) lose
        // the tenant context.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const originalHost = req.headers.host
            if (originalHost) {
              proxyReq.setHeader('X-Forwarded-Host', originalHost)
            }
          })
        },
      },
      '/health': {
        target: API_TARGET,
        changeOrigin: true,
      },
      // Serve uploaded media files from the Django backend during development.
      // In production, Caddy serves /media/ directly from the shared volume.
      '/media': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
})
