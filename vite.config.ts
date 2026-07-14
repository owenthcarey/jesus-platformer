import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs work for both custom domains and /repository/ GitHub Pages URLs.
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    // Phaser ships as a deliberately feature-rich runtime; this avoids a noisy
    // warning while keeping it in one cacheable game bundle.
    chunkSizeWarningLimit: 1600,
  },
});
