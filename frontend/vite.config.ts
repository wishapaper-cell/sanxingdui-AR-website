import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['.trycloudflare.com', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true
      },
      '/public': {
        target: backendTarget,
        changeOrigin: true
      },
      '/ar-wear.html': {
        target: backendTarget,
        changeOrigin: true
      },
      '/mediapipe-facemesh': {
        target: backendTarget,
        changeOrigin: true
      },
      '/node_modules/@mediapipe/tasks-vision': {
        target: backendTarget,
        changeOrigin: true
      },
      '/generated-mask.glb': {
        target: backendTarget,
        changeOrigin: true
      }
    }
  }
});
