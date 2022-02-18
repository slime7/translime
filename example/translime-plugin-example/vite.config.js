/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
  envDir: process.cwd(),
  build: {
    sourcemap: false,
    target: 'node14',
    outDir: './dist',
    assetsDir: '.',
    terserOptions: {
      ecma: 2021,
      compress: {
        passes: 2,
      },
      safari10: false,
    },
    lib: {
      entry: 'index.js',
      name: 'plugin',
      fileName: (format) => `index.${format}.js`,
    },
    emptyOutDir: true,
  },
};

export default config;
