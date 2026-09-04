import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';

/**
 * Build config for the single-file report template.
 *
 * Produces dist/report/report.html — one self-contained HTML file with all JS
 * and CSS inlined (via vite-plugin-singlefile). At runtime `ctxmap report`
 * injects a ReportEnvelope as window.__CTXMAP_DATA__ into this template and
 * writes the result out. No server, no bundler, no network at runtime.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  root: 'src/web',
  // No publicDir: the report must not depend on any sibling asset (e.g. data.json).
  publicDir: false,
  build: {
    outDir: '../../dist/report',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/web/report.html'),
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/web'),
    },
  },
});
