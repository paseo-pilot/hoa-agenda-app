import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/agenda2/',
  plugins: [react()],
  server: {
    port: 8091,
    proxy: {
      '/api': 'http://127.0.0.1:8090',
    },
  },
});
