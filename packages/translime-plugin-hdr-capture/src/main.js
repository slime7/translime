import {
  BrowserWindow,
  globalShortcut,
  screen,
} from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useLogger, usePluginConfig } from 'translime-sdk';
// eslint-disable-next-line import/extensions
import * as capture from './capture/index.js';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const PLUGIN_ID = 'translime-plugin-hdr-capture';
const logger = useLogger();

/**
 * 这是一个本地实现的配置代理，不依赖外部模块，
 * 确保在 CJS 混合环境下能稳定运行。
 */
const pluginConfig = usePluginConfig(PLUGIN_ID);

// 叠加层窗口实例
let overlayWindow = null;

// 当前注册的快捷键
let registeredShortcut = null;

// 缓存当前截图会话的原始数据 (Raw Buffers + Metadata)
// 用于 save 和 copy 时直接裁剪，不需要重新捕获屏幕
let currentCaptureSession = null;

/**
 * 获取插件设置
 * 按照 SDK 规范，通过 config.get 获取单个配置项
 */
const getShortcut = () => pluginConfig.get('shortcut', '');
const getSavePath = () => pluginConfig.get('savePath', '');
const getSaveFormat = () => pluginConfig.get('saveFormat', 'png');
const getPreserveHdr = () => pluginConfig.get('preserveHdr', false);

/**
 * 注销全局快捷键
 */
const unregisterShortcut = () => {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    // 已注销快捷键
    registeredShortcut = null;
  }
};

/**
 * 创建透明叠加层窗口
 */
const createOverlayWindow = () => {
  // 获取所有显示器的总边界
  const displays = screen.getAllDisplays();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  displays.forEach((display) => {
    const {
      x,
      y,
      width,
      height,
    } = display.bounds;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  const totalWidth = maxX - minX;
  const totalHeight = maxY - minY;

  overlayWindow = new BrowserWindow({
    x: minX,
    y: minY,
    width: totalWidth,
    height: totalHeight,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    maximizable: true,
    fullscreen: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(dirname, '../dist/overlay-preload.cjs.js'),
    },
  });

  // 强制设置边界以防被系统截断
  overlayWindow.setBounds({
    x: minX,
    y: minY,
    width: totalWidth,
    height: totalHeight,
  });

  // 加载叠加层 HTML
  const overlayPath = path.join(dirname, '../dist/overlay.html');
  overlayWindow.loadFile(overlayPath);

  // 注意: 初始化数据发送由 startCapture 中的 did-finish-load 处理

  // 设置窗口忽略鼠标事件（初始状态）
  // 后续通过 IPC 在需要时启用鼠标事件
  overlayWindow.setIgnoreMouseEvents(false);

  // 确保窗口获得焦点以接收键盘事件
  overlayWindow.on('ready-to-show', () => {
    overlayWindow.show();
    overlayWindow.focus();
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    currentCaptureSession = null; // 清理会话缓存
  });

  return overlayWindow;
};

/**
 * 预捕获所有屏幕画面
 * 返回原始数据用于后续处理，并关联 Electron 的显示器信息（缩放倍数）
 */
const preCaptureAllScreens = async () => {
  const electronDisplays = screen.getAllDisplays();
  const nativeDisplays = capture.getDisplays();

  logger.info(`[${PLUGIN_ID}] 开始预捕获。检测到原生显示器数量: ${nativeDisplays.length}`);

  const capturePromises = nativeDisplays.map(async (nd) => {
    try {
      logger.info(`[${PLUGIN_ID}] 正在捕获显示器 ID=${nd.id} (${nd.width}x${nd.height})`);
      const buffer = await capture.captureDisplay(nd.id);

      if (!buffer || buffer.length === 0) {
        logger.warn(`[${PLUGIN_ID}] 显示器 ID=${nd.id} 返回的 Buffer 为空`);
        return null;
      }

      // 找到包含该 native 显示器中心点的 Electron 显示器，以获取 scaleFactor
      const centerX = nd.x + nd.width / 2;
      const centerY = nd.y + nd.height / 2;
      const ed = electronDisplays.find((d) => {
        const b = d.bounds;
        return centerX >= b.x && centerX <= b.x + b.width
               && centerY >= b.y && centerY <= b.y + b.height;
      }) || electronDisplays[0];

      logger.info(`[${PLUGIN_ID}] 显示器 ID=${nd.id} 匹配到 Electron 显示器: scale=${ed.scaleFactor}`);

      return {
        displayId: nd.id,
        rawBuffer: buffer,
        width: nd.width,
        height: nd.height,
        scaleFactor: ed.scaleFactor,
        bounds: ed.bounds,
      };
    } catch (err) {
      logger.error(`[${PLUGIN_ID}] 显示器 ID=${nd.id} 捕获发生异常:`, err);
      return null;
    }
  });

  const results = await Promise.allSettled(capturePromises);
  const finalResults = results
    .filter((result) => result.status === 'fulfilled' && result.value !== null)
    .map((result) => result.value);

  logger.info(`[${PLUGIN_ID}] 预捕获完成，成功获取到 ${finalResults.length} 张屏幕画面`);
  return finalResults;
};

/**
 * 启动截图流程
 */
const startCapture = async () => {
  if (overlayWindow) {
    // 已有窗口，聚焦
    overlayWindow.focus();
    return;
  }

  // 预先捕获所有屏幕画面（冻结画面）
  const sessionData = await preCaptureAllScreens();

  if (!sessionData || sessionData.length === 0) {
    logger.error(`[${PLUGIN_ID}] 启动失败: 未能捕获到任何屏幕画面。请检查原生模块加载状态及录屏权限。`);
    // 可以考虑这里弹出一个对话框通知用户
    return;
  }

  currentCaptureSession = sessionData;

  // 并行地为 UI 准备编码后的画面 (WebP)
  const capturedScreens = await Promise.all(sessionData.map(async (s) => ({
    displayId: s.displayId,
    bounds: s.bounds,
    data: await capture.encodeImage(s.rawBuffer, s.width, s.height, 'webp'),
  })));

  // 获取鼠标当前位置，用于判断初始应高亮哪个屏幕
  const cursorPos = screen.getCursorScreenPoint();

  createOverlayWindow();

  // 发送完整的初始化数据
  overlayWindow.webContents.on('did-finish-load', () => {
    // 获取所有显示器的总边界
    const displays = screen.getAllDisplays();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    displays.forEach((display) => {
      const {
        x, y, width, height,
      } = display.bounds;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    });

    const initData = {
      minX,
      minY,
      width: maxX - minX,
      height: maxY - minY,
      capturedScreens,
      cursorPos,
      displays: displays.map((d) => ({
        id: d.id,
        bounds: d.bounds,
      })),
      buildTime: new Date().toLocaleString(),
    };

    logger.info(`[${PLUGIN_ID}] 发送初始化数据, 截图数量: ${capturedScreens.length}`);
    overlayWindow.webContents.send(`overlay-init@${PLUGIN_ID}`, initData);
  });
};

/**
 * 注册全局快捷键
 */
const registerShortcut = (accelerator) => {
  const finalAccelerator = accelerator || getShortcut();
  if (!finalAccelerator) return false;

  // 先注销已有快捷键
  unregisterShortcut();

  try {
    const success = globalShortcut.register(finalAccelerator, () => {
      startCapture();
    });

    if (success) {
      registeredShortcut = finalAccelerator;
    } else {
      // 注册失败
    }

    return success;
  } catch (e) {
    return false;
  }
};

/**
 * 关闭截图叠加层
 */
const closeOverlay = () => {
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
  }
};

