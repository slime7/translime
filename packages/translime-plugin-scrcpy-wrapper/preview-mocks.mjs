/**
 * preview:ui 模式的声明式 IPC mock。
 * 由 ui.vite.config.mjs 中 `translimeSdk({ previewIpcMocks: './preview-mocks.mjs' })` 加载，
 * 键为事件名（可带或不带 `@插件ID` 后缀），值为 (...args) => result；
 * invoke 命中时返回其返回值，未命中返回 null 并打印调用日志。
 */
export default {
  'list-devices': () => ({
    success: true,
    devices: [
      { serial: 'MOCK123ABC', state: 'device', model: 'Pixel Mock' },
      { serial: 'emulator-5554', state: 'device', model: 'Emulator' },
      {
        serial: '192.168.1.8:37895',
        state: 'device',
        model: 'Xiaomi Mock',
        wireless: true,
        connected: true,
        stored: true,
      },
      {
        serial: '192.168.1.20:40117',
        state: 'offline',
        model: 'Tablet Mock',
        wireless: true,
        connected: false,
        stored: true,
      },
    ],
  }),
  'list-apps': () => ({
    success: true,
    packages: [
      'com.android.chrome',
      'com.tencent.weread',
      'org.videolan.vlc',
    ],
  }),
  launch: () => ({
    success: true,
    sessionId: 'session-mock-1',
    title: 'translime-scrcpy-1',
  }),
  'pair-wireless': () => ({
    success: true,
    serial: '192.168.1.20:40117',
  }),
  'connect-wireless': () => ({
    success: true,
    serial: '192.168.1.20:40117',
    devices: [
      { serial: 'MOCK123ABC', state: 'device', model: 'Pixel Mock' },
      { serial: 'emulator-5554', state: 'device', model: 'Emulator' },
      {
        serial: '192.168.1.8:37895',
        state: 'device',
        model: 'Xiaomi Mock',
        wireless: true,
        connected: true,
        stored: true,
      },
      {
        serial: '192.168.1.20:40117',
        state: 'device',
        model: 'Tablet Mock',
        wireless: true,
        connected: true,
        stored: true,
      },
    ],
  }),
  'remove-wireless': () => ({
    success: true,
  }),
};
