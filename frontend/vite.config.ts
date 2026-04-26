import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// When running inside Docker the backend is reachable via the Docker-compose
// service name 'web', not 'localhost'. Set VITE_API_BASE in the container's
// environment to 'http://web:8000'. Locally (outside Docker) this falls back
// to http://localhost:18000 because the backend is exposed on host port 18000.
const API_TARGET = process.env.VITE_API_BASE ?? 'http://localhost:18000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Split into smaller chunks so Node doesn't need to hold the entire bundle
    // in memory at once during the render-chunks stage (prevents OOM on servers
    // with limited RAM).
    // GrapeJS (CMS visual editor) is inherently ~1.1 MB minified — it is already
    // correctly isolated to the /cms/pages/:id/edit route via React.lazy().
    // Raise the warning threshold above its size to suppress the false positive.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          'vendor-query':   ['@tanstack/react-query'],
          'vendor-ui':      ['lucide-react', 'react-hot-toast'],
          'vendor-axios':   ['axios'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,                          // listen on all interfaces (0.0.0.0)
    watch: {
      // Docker on macOS doesn't forward inotify events through volume mounts,
      // so Vite HMR silently stops working. Polling ensures changes are detected.
      usePolling: true,
      interval: 300,
    },
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
