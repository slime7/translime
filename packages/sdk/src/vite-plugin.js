import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

// 获取当前模块所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ----------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------

const VIRTUAL_PREVIEW_ENTRY = 'virtual:translime-preview-entry';
const RESOLVED_VIRTUAL_PREVIEW_ENTRY = `\0${VIRTUAL_PREVIEW_ENTRY}`;

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * 获取 Preview 模式的 Vuetify 样式配置文件路径
 * @description 用于 vite-plugin-vuetify 的 styles.configFile 配置
 * @returns {string} 绝对路径
 */
export function getPreviewSettingsPath() {
  return resolve(__dirname, 'preview/settings.scss');
}

/**
 * 内联的 HTML 模板
 * @description 当项目目录下找不到 preview-template.html 时使用的默认模板
 */
function getInlineTemplate() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plugin Preview</title>
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/__PREVIEW_ENTRY__"></script>
</body>
</html>`;
}

// ----------------------------------------------------------------------
// Main Plugin
// ----------------------------------------------------------------------

/**
 * Translime SDK Vite Plugin
 *
 * 功能：
 * 1. **自动组件导入**: 扫描 Vue/JS 文件，自动从 `window.vuetify$.components` 注入使用到的 Vuetify 组件，
 *    避免在插件源码中手动 import Vuetify 组件 (减小插件体积).
 * 2. **Preview 模式支持**: 提供完整的本地预览环境，包含 HMR、Mock API 和样式注入.
 *
 * @param {Object} options - 插件选项
 * @param {string} [options.previewComponent] - Preview 模式下的入口组件路径 (默认为 build.lib.entry)
 * @returns {import('vite').Plugin}
 */
export function translimeSdk(options = {}) {
  let isPreviewMode = false;
  let resolvedPreviewComponent = '';

  return {
    name: 'translime-sdk-plugin',
    enforce: 'pre', // 确保在核心插件之前执行

    // ----------------------------------------------------------------------
    // Config Hook
    // ----------------------------------------------------------------------
    config(config, { mode, command }) {
      isPreviewMode = mode === 'preview';

      // 确定 Preview 入口组件路径
      if (options.previewComponent) {
        resolvedPreviewComponent = options.previewComponent;
      } else if (config.build?.lib?.entry) {
        // 尝试从 lib entry 推断
        resolvedPreviewComponent = config.build.lib.entry;
      }

      // 规范化路径 (Vite 需要 ./ 或 / 开头)
      if (resolvedPreviewComponent && !resolvedPreviewComponent.startsWith('./') && !resolvedPreviewComponent.startsWith('/')) {
        resolvedPreviewComponent = `./${resolvedPreviewComponent}`;
      }

      // 基础配置 (通用)
      const baseConfig = {
        define: {
          __TRANSLIME_PREVIEW__: isPreviewMode, // 注入全局变量供代码判断环境
        },
        build: {
          rollupOptions: {
            external: ['electron'], // 永远排除 electron
            output: {
              globals: {
                electron: 'window.electron',
              },
            },
          },
        },
      };

      // Preview 模式特殊配置 (仅在 serve 阶段生效)
      if (isPreviewMode && command === 'serve') {
        const settingsPath = resolve(__dirname, 'preview/settings.scss');

        return {
          ...baseConfig,
          // 切换为 SPA 模式 (非库模式)
          build: {
            lib: undefined,
            rollupOptions: {
              external: [], // Preview 模式下需要打包所有依赖
            },
          },
          // 启用现代 Sass 编译器 (消除 Deprecation Warning)
          css: {
            preprocessorOptions: {
              sass: { api: 'modern-compiler' },
              scss: { api: 'modern-compiler' },
            },
          },
          // 优化依赖: 排除 vuetify (使用我们注入的 mock/core)
          optimizeDeps: {
            exclude: ['vuetify'],
          },
          // 向下游插件传递配置 (如 vite-plugin-vuetify)
          __translimeSdkPreview: {
            settingsPath,
          },
        };
      }

      return baseConfig;
    },

    // ----------------------------------------------------------------------
    // Configure Server (Preview Middleware)
    // ----------------------------------------------------------------------
    configureServer(server) {
      if (!isPreviewMode) return;

      // 拦截 index.html 请求，提供 Preview 模板
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url === '/index.html') {
          const templatePath = resolve(__dirname, '../preview-template.html');
          let html;
          try {
            html = readFileSync(templatePath, 'utf-8');
          } catch (e) {
            html = getInlineTemplate();
          }

          // 注入虚拟入口
          html = html.replace('/__PREVIEW_ENTRY__', `/@id/${VIRTUAL_PREVIEW_ENTRY}`);

          res.setHeader('Content-Type', 'text/html');
          res.end(html);
          return;
        }
        next();
      });
    },

    // ----------------------------------------------------------------------
    // Resolve Id (Virtual Entry)
    // ----------------------------------------------------------------------
    resolveId(id) {
      if (id === VIRTUAL_PREVIEW_ENTRY) {
        return RESOLVED_VIRTUAL_PREVIEW_ENTRY;
      }
      return null;
    },

    // ----------------------------------------------------------------------
    // Load (Virtual Entry Content)
    // ----------------------------------------------------------------------
    load(id) {
      if (id === RESOLVED_VIRTUAL_PREVIEW_ENTRY) {
        // 生成引导代码：导入 Preview 框架 + 用户插件组件
        const componentPath = resolvedPreviewComponent || './src/ui/ui.vue';
        return `import { startPreview } from 'translime-sdk/preview';
