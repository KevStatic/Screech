import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Phones need HTTPS for mic access. The self-signed cert lets devices on the
// same Wi-Fi reach the dev server (accept the browser warning once).
// Under `netlify dev` (NETLIFY_DEV set) Netlify's proxy terminates TLS, so
// Vite serves plain HTTP on 5173.
const plugins = [react(), ...(process.env.NETLIFY_DEV ? [] : [basicSsl()])];

export default defineConfig({
  plugins,
  server: { host: true, port: 5173, strictPort: true },
});
