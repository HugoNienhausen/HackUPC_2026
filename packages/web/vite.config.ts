import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// https://vite.dev/config/
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
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/repo': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
