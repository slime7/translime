import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

// 获取当前模块所在目录
const filename = fileURLToPath(import.meta.url);
const currentDir = dirname(filename);

// ----------------------------------------------------------------------
// 常量
// ----------------------------------------------------------------------

const VIRTUAL_PREVIEW_ENTRY = 'virtual:translime-preview-entry';
const RESOLVED_VIRTUAL_PREVIEW_ENTRY = `\0${VIRTUAL_PREVIEW_ENTRY}`;
const HOST_ROOT_SELECTOR_RE = /^(?:\s)*(?::root|html|body)(?=[\s.#:[>+~]|$)/;
const LEADING_COMBINATOR_RE = /^(?:\s)*(?:[>+~])(?:\s)*/;
const AT_RULE_WITH_NESTED_RULES = new Set(['media', 'supports', 'layer', 'container', 'scope']);
const AT_RULE_WITH_RAW_BLOCK = new Set(['font-face', 'keyframes', '-webkit-keyframes', '-moz-keyframes']);

function cssInjectedByJsPlugin(options = {}) {
  const styleId = options.styleId || 'vite-plugin-css-injected-by-js';
  const injectCodeFunction = options.injectCodeFunction
    || ((cssCode, injectedOptions) => {
      if (typeof document === 'undefined') {
        return;
      }

      const styleElement = document.createElement('style');
      styleElement.id = injectedOptions.styleId;
      styleElement.appendChild(document.createTextNode(cssCode));
      document.head.appendChild(styleElement);
    });

  return {
    name: 'translime-css-injected-by-js',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const cssChunks = [];

      Object.entries(bundle).forEach(([fileName, chunk]) => {
        if (chunk.type !== 'asset' || typeof chunk.source !== 'string' || !fileName.endsWith('.css')) {
          return;
        }

        cssChunks.push(chunk.source);
        delete bundle[fileName];
      });

      if (cssChunks.length === 0) {
        return;
      }

      const cssCode = JSON.stringify(cssChunks.join('\n'));
      const injectedOptions = JSON.stringify({ styleId });
      const runtimeCode = `;(function(){const inject=${injectCodeFunction.toString()};inject(${cssCode}, ${injectedOptions});})();\n`;

      Object.values(bundle).forEach((chunk) => {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          chunk.code = `${runtimeCode}${chunk.code}`;
        }
      });
    },
  };
}

// ----------------------------------------------------------------------
// 辅助函数
// ----------------------------------------------------------------------

/**
 * 获取 Preview 模式的 Vuetify 样式配置文件路径
 * @description 用于 vite-plugin-vuetify 的 styles.configFile 配置
 * @returns {string} 绝对路径
 */
