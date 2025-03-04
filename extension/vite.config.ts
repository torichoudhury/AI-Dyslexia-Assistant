import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        content: resolve(__dirname, 'public/content.js'),
        background: resolve(__dirname, 'public/background.js')
      },
      output: {
        entryFileNames: (assetInfo) => {
          return assetInfo.name === 'main' ? 'assets/[name]-[hash].js' : '[name].js';
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});