import PluginComponent from '${componentPath}';
startPreview(PluginComponent);
`;
      }
      return null;
    },

    // ----------------------------------------------------------------------
    // Transform (Auto-Import Components)
    // ----------------------------------------------------------------------
    transform(code, id) {
      // 忽略不需要处理的文件
      if (id.includes('node_modules') || id.startsWith('\0')) return null;
      if (!/\.(js|ts|vue)$/.test(id)) return null;

      const matches = new Set();

      // 扫描 JS/TS 中的组件名 (e.g. VBtn, VCard)
      const componentRegex = /\b(V[A-Z][\w$]+)\b/g;
      let match;
      while ((match = componentRegex.exec(code)) !== null) {
        matches.add(match[1]);
      }

      // 扫描 Vue 模板中的 kebab-case 标签 (e.g. <v-btn>)
      if (id.endsWith('.vue')) {
        const templateTagRegex = /<v-([a-z0-9-]+)\b/g;
        while ((match = templateTagRegex.exec(code)) !== null) {
          // camelCase 转换: v-btn -> VBtn
          const name = `V${match[1].split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('')}`;
          matches.add(name);
        }
      }

      if (matches.size === 0) return null;

      // 过滤掉已从其他地方导入或定义的变量
      const used = Array.from(matches).filter((name) => {
        // 检查 import 语句
        if (new RegExp(`import\\s+{[^}]*\\b${name}\\b[^}]*}\\s+from`, 'm').test(code)) return false;
        // 检查局部变量定义 (const, let, function, class)
        if (new RegExp(`(const|let|var|function|class|import)\\s+\\b${name}\\b`, 'm').test(code)) return false;
        // 检查属性访问 (e.g. something.VBtn)
        if (new RegExp(`\\.\\b${name}\\b`).test(code)) return false;
        return true;
      });

      if (used.length === 0) return null;

      // 注入代码
      // 如果运行在 Render 进程 (有 window.vuetify$)，则从中解构；否则为空对象
      const injection = `\n/* auto-injected by translime-sdk */\nconst { ${used.join(', ')} } = (typeof window !== 'undefined' && window.vuetify$?.components || {});\n`;

      let newCode = code;
      if (id.endsWith('.vue')) {
        if (code.includes('<script setup')) {
          newCode = code.replace(/<script\s+setup[^>]*>/, `$&${injection}`);
        } else if (code.includes('<script')) {
          newCode = code.replace(/<script[^>]*>/, `$&${injection}`);
        } else {
          // 无 script 标签时，创建 <script setup> (常见于纯模板 Vue 文件)
          newCode = `<script setup>${injection}</script>\n${code}`;
        }
      } else {
        newCode = injection + code;
      }

      return {
        code: newCode,
        map: null, // 可选：生成 sourcemap
      };
    },
  };
}

export default translimeSdk;

