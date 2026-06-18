import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { gcosIoAliases } from '../../.gcos/vite-aliases.mjs';

const appRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: appRoot,
  plugins: [react()],
  appType: 'spa',
  resolve: {
    alias: {
      ...gcosIoAliases,
    },
  },
  server: {
    fs: {
      allow: [appRoot, resolve(appRoot, '../../.gcos'), resolve(appRoot, '../shared')],
    },
  },
});
