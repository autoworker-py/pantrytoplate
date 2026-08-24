import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // listen on the LAN too, so a phone on the same Wi-Fi can open the app
    host: true,
    // Vite rejects requests whose Host header it does not recognise. A tunnel
    // arrives as a *.trycloudflare.com hostname, which is how we get an https
    // origin — and the camera API only exists on a secure origin.
    allowedHosts: ['.trycloudflare.com'],
    // API calls go to the backend through this proxy, so the deployed build
    // only ever needs one origin (or VITE_API_URL for a split deployment).
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
