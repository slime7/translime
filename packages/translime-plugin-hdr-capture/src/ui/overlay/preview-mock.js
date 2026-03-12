/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */

/**
 * Overlay Preload Mock
 * 在浏览器 preview 模式下模拟 Electron preload 脚本的功能
 */

/**
 * 创建 mock 日志记录器
 */
function createMockLogger(defaultMeta = {}) {
  const prefix = '[Overlay]';
  return {
    log: (...args) => console.log(prefix, ...args, defaultMeta),
    error: (...args) => console.error(prefix, ...args, defaultMeta),
    warn: (...args) => console.warn(prefix, ...args, defaultMeta),
    info: (...args) => console.info(prefix, ...args, defaultMeta),
    debug: (...args) => console.debug(prefix, ...args, defaultMeta),
    child: (childMeta) => createMockLogger({ ...defaultMeta, ...childMeta }),
  };
}

/**
 * 生成 mock 窗口数据 - 将整个浏览器页面作为单个屏幕
 */
function generateMockWindows() {
  return [
    {
      handle: 1,
      title: 'Desktop',
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight,
    },
  ];
}

/**
 * 生成 mock 屏幕截图数据
 */
async function generateMockScreenCapture() {
  // 创建一个渐变背景作为 mock 截图
  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  // 绘制渐变背景
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(0.5, '#16213e');
  gradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 添加一些装饰元素
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  for (let i = 0; i < 20; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = Math.random() * 100 + 20;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 添加文字提示
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Overlay Preview Mode - Mock Screen Capture', canvas.width / 2, canvas.height / 2);

  // 转换为 blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      blob.arrayBuffer().then((buffer) => {
        resolve({
          displayId: 'mock-display-0',
          bounds: {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
          },
          data: new Uint8Array(buffer),
        });
      });
    }, 'image/webp', 0.9);
  });
}

/**
 * 初始化 mock API
 */
export async function initOverlayPreviewMock() {
  console.log('[Overlay Preview] 初始化 mock 环境...');

  // Mock ts (translime) 对象
  window.ts = {
    logger: createMockLogger(),
  };

  // 生成 mock 数据
  const displays = [{
    id: 'mock-display-0',
    bounds: {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scaleFactor: 1,
  }];

  const capturedScreen = await generateMockScreenCapture();

  // Mock hdrCapture 对象
  const initCallbacks = [];
  window.hdrCapture = {
    getWindowAtPoint: async (x, y) => {
      console.log(`[Mock] getWindowAtPoint(${x}, ${y})`);
      const windows = generateMockWindows();
      return windows.find((w) => x >= w.left && x < w.right && y >= w.top && y < w.bottom) || null;
    },

    getTopLevelWindows: async () => {
      console.log('[Mock] getTopLevelWindows()');
      return generateMockWindows();
    },

    saveCapture: async (rect) => {
      console.log('[Mock] saveCapture:', rect);
      // eslint-disable-next-line no-alert
      alert(`[Preview Mock] 保存截图\n区域: ${rect.x}, ${rect.y}, ${rect.width}x${rect.height}`);
      return { success: true };
    },

    copyCapture: async (rect) => {
      console.log('[Mock] copyCapture:', rect);
      // eslint-disable-next-line no-alert
      alert(`[Preview Mock] 复制截图到剪贴板\n区域: ${rect.x}, ${rect.y}, ${rect.width}x${rect.height}`);
      return { success: true };
    },

    close: () => {
      console.log('[Mock] close()');
      // eslint-disable-next-line no-alert
      if (window.confirm('[Preview Mock] 关闭 Overlay？\n（在实际环境中会关闭窗口）')) {
        window.location.reload();
      }
    },

    onInit: (callback) => {
      initCallbacks.push(callback);
    },
  };

  // 延迟触发 init 回调，模拟 Electron IPC
  setTimeout(() => {
    const initData = {
      isDebug: true, // Preview 模式下启用 debug
      minX: 0,
      minY: 0,
      displays,
      capturedScreens: [capturedScreen],
      cursorPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      windows: generateMockWindows(),
    };

    initCallbacks.forEach((cb) => cb(initData));
    console.log('[Overlay Preview] init 回调已触发');
  }, 100);

  console.log('[Overlay Preview] mock 环境初始化完成');
}
