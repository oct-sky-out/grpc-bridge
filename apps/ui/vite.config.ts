import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: '.',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // Tauri expects the build output in the parent's dist directory
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  // Clear the screen during dev
  clearScreen: false,
  server: {
    // Tauri expects a fixed port
    strictPort: true,
    port: 5173,
  },
});
