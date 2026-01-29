import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/**
 * Overlay 构建配置 - Vue 3 + Tailwind CSS 版本
 */
export default defineConfig(({ mode }) => {
  const isPreloadBuild = mode === 'preload';

  if (isPreloadBuild) {
    return {
      build: {
        outDir: path.resolve(dirname, 'dist'),
        emptyOutDir: false,
        lib: {
          entry: path.resolve(dirname, 'src/ui/overlay-preload.js'),
          formats: ['cjs'],
          fileName: () => 'overlay-preload.cjs.js',
        },
        rollupOptions: {
          external: ['electron'],
        },
        minify: false,
        target: 'node20',
      },
    };
  }

  return {
    root: path.resolve(dirname, 'src/ui/overlay'),
    base: './',
    plugins: [
      vue(),
      tailwindcss(),
    ],
    build: {
      outDir: path.resolve(dirname, 'dist'),
      emptyOutDir: false,
      rollupOptions: {
        input: {
          overlay: path.resolve(dirname, 'src/ui/overlay/overlay.html'),
        },
        output: {
          format: 'esm',
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
      minify: 'esbuild',
      target: 'esnext',
    },
    resolve: {
      alias: {
        '@': path.resolve(dirname, 'src'),
      },
    },
  };
});
