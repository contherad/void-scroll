import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

// Standalone web build for GitHub Pages.
//
// This is NOT the Devvit build (see vite.config.ts for that). It builds only the
// game client (src/client/index.html -> game.tsx -> App.tsx) as a static SPA,
// without the @devvit/start `devvit()` plugin and without the splash/server
// pieces. The game runs fully client-side; server-backed features (leaderboard,
// daily, share) are no-ops here because there is no Devvit backend — the client
// already wraps those /api/* calls in try/catch, so it degrades gracefully.
//
// Served at https://contherad.github.io/void-scroll/, hence base.
export default defineConfig({
  base: '/void-scroll/',
  root: 'src/client',
  plugins: [react(), tailwind()],
  build: {
    outDir: '../../dist-web',
    emptyOutDir: true,
  },
});
