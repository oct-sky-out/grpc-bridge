import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Web build configuration for Go server
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
    'import.meta.env.VITE_PLATFORM': JSON.stringify('web'),
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    // Web-specific optimizations
    target: 'es2020',
    minify: 'terser',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['@radix-ui/react-slot', '@radix-ui/react-select'],
          'vendor-state': ['zustand'],
        },
      },
    },
  },
  clearScreen: false,
  server: {
    strictPort: false,
    port: 5174, // Different port for web dev
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
