import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, type Connect, type Plugin } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(root, 'data');

function scanDataPlugin(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const raw = (req.url || '').split('?')[0];
    const match = raw.match(/\/data\/([^/]+\.json)$/);
    if (!match) return next();
    const file = path.resolve(dataDir, match[1]);
    if (!file.startsWith(dataDir + path.sep)) return next();
    if (!fs.existsSync(file)) return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(file).pipe(res);
  };

  return {
    name: 'scan-data',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
    closeBundle() {
      const dest = path.resolve(root, 'dist', 'data');
      fs.mkdirSync(dest, { recursive: true });
      if (!fs.existsSync(dataDir)) return;
      for (const name of fs.readdirSync(dataDir)) {
        if (!name.endsWith('.json')) continue;
        fs.copyFileSync(path.join(dataDir, name), path.join(dest, name));
      }
    },
  };
}

export default defineConfig(() => {
  const base = process.env.VITE_BASE_PATH || '/';
  return {
    base,
    plugins: [react(), tailwindcss(), scanDataPlugin()],
    resolve: {
      alias: {
        '@': root,
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
