import { builtinModules } from 'node:module';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = ({ mode }) => ({
  envDir: process.cwd(),
  build: {
    minify: false,
    sourcemap: mode === 'development' ? 'inline' : false,
    target: 'node16',
    outDir: './dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.js',
      name: 'plugin',
      formats: ['es', 'umd'],
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      plugins: [
        resolve(),
        commonjs(),
      ],
      external: [
        ...builtinModules,
        'axios',
        'semver-compare',
        'tunnel',
      ],
    },
  },
});

export default config;
