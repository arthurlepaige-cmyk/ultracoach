import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// sql.js est un module UMD : on le laisse être pré-bundlé par esbuild (sinon le
// dev server sert l'UMD brut, non-ESM, et l'app reste blanche). Le .wasm est
// chargé séparément via `?url`, ce qui reste valable dans les deux cas.
export default defineConfig({
  plugins: [react()],
  server: { port: 5250, open: true },
  optimizeDeps: { include: ['sql.js'] },
  assetsInclude: ['**/*.sqlite'],
});