export function getPreviewSettingsPath() {
  return resolve(currentDir, 'preview/settings.scss');
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

const escapeAttributeValue = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const getPluginScopeSelector = (styleId) => `.plugin-ui-loader[data-plugin-id="${escapeAttributeValue(styleId)}"]`;

const stripHostRootSelector = (selector) => {
  let nextSelector = selector.trim();

  while (HOST_ROOT_SELECTOR_RE.test(nextSelector)) {
    nextSelector = nextSelector.replace(HOST_ROOT_SELECTOR_RE, '').trimStart();
    nextSelector = nextSelector.replace(LEADING_COMBINATOR_RE, '').trimStart();
  }

  return nextSelector;
};

const scopeSelector = (selector, scopeSelectorText) => {
  const trimmedSelector = selector.trim();
  if (!trimmedSelector) {
    return scopeSelectorText;
  }

  if (trimmedSelector.startsWith(scopeSelectorText)) {
    return trimmedSelector;
  }

  const withoutHostRoot = stripHostRootSelector(trimmedSelector);
  if (!withoutHostRoot) {
    return scopeSelectorText;
  }

  if (withoutHostRoot.startsWith('@')) {
    return withoutHostRoot;
  }

  if (withoutHostRoot.startsWith('::backdrop')) {
    return withoutHostRoot;
  }

  return `${scopeSelectorText} ${withoutHostRoot}`;
};

const scopePluginCss = (cssCode, styleId) => {
  const scopeSelectorText = getPluginScopeSelector(styleId);

  const splitTopLevelSelectors = (selectorText) => {
    const selectors = [];
    let current = '';
    let parenthesesDepth = 0;
    let bracketsDepth = 0;
    let quote = '';

    for (let index = 0; index < selectorText.length; index += 1) {
      const char = selectorText[index];
      const prevChar = selectorText[index - 1];
      current += char;

      if (quote) {
        if (char === quote && prevChar !== '\\') {
          quote = '';
        }
        continue;
      }

      if (char === '"' || char === '\'') {
        quote = char;
        continue;
      }

      if (char === '(') {
        parenthesesDepth += 1;
        continue;
      }
      if (char === ')') {
        parenthesesDepth -= 1;
        continue;
      }
      if (char === '[') {
        bracketsDepth += 1;
        continue;
      }
      if (char === ']') {
        bracketsDepth -= 1;
        continue;
      }

      if (char === ',' && parenthesesDepth === 0 && bracketsDepth === 0) {
        selectors.push(current.slice(0, -1));
        current = '';
      }
    }

    if (current.trim()) {
      selectors.push(current);
    }

    return selectors;
  };

  const scopeSelectorList = (selectorText) => splitTopLevelSelectors(selectorText)
    .map((selector) => scopeSelector(selector, scopeSelectorText))
    .join(', ');

  const findMatchingBrace = (source, openIndex) => {
    let depth = 0;
    let quote = '';
    let inComment = false;

    for (let index = openIndex; index < source.length; index += 1) {
      const char = source[index];
      const nextChar = source[index + 1];
      const prevChar = source[index - 1];

      if (inComment) {
        if (char === '*' && nextChar === '/') {
          inComment = false;
          index += 1;
        }
        continue;
      }

      if (quote) {
        if (char === quote && prevChar !== '\\') {
          quote = '';
        }
        continue;
      }

      if (char === '/' && nextChar === '*') {
        inComment = true;
        index += 1;
        continue;
      }

      if (char === '"' || char === '\'') {
        quote = char;
        continue;
      }

      if (char === '{') {
        depth += 1;
        continue;
      }

      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  };

  const processCssBlock = (source) => {
    let output = '';
    let cursor = 0;
    let quote = '';
    let inComment = false;
    let parenthesesDepth = 0;
    let bracketsDepth = 0;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      const nextChar = source[index + 1];
      const prevChar = source[index - 1];

      if (inComment) {
        if (char === '*' && nextChar === '/') {
          inComment = false;
          index += 1;
        }
        continue;
      }

      if (quote) {
        if (char === quote && prevChar !== '\\') {
          quote = '';
        }
        continue;
      }

      if (char === '/' && nextChar === '*') {
        inComment = true;
        index += 1;
        continue;
      }

      if (char === '"' || char === '\'') {
        quote = char;
        continue;
      }

      if (char === '(') {
        parenthesesDepth += 1;
        continue;
      }
      if (char === ')') {
        parenthesesDepth -= 1;
        continue;
      }
      if (char === '[') {
        bracketsDepth += 1;
        continue;
      }
      if (char === ']') {
        bracketsDepth -= 1;
        continue;
      }

      if (parenthesesDepth > 0 || bracketsDepth > 0) {
        continue;
      }

      if (char !== '{') {
        continue;
      }

      const prelude = source.slice(cursor, index);
      const trimmedPrelude = prelude.trim();
      const closeIndex = findMatchingBrace(source, index);
      if (closeIndex === -1) {
        return output + source.slice(cursor);
      }

      const blockContent = source.slice(index + 1, closeIndex);
      if (!trimmedPrelude) {
        output += source.slice(cursor, closeIndex + 1);
        cursor = closeIndex + 1;
        index = closeIndex;
        continue;
      }

      if (trimmedPrelude.startsWith('@')) {
        const atRuleName = trimmedPrelude.slice(1).split(/\s|\(/, 1)[0].toLowerCase();
        if (AT_RULE_WITH_NESTED_RULES.has(atRuleName)) {
          output += `${prelude}{${processCssBlock(blockContent)}}`;
        } else if (AT_RULE_WITH_RAW_BLOCK.has(atRuleName) || atRuleName.endsWith('keyframes')) {
          output += `${prelude}{${blockContent}}`;
        } else {
          output += `${prelude}{${blockContent}}`;
        }
      } else {
        output += `${scopeSelectorList(prelude)}{${blockContent}}`;
      }

      cursor = closeIndex + 1;
      index = closeIndex;
    }

    return output + source.slice(cursor);
  };

  return processCssBlock(cssCode);
};

export function createPluginCssScopePlugin(styleId) {
  return {
    name: 'translime-plugin-css-scope',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      Object.values(bundle).forEach((chunk) => {
        if (chunk.type !== 'asset' || typeof chunk.fileName !== 'string' || !chunk.fileName.endsWith('.css')) {
          return;
        }

        if (typeof chunk.source !== 'string') {
          return;
        }

        chunk.source = scopePluginCss(chunk.source, styleId);
      });
    },
  };
}

export function createPluginCssInjectionOptions(styleId) {
  return {
    styleId,
    injectCodeFunction: function injectCodeCustomRunTimeFunction(cssCode, options) {
      try {
        if (typeof document !== 'undefined') {
          const elementStyle = document.createElement('style');
          elementStyle.id = options.styleId;
          elementStyle.dataset.pluginStyleId = options.styleId;

          const existingElement = document.getElementById(options.styleId);
          if (existingElement) {
            existingElement.remove();
          }
          elementStyle.appendChild(document.createTextNode(`@layer ${options.styleId} {\n${cssCode}\n}`));
          document.head.appendChild(elementStyle);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('vite-plugin-css-injected-by-js', e);
      }
    },
  };
}

export function createPluginCssIsolationPlugins(styleId) {
  return [
    createPluginCssScopePlugin(styleId),
    cssInjectedByJsPlugin(createPluginCssInjectionOptions(styleId)),
  ];
}

// ----------------------------------------------------------------------
// 主插件
// ----------------------------------------------------------------------

/**
 * Translime SDK 的 Vite 插件
 *
 * 功能：
 * 1. **自动组件导入**: 扫描 Vue/JS 文件，自动从 `window.vuetify$.components` 注入使用到的 Vuetify 组件，
 *    避免在插件源码中手动 import Vuetify 组件（减小插件体积）。
 * 2. **Preview 模式支持**: 提供完整的本地预览环境，包含 HMR、Mock API 和样式注入。
 *
 * @param {Object} options - 插件选项
 * @param {string} [options.previewComponent] - Preview 模式下的入口组件路径（默认为 build.lib.entry）
 * @returns {import('vite').Plugin}
 */
export function translimeSdk(options = {}) {
  let isPreviewMode = false;
  let resolvedPreviewComponent = '';

  return {
    name: 'translime-sdk-plugin',
    enforce: 'pre', // 确保在核心插件之前执行

    // ----------------------------------------------------------------------
    // 配置阶段
    // ----------------------------------------------------------------------
    config(config, { mode, command }) {
      isPreviewMode = mode === 'preview';

      // 确定 Preview 模式的入口组件路径
      if (options.previewComponent) {
        resolvedPreviewComponent = options.previewComponent;
      } else if (config.build?.lib?.entry) {
        // 尝试从 lib entry 推断
        resolvedPreviewComponent = config.build.lib.entry;
      }

      // 规范化路径（Vite 需要 ./ 或 / 开头）
      if (resolvedPreviewComponent && !resolvedPreviewComponent.startsWith('./') && !resolvedPreviewComponent.startsWith('/')) {
        resolvedPreviewComponent = `./${resolvedPreviewComponent}`;
      }

      // 基础配置（通用）
      const baseConfig = {
        define: {
          __TRANSLIME_PREVIEW__: isPreviewMode, // 注入全局变量供代码判断环境
        },
        build: {
          rolldownOptions: {
            external: ['electron'], // 永远排除 electron
            output: {
              globals: {
                electron: 'window.electron',
              },
            },
          },
        },
      };

      // Preview 模式特殊配置（仅在 serve 阶段生效）
      if (isPreviewMode && command === 'serve') {
        const settingsPath = resolve(__dirname, 'preview/settings.scss');

        return {
          ...baseConfig,
          // 切换为 SPA 模式（非库模式）
          build: {
            lib: undefined,
            rolldownOptions: {
              external: [], // Preview 模式下需要打包所有依赖
            },
          },
          // 启用现代 Sass 编译器（消除废弃提示）
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
          // 向下游插件传递配置（如 vite-plugin-vuetify）
          __translimeSdkPreview: {
            settingsPath,
          },
        };
      }

      return baseConfig;
    },

    // ----------------------------------------------------------------------
    // 配置开发服务器
    // ----------------------------------------------------------------------
    configureServer(server) {
      if (!isPreviewMode) {
        return;
      }

      // 拦截 index.html 请求并返回 Preview 模板
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url === '/index.html') {
          const templatePath = resolve(currentDir, '../preview-template.html');
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
    // 解析虚拟入口 ID
    // ----------------------------------------------------------------------
    resolveId(id) {
      if (id === VIRTUAL_PREVIEW_ENTRY) {
        return RESOLVED_VIRTUAL_PREVIEW_ENTRY;
      }
      return null;
    },

    // ----------------------------------------------------------------------
    // 加载虚拟入口内容
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
    // 转换源码并自动注入组件
    // ----------------------------------------------------------------------
    transform(code, id) {
      // 忽略不需要处理的文件
      if (id.includes('node_modules') || id.startsWith('\0')) {
        return null;
      }
      if (!/\.(js|ts|vue)$/.test(id)) {
        return null;
      }

      const matches = new Set();

      // 扫描 JS/TS 中的组件名（例如 VBtn、VCard）
      const componentRegex = /\b(V[A-Z][\w$]+)\b/g;
      let match;
      match = componentRegex.exec(code);
      while (match !== null) {
        matches.add(match[1]);
        match = componentRegex.exec(code);
      }

      // 扫描 Vue 模板中的 kebab-case 标签（例如 <v-btn>）
      if (id.endsWith('.vue')) {
        const templateTagRegex = /<v-([a-z0-9-]+)\b/g;
        match = templateTagRegex.exec(code);
        while (match !== null) {
          // 转成 camelCase：v-btn -> VBtn
          const name = `V${match[1].split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('')}`;
          matches.add(name);
          match = templateTagRegex.exec(code);
        }
      }

      if (matches.size === 0) {
        return null;
      }

      // 过滤掉已从其他地方导入或定义的变量
      const used = Array.from(matches).filter((name) => {
        // 检查 import 语句
        if (new RegExp(`import\\s+{[^}]*\\b${name}\\b[^}]*}\\s+from`, 'm').test(code)) {
          return false;
        }
        // 检查局部变量定义（const、let、function、class）
        if (new RegExp(`(const|let|var|function|class|import)\\s+\\b${name}\\b`, 'm').test(code)) {
          return false;
        }
        // 检查属性访问（例如 something.VBtn）
        if (new RegExp(`\\.\\b${name}\\b`).test(code)) {
          return false;
        }
        return true;
      });

      if (used.length === 0) {
        return null;
      }

      // 注入代码
      // 如果运行在渲染进程（有 window.vuetify$），则从中解构；否则为空对象
      const injection = `\n/* 由 translime-sdk 自动注入 */\nconst { ${used.join(', ')} } = (typeof window !== 'undefined' && window.vuetify$?.components || {});\n`;

      let newCode = code;
      if (id.endsWith('.vue')) {
        if (code.includes('<script setup')) {
          newCode = code.replace(/<script\s+setup[^>]*>/, `$&${injection}`);
        } else if (code.includes('<script')) {
          newCode = code.replace(/<script[^>]*>/, `$&${injection}`);
        } else {
          // 没有 script 标签时，补一个 <script setup>（常见于纯模板 Vue 文件）
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
