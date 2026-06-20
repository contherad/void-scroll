import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone prototype config. In a Devvit Web project the client lives under
// src/client/ and is built by `npm run build` alongside the server bundle.
//
// For the GitHub Pages build, assets must be served from the repo subpath
// (https://contherad.github.io/void-scroll/), so `base` is set at build time.
// Dev keeps serving from root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/void-scroll/' : '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
}));
