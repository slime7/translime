/**
 * preview:ui 模式的声明式 IPC mock。
 * 由 ui.vite.config.mjs 中 `translimeSdk({ previewIpcMocks: './preview-mocks.mjs' })` 加载，
 * 键为事件名（可带或不带 `@插件ID` 后缀），值为 (...args) => result；
 * invoke 命中时返回其返回值，未命中返回 null 并打印调用日志。
 */
export default {
  'test-ipc': (arg1, arg2) => ({
    success: true,
    message: `mock reply from preview: ${arg1} ${arg2}`,
  }),
};
