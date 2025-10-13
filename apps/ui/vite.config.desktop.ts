import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Desktop build configuration for Tauri
export default defineConfig({
  root: '.',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    // Platform identifier for runtime detection
    'import.meta.env.VITE_PLATFORM': JSON.stringify('desktop'),
  },
  build: {
    outDir: '../../dist/desktop',
    emptyOutDir: true,
    // Tauri-specific optimizations
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
  },
  clearScreen: false,
  server: {
    strictPort: true,
    port: 5173,
    host: '0.0.0.0',
  },
});
