/**
 * Translime SDK Vite Plugin
 * 提供了对 Vuetify 组件的自动映射支持
 */
export function translimeSdk() {
  return {
    name: 'translime-sdk-plugin',
    enforce: 'pre',
    config() {
      return {
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
    },
    // 使用 transform 钩子实现更灵活的组件映射
    transform(code, id) {
      // 排除 node_modules 和虚拟模块
      if (id.includes('node_modules') || id.startsWith('\0')) return null;
      // 仅处理 .js, .ts, .vue 文件
      if (!/\.(js|ts|vue)$/.test(id)) return null;

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

      if (matches.size === 0) return null;

      // 过滤出真正需要自动导入的组件
      const used = Array.from(matches).filter((name) => {
        // 排除已有的显式定义或导入
        if (new RegExp(`import\\s+{[^}]*\\b${name}\\b[^}]*}\\s+from`, 'm').test(code)) return false;
        if (new RegExp(`(const|let|var|function|class|import)\\s+\\b${name}\\b`, 'm').test(code)) return false;
        if (new RegExp(`\\.\\b${name}\\b`).test(code)) return false;
        // 注意：这里移除了之前排除模板标签的限制，因为我们需要在 setup 中定义它来给模板使用
        return true;
      });

      if (used.length === 0) return null;

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

export default translimeSdk;
