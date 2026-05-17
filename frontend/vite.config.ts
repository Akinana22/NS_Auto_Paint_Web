import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

function readmePlugin() {
  const readmePath = path.resolve(__dirname, '../README.md');
  const virtualId = 'virtual:readme';
  const resolvedVirtualId = '\0' + virtualId;
  return {
    name: 'virtual-readme',
    resolveId(id: string) {
      if (id === virtualId) return resolvedVirtualId;
    },
    load(id: string) {
      if (id === resolvedVirtualId) {
        const content = fs.readFileSync(readmePath, 'utf8');
        return `export default ${JSON.stringify(content)}`;
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [readmePlugin(), react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@compiler': path.resolve(__dirname, 'src/compiler'),
      '@serial': path.resolve(__dirname, 'src/serial'),
      '@components': path.resolve(__dirname, 'src/components'),
    },
  },
  server: {
    port: 5173,
  },
});
