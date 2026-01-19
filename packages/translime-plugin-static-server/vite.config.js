import { builtinModules } from 'node:module';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = ({ mode }) => ({
  envDir: process.cwd(),
  build: {
    minify: false,
    sourcemap: mode === 'development' ? 'inline' : false,
    target: 'node20',
    outDir: './dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.js',
      name: 'plugin',
      formats: ['cjs'],
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        'http',
        'serve-handler',
        'detect-port',
      ],
    },
  },
});

export default config;
