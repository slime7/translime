import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 画面窗口（wrapper）构建：
 * 默认模式产出 wrapper.html + wrapper.js（vue / mde-vue 经 importmap external），
 * preload 模式产出 wrapper-preload.cjs.js
 */
export default defineConfig(({ mode }) => {
  if (mode === 'preload') {
    return {
      build: {
        outDir: path.resolve(dirname, 'dist'),
        emptyOutDir: false,
        lib: {
          entry: path.resolve(dirname, 'src/ui/wrapper-preload.js'),
          formats: ['cjs'],
          fileName: () => 'wrapper-preload.cjs.js',
        },
        rolldownOptions: {
          external: ['electron'],
        },
        minify: false,
        target: 'node20',
      },
    };
  }

  return {
    root: path.resolve(dirname, 'src/ui/wrapper'),
    base: './',
    plugins: [vue()],
    build: {
      outDir: path.resolve(dirname, 'dist'),
      emptyOutDir: false,
      rolldownOptions: {
        input: {
          wrapper: path.resolve(dirname, 'src/ui/wrapper/wrapper.html'),
        },
        external: ['vue', 'mde-vue'],
        output: {
          format: 'esm',
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
      minify: false,
      target: 'esnext',
    },
  };
});
