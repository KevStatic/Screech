import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Phones need HTTPS for mic access. The self-signed cert lets devices on the
// same Wi-Fi reach the dev server (accept the browser warning once).
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: { host: true, port: 5173, strictPort: true },
});
