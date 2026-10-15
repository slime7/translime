import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite 默认给产物 HTML 的资源加 crossorigin；画面窗口经 file:// 加载，
// 带 crossorigin 的样式表会以匿名 CORS 请求拉取本地文件，偶发被拦截导致整页裸样式
const stripCrossoriginPlugin = () => ({
  name: 'strip-crossorigin',
  closeBundle() {
    ['mirror.html', 'virtual.html', 'wrapper.html'].forEach((file) => {
      const htmlPath = path.resolve(dirname, 'dist', file);
      if (existsSync(htmlPath)) {
        writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace(/ crossorigin(="")?/g, ''));
      }
    });
  },
});

/**
 * 画面窗口构建：
 * 默认模式产出 mirror.html + virtual.html 及对应 JS/CSS，
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
    root: path.resolve(dirname, 'src/ui'),
    base: './',
    plugins: [vue(), tailwindcss(), stripCrossoriginPlugin()],
    build: {
      outDir: path.resolve(dirname, 'dist'),
      emptyOutDir: false,
      rolldownOptions: {
        input: {
          mirror: path.resolve(dirname, 'src/ui/mirror.html'),
          virtual: path.resolve(dirname, 'src/ui/virtual.html'),
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