// ==================== 插件生命周期 ====================

/**
 * 插件加载时执行
 */
export const pluginDidLoad = () => {
  logger.info(`[${PLUGIN_ID}] 插件已加载`);

  // 如果设置了快捷键，则注册
  const shortcut = getShortcut();
  if (shortcut) {
    registerShortcut(shortcut);
  }
};

/**
 * 插件卸载时执行
 */
export const pluginWillUnload = () => {
  logger.info(`[${PLUGIN_ID}] 插件正在卸载`);

  // 注销快捷键
  unregisterShortcut();

  // 关闭叠加层窗口
  closeOverlay();
};

/**
 * 设置保存时执行
 */
export const pluginSettingSaved = () => {
  logger.info(`[${PLUGIN_ID}] 设置已保存`);

  // 重新注册快捷键
  const shortcut = getShortcut();
  if (shortcut) {
    registerShortcut(shortcut);
  } else {
    unregisterShortcut();
  }
};

export const ipcHandlers = [
  {
    type: 'start-capture',
    handler: () => async () => {
      await startCapture();
    },
  },
  {
    type: 'close-overlay',
    handler: () => () => {
      closeOverlay();
    },
  },
  {
    type: 'register-shortcut',
    handler: () => (accelerator) => registerShortcut(accelerator),
  },
  {
    type: 'unregister-shortcut',
    handler: () => () => unregisterShortcut(),
  },
  {
    type: 'get-window-at-point',
    handler: () => (x, y) => capture.getWindowAtPoint(x, y),
  },
  {
    type: 'get-top-level-windows',
    handler: () => () => capture.getTopLevelWindows(),
  },
  {
    type: 'save-capture',
    handler: () => async (rect) => {
      if (!currentCaptureSession) return null;
      const format = getSaveFormat();
      const savePath = getSavePath();
      const preserveHdr = getPreserveHdr();
      return capture.cropAndSaveScaledFromBuffer(currentCaptureSession, rect, { format, savePath, preserveHdr });
    },
  },
  {
    type: 'copy-capture',
    handler: () => async (rect) => {
      logger.info(`[${PLUGIN_ID}] 收到 copy-capture 请求, rect:`, rect);
      if (!currentCaptureSession) {
        logger.error(`[${PLUGIN_ID}] copy-capture 失败: 没有当前的截图会话`);
        return null;
      }

      try {
        const preserveHdr = getPreserveHdr();

        if (!rect || rect.width <= 0 || rect.height <= 0) {
          logger.error(`[${PLUGIN_ID}] copy-capture 失败: 无效的选区尺寸`, rect);
          return false;
        }

        // 在主进程处理复制逻辑，绕过沙盒限制
        logger.info(`[${PLUGIN_ID}] 开始进行裁剪编码...`);
        const pngBuffer = await capture.cropAndGetPngFromBuffer(currentCaptureSession, rect, { preserveHdr });

        if (pngBuffer && pngBuffer.length > 0) {
          logger.info(`[${PLUGIN_ID}] 编码成功, Buffer 长度: ${pngBuffer.length}, 开始写入剪贴板`);
          const { clipboard, nativeImage } = await import('electron');
          const image = nativeImage.createFromBuffer(pngBuffer);
          clipboard.writeImage(image);
          logger.info(`[${PLUGIN_ID}] 写入剪贴板完成`);
          return true;
        }
        logger.error(`[${PLUGIN_ID}] copy-capture 失败: 编码返回的 Buffer 为空`);
        return false;
      } catch (err) {
        logger.error(`[${PLUGIN_ID}] copy-capture 发生异常:`, err);
        return false;
      }
    },
  },
];
