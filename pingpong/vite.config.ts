import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = Number(process.env.PORT ?? 8080);

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build also works from a sub-path (static demo hosting).
  base: './',
  build: { outDir: 'dist/client', sourcemap: true, chunkSizeWarningLimit: 1200 },
  server: {
    host: true,
    port: 5173,
    proxy: { '/ws': { target: `ws://localhost:${serverPort}`, ws: true } },
  },
});
