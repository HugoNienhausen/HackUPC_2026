import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// https://vite.dev/config/
// Allow the agent (serve.ts) to override the proxy target by env var so that
// running multiple `devmap feature` instances on different `--port-server`
// values doesn't make every Vite proxy back to :3000.
const apiPort = process.env.DEVMAP_API_PORT ?? '3000';
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/feature.json': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/repo': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
