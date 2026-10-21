import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://127.0.0.1:4000' } },
  build: {
    emptyOutDir: false,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          react: ['react', 'react-dom', 'react-router-dom'],
          forms: ['react-hook-form', 'zod', '@hookform/resolvers/zod'],
        },
      },
    },
  },
});
