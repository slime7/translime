import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
export default defineConfig(({ mode }) => ({
  envDir: process.cwd(),
  define: {
    'process.env.FLUENTFFMPEG_COV': false,
  },
  build: {
    minify: false,
    sourcemap: mode === 'preview' ? 'inline' : false,
    target: 'node20',
    outDir: './dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.js',
      name: 'plugin',
      formats: ['cjs'],
      fileName: (format) => `index.${format}.js`,
    },
    commonjsOptions: {
      include: [],
    },
    rollupOptions: {
      plugins: [
        resolve(),
        commonjs(),
      ],
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        'fluent-ffmpeg',
      ],
    },
  },
}));
