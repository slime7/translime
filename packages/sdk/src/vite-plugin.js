/**
 * Translime SDK Vite Plugin
 * 提供了对 Vuetify 组件的自动映射支持
 */
export function translimeSdk() {
  return {
    name: 'translime-sdk-plugin',
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
      // 仅处理插件源码目录下的 .js 和 .vue 文件
      if (!/src\/.*\.(js|vue)/.test(id)) return null;

      // 匹配以 V 开头紧跟大写字母的标识符，例如 VBtn, VCard
      // 排除掉已经定义的变量和 import 语句中的标识符（简单处理）
      // 这里的逻辑是将 V... 替换为 window.vuetify$?.components?.V...
      // 为了防止破坏局部变量，我们只替换那些看起来像全局访问的 VXXX
      const newCode = code.replace(/(?<![\w.'"\/])(V[A-Z][\w$]+)(?![\w$])/g, (match) => {
        // 如果是在 import 语句或者属性访问中，不替换
        // 这个正则非常简单，但在大多数 Vue setup 环境下够用
        return `(window.vuetify$?.components?.${match} || ${match})`;
      });

      return {
        code: newCode,
        map: null, // 如果需要 sourcemap，这里可以生成
      };
    },
  };
}

export default translimeSdk;
