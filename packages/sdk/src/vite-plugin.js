import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

// 获取当前模块所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 虚拟模块 ID
const VIRTUAL_PREVIEW_ENTRY = 'virtual:translime-preview-entry';
const RESOLVED_VIRTUAL_PREVIEW_ENTRY = `\0${VIRTUAL_PREVIEW_ENTRY}`;

/**
 * 获取 Preview 模式的 Vuetify 样式配置文件路径
 * 用于 vite-plugin-vuetify 的 styles.configFile 配置
 * @returns {string}
 */
export function getPreviewSettingsPath() {
  return resolve(__dirname, 'preview/settings.scss');
}

/**
 * Translime SDK Vite Plugin
 * 提供了对 Vuetify 组件的自动映射支持和 Preview 模式
 * @param {Object} options - 插件选项
 * @param {string} options.previewComponent - preview 模式下要渲染的组件路径
 */
export function translimeSdk(options = {}) {
  let isPreviewMode = false;
  let resolvedPreviewComponent = '';

  return {
    name: 'translime-sdk-plugin',
    enforce: 'pre',

    config(config, { mode, command }) {
      isPreviewMode = mode === 'preview';

      // 解析 previewComponent 路径
      if (options.previewComponent) {
        resolvedPreviewComponent = options.previewComponent;
      } else if (config.build?.lib?.entry) {
        // 如果没有指定，尝试使用 lib.entry 作为默认值
        resolvedPreviewComponent = config.build.lib.entry;
      }

      // 确保路径以 ./ 开头，否则 Vite 无法正确解析
      if (resolvedPreviewComponent && !resolvedPreviewComponent.startsWith('./') && !resolvedPreviewComponent.startsWith('/')) {
        resolvedPreviewComponent = `./${resolvedPreviewComponent}`;
      }

      const baseConfig = {
        define: {
          // 注入 preview 模式标识
          __TRANSLIME_PREVIEW__: isPreviewMode,
        },
        build: {
          rollupOptions: {
            external: ['electron'],
            output: {
              globals: {
                electron: 'window.electron',
              },
            },
          },
        },
      };

      // preview 模式下的特殊配置
      if (isPreviewMode && command === 'serve') {
        // 获取 settings.scss 的路径
        const settingsPath = resolve(__dirname, 'preview/settings.scss');

        return {
          ...baseConfig,
          // 禁用库模式，使用普通 SPA 模式
          build: {
            lib: undefined,
            rollupOptions: {
              external: [], // preview 模式下不需要 external
            },
          },
          // 配置 CSS 预处理器
          css: {
            preprocessorOptions: {
              sass: {
                api: 'modern-compiler',
              },
              scss: {
                api: 'modern-compiler',
              },
            },
          },
          // 配置优化依赖
          optimizeDeps: {
            exclude: ['vuetify'],
          },
          // 注入 vite-plugin-vuetify 配置
          __translimeSdkPreview: {
            settingsPath,
          },
        };
      }

      return baseConfig;
    },

    configureServer(server) {
      if (!isPreviewMode) {
        return;
      }

      // 为 dev server 提供自定义的 index.html
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url === '/index.html') {
          // 读取模板文件
          const templatePath = resolve(__dirname, '../preview-template.html');
          let html;
          try {
            html = readFileSync(templatePath, 'utf-8');
          } catch (e) {
            // 如果模板文件不存在，使用内联模板
            html = getInlineTemplate();
          }

          // 替换入口脚本路径
          html = html.replace('/__PREVIEW_ENTRY__', `/@id/${VIRTUAL_PREVIEW_ENTRY}`);

          res.setHeader('Content-Type', 'text/html');
          res.end(html);
          return;
        }
        next();
      });
    },

    resolveId(id) {
      if (id === VIRTUAL_PREVIEW_ENTRY) {
        return RESOLVED_VIRTUAL_PREVIEW_ENTRY;
      }
      return null;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_PREVIEW_ENTRY) {
        // 动态生成 preview 入口代码
        const componentPath = resolvedPreviewComponent || './src/ui/ui.vue';
        return `import { startPreview } from 'translime-sdk/preview';
import PluginComponent from '${componentPath}';
startPreview(PluginComponent);
`;
      }
      return null;
    },

    // 使用 transform 钩子实现更灵活的组件映射
    transform(code, id) {
      // 排除 node_modules 和虚拟模块
      if (id.includes('node_modules') || id.startsWith('\0')) {
        return null;
      }
      // 仅处理 .js, .ts, .vue 文件
      if (!/\.(js|ts|vue)$/.test(id)) {
        return null;
      }

      const matches = new Set();

      // 1. 匹配 JS 中的 PascalCase 标识符 (VBtn, VCard)
      const componentRegex = /\b(V[A-Z][\w$]+)\b/g;
      let match;
      while ((match = componentRegex.exec(code)) !== null) {
        matches.add(match[1]);
      }

      // 2. 如果是 .vue 文件，额外匹配模板中的 kebab-case 标签 (<v-btn, <v-text-field)
      if (id.endsWith('.vue')) {
        const templateTagRegex = /<v-([a-z0-9-]+)\b/g;
        while ((match = templateTagRegex.exec(code)) !== null) {
          // 将 v-xxx 转换为 VXxx
          const name = `V${match[1].split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('')}`;
          matches.add(name);
        }
      }

      if (matches.size === 0) {
        return null;
      }

      // 过滤出真正需要自动导入的组件
      const used = Array.from(matches).filter((name) => {
        // 排除已有的显式定义或导入
        if (new RegExp(`import\\s+{[^}]*\\b${name}\\b[^}]*}\\s+from`, 'm').test(code)) {
          return false;
        }
        if (new RegExp(`(const|let|var|function|class|import)\\s+\\b${name}\\b`, 'm').test(code)) {
          return false;
        }
        if (new RegExp(`\\.\\b${name}\\b`).test(code)) {
          return false;
        }
        // 注意：这里移除了之前排除模板标签的限制，因为我们需要在 setup 中定义它来给模板使用
        return true;
      });

      if (used.length === 0) {
        return null;
      }

      // 准备注入的语句
      const injection = `\n/* auto-injected by translime-sdk */\nconst { ${used.join(', ')} } = (typeof window !== 'undefined' && window.vuetify$?.components || {});\n`;

      let newCode = code;
      if (id.endsWith('.vue')) {
        if (code.includes('<script setup')) {
          newCode = code.replace(/<script\s+setup[^>]*>/, `$&${injection}`);
        } else if (code.includes('<script')) {
          newCode = code.replace(/<script[^>]*>/, `$&${injection}`);
        } else {
          // 如果没有 script 块，手动创建一个以支持模板
          newCode = `<script setup>${injection}</script>\n${code}`;
        }
      } else {
        newCode = injection + code;
      }

      return {
        code: newCode,
        map: null,
      };
    },
  };
}

/**
 * 内联的 HTML 模板，用于模板文件不可用时的备用
 * @returns {string}
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

export default translimeSdk;

