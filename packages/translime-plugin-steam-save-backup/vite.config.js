import { builtinModules } from 'node:module';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
  envDir: process.cwd(),
  build: {
    minify: false,
    sourcemap: 'inline',
    target: 'node18',
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
        'electron',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
      output: {
        exports: 'named',
        globals: builtinModules.reduce((acc, m) => {
          acc[m] = m;
          acc[`node:${m}`] = m;
          return acc;
        }, {}),
      },
    },
  },
};

export default config;
