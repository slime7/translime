import {
  app,
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
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'Main' }) : baseLogger;

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
const getSavePath = () => pluginConfig.get('savePath') || app.getPath('pictures');
const getSaveFormat = () => pluginConfig.get('saveFormat', 'png');
const getPreserveHdr = () => pluginConfig.get('preserveHdr', false);
// HDR 映射设置
const getEnableHdrMapping = () => pluginConfig.get('enableHdrMapping', true);
const getSdrWhiteNits = () => pluginConfig.get('sdrWhiteNits', 203);
const getHdrMaxNits = () => pluginConfig.get('hdrMaxNits', 1000);
const getSaveFilenameTemplate = () => pluginConfig.get('saveFilenameTemplate', '');

/**
 * 注销全局快捷键
 */
const unregisterShortcut = () => {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    logger.info(`快捷键已注销: ${registeredShortcut}`);
    registeredShortcut = null;
  }
};

/**
 * 创建透明叠加层窗口
 */
/**
 * 获取所有显示器的组合边界
 */
const getAllDisplaysBounds = () => {
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

  return {
    displays,
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

/**
 * 创建透明叠加层窗口
 */
const createOverlayWindow = (isDebug = false) => {
  const {
    minX, minY, width, height,
  } = getAllDisplaysBounds();

  overlayWindow = new BrowserWindow({
    x: minX,
    y: minY,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: !isDebug, // Debug 模式下不置顶
    skipTaskbar: !isDebug,
    resizable: isDebug,
    movable: isDebug,
    maximizable: true,
    fullscreen: false,
    thickFrame: false,
    hasShadow: false,
    type: 'toolbar',
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
    width,
    height,
  });

  // 加载叠加层 HTML
  const overlayPath = path.join(dirname, '../dist/overlay.html');
  overlayWindow.loadFile(overlayPath);

  if (isDebug) {
    overlayWindow.webContents.openDevTools({ mode: 'detach' });
  }

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

  logger.info('开始预捕获。检测到原生显示器数量:', nativeDisplays.length);

  // 读取 HDR 映射配置
  const enableHdrMapping = getEnableHdrMapping();
  const sdrWhiteNits = getSdrWhiteNits();
  const hdrMaxNits = getHdrMaxNits();
  const preserveHdr = getPreserveHdr();

  // 构建 HDR 映射选项（仅在启用时传递）
  const hdrOptions = enableHdrMapping ? {
    enabled: true,
    sdrWhiteNits,
    hdrMaxNits,
    // 当用户启用了 HDR 映射且勾选了保存 HDR 原始文件时，请求原始数据
    preserveRaw: preserveHdr,
  } : null;

  logger.info('HDR 映射配置:', {
    enableHdrMapping, sdrWhiteNits, hdrMaxNits, preserveHdr,
  });

  const capturePromises = nativeDisplays.map(async (nd) => {
    try {
      logger.info(`正在捕获显示器 ID=${nd.id} (预期 ${nd.width}x${nd.height})`);
      const {
        buffer, width, height, isHdr, rawHdrBuffer,
      } = await capture.captureDisplay(nd.id, hdrOptions);

      if (!buffer || buffer.length === 0) {
        logger.warn(`显示器 ID=${nd.id} 返回的 Buffer 为空`);
        return null;
      }

      logger.info(`显示器 ID=${nd.id} 捕获成功: 实际尺寸 ${width}x${height}, Buffer 长度 ${buffer.length}, IS_HDR: ${isHdr}, 原始 HDR 数据: ${rawHdrBuffer ? rawHdrBuffer.length : 'N/A'}`);

      // 找到包含该 native 显示器中心点的 Electron 显示器，以获取 scaleFactor
      const centerX = nd.x + nd.width / 2;
      const centerY = nd.y + nd.height / 2;
      const ed = electronDisplays.find((d) => {
        const b = d.bounds;
        return centerX >= b.x && centerX <= b.x + b.width
               && centerY >= b.y && centerY <= b.y + b.height;
      }) || electronDisplays[0];

      logger.info(`显示器 ID=${nd.id} 匹配到 Electron 显示器: scale=${ed.scaleFactor}`);

      return {
        displayId: nd.id,
        buffer,
        width,
        height,
        scaleFactor: ed.scaleFactor,
        bounds: ed.bounds,
        isHdr,
        rawHdrBuffer, // 保存原始 HDR 数据 (如果有)
      };
    } catch (err) {
      logger.error(`显示器 ID=${nd.id} 捕获发生异常:`, err);
      return null;
    }
  });

  const results = await Promise.allSettled(capturePromises);
  const finalResults = results
    .filter((result) => result.status === 'fulfilled' && result.value !== null)
    .map((result) => result.value);

  logger.info(`预捕获完成，成功获取到 ${finalResults.length} 张屏幕画面`);
  return finalResults;
};

/**
 * 启动截图流程
 */
const startCapture = async (isDebug = false) => {
  if (overlayWindow) {
    // 已有窗口，聚焦
    overlayWindow.focus();
    return;
  }

  // 适当减少宁静时间。阶梯轮询逻辑已移至 native 层，此处仅做最小化 DWM 稳定缓冲
  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });

  // 预先捕获所有屏幕画面（冻结画面）
  let sessionData = [];
  // 并行地为 UI 准备编码后的画面 (WebP)
  let capturedScreens = [];

  if (!isDebug) {
    sessionData = await preCaptureAllScreens();

    if (!sessionData || sessionData.length === 0) {
      logger.error('启动失败: 未能捕获到任何屏幕画面。请检查原生模块加载状态及录屏权限。');
      // 可以考虑这里弹出一个对话框通知用户
      return;
    }

    currentCaptureSession = sessionData;

    // [重要修改] Native 已经完成了预览所需的 SDR 转换，此处不再调用冗余的 toneMap
    capturedScreens = await Promise.all(sessionData.map(async (s) => ({
      displayId: s.displayId,
      bounds: s.bounds,
      data: await capture.encodeImage(s.buffer, s.width, s.height, 'webp'),
    })));
  } else {
    logger.info('Debug 模式：跳过实际截屏，提供空数据以启动 UI');
  }

  // 获取鼠标当前位置，用于判断初始应高亮哪个屏幕
  const cursorPos = screen.getCursorScreenPoint();

  // 获取所有顶层窗口信息用于点击识别
  const nativeWindows = capture.getTopLevelWindows();
  logger.info(`原生模块返回 ${nativeWindows.length} 个窗口`);

  const windows = nativeWindows.map((win) => {
    try {
      const topLeft = screen.screenToDipPoint({ x: win.left, y: win.top });
      const bottomRight = screen.screenToDipPoint({ x: win.right, y: win.bottom });
      return {
        ...win,
        left: topLeft.x,
        top: topLeft.y,
        right: bottomRight.x,
        bottom: bottomRight.y,
        width: Math.abs(bottomRight.x - topLeft.x),
        height: Math.abs(bottomRight.y - topLeft.y),
      };
    } catch (e) {
      logger.error(`转换窗口坐标失败 [${win.title}]:`, e);
      return null;
    }
  }).filter(Boolean);

  const {
    displays: allDisplays, minX, minY, width: totalWidth, height: totalHeight,
  } = getAllDisplaysBounds();

  // 为每个显示器添加独立的自动选区候选
  allDisplays.forEach((d, idx) => {
    windows.push({
      handle: 0,
      title: `显示器 ${idx + 1} (${d.bounds.width}x${d.bounds.height})`,
      class_name: 'Display',
      left: d.bounds.x,
      top: d.bounds.y,
      right: d.bounds.x + d.bounds.width,
      bottom: d.bounds.y + d.bounds.height,
      width: d.bounds.width,
      height: d.bounds.height,
    });
  });

  if (windows.length > 0) {
    logger.info(`坐标转换后保留 ${windows.length} 个项 (含窗口和显示器)`);
  } else {
    logger.warn('未能成功转换任何窗口坐标或搜索结果为空');
  }

  createOverlayWindow(isDebug);

  // 发送完整的初始化数据
  overlayWindow.webContents.on('did-finish-load', () => {
    const initData = {
      isDebug,
      minX,
      minY,
      width: totalWidth,
      height: totalHeight,
      capturedScreens,
      cursorPos,
      windows, // 发送窗口数据
      displays: allDisplays.map((d) => ({
        id: d.id,
        bounds: d.bounds,
      })),
    };

    logger.info(`发送初始化数据, 截图数量: ${capturedScreens.length}, 窗口数量: ${windows.length}, isDebug: ${isDebug}`);
    overlayWindow.webContents.send(`overlay-init@${PLUGIN_ID}`, initData);
  });
};

/**
 * 注册全局快捷键
 */
const registerShortcut = (accelerator) => {
  let finalAccelerator = accelerator || getShortcut();
  if (!finalAccelerator) return false;

  // 基础归一化：将 Win 转换为 Super (Electron 规范)
  finalAccelerator = finalAccelerator.replace(/Win/g, 'Super');

  // 基础校验：不能以 '+' 结尾，且最后一位不能是修饰键（如 "Ctrl+Alt" 是非法的）
  const parts = finalAccelerator.split('+');
  const lastPart = parts[parts.length - 1];
  const modifiers = ['Ctrl', 'Control', 'Alt', 'Shift', 'Super', 'Meta', 'Cmd', 'Command'];
  if (!lastPart || modifiers.includes(lastPart)) {
    // 这是一个不完整的快捷键，忽略注册过程
    return false;
  }

  // 先注销已有快捷键
  unregisterShortcut();

  try {
    const success = globalShortcut.register(finalAccelerator, () => {
      logger.info(`触发快捷键: ${finalAccelerator}`);
      startCapture().catch((err) => {
        logger.error('快捷键触发 startCapture 失败:', err);
      });
    });

    if (success) {
      logger.info(`快捷键注册成功: ${finalAccelerator}`);
      registeredShortcut = finalAccelerator;
    } else {
      logger.error(`快捷键注册失败: ${finalAccelerator} (可能已被占用)`);
    }

    return success;
  } catch (e) {
    logger.error(`注册快捷键时发生错误: ${finalAccelerator}`, e);
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
  logger.info('插件已加载');

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
  logger.info('插件正在卸载');

  // 注销快捷键
  unregisterShortcut();

  // 关闭叠加层窗口
  closeOverlay();
};

/**
 * 设置保存时执行
 */
export const pluginSettingSaved = () => {
  logger.info('设置已保存');

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
    handler: () => async ({ isDebug = false }) => {
      await startCapture(isDebug);
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
    handler: () => (x, y) => {
      let ignoreHandle = null;
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        try {
          const handleBuf = overlayWindow.getNativeWindowHandle();
          // Windows HWND is 8 bytes on x64, 4 bytes on x86 but Electron usually returns 8 bytes buffer on x64
          if (handleBuf.length === 8) {
            ignoreHandle = handleBuf.readBigInt64LE(0);
          } else if (handleBuf.length === 4) {
            ignoreHandle = BigInt(handleBuf.readInt32LE(0));
          }
        } catch (e) {
          logger.error('获取 Overlay 窗口句柄失败:', e);
        }
      }

      const physicalPoint = screen.dipToScreenPoint({ x: Math.round(x), y: Math.round(y) });
      logger.debug(`Window detection: Logical(${x}, ${y}) -> Physical(${physicalPoint.x}, ${physicalPoint.y})`);

      const win = capture.getWindowAtPoint(physicalPoint.x, physicalPoint.y, ignoreHandle);

      if (win) {
        const topLeft = screen.screenToDipPoint({ x: win.left, y: win.top });
        const bottomRight = screen.screenToDipPoint({ x: win.right, y: win.bottom });

        win.left = topLeft.x;
        win.top = topLeft.y;
        win.right = bottomRight.x;
        win.bottom = bottomRight.y;
        win.width = Math.abs(bottomRight.x - topLeft.x);
        win.height = Math.abs(bottomRight.y - topLeft.y);
      }
      return win;
    },
  },
  {
    type: 'get-top-level-windows',
    handler: () => () => capture.getTopLevelWindows(),
  },
  {
    type: 'save-capture',
    handler: () => async (rect) => {
      if (!currentCaptureSession) {
        return null;
      }
      const format = getSaveFormat();
      const savePath = getSavePath();
      const preserveHdr = getPreserveHdr();
      const saveFilenameTemplate = getSaveFilenameTemplate();
      logger.info('保存截图', {
        saveINfo: {
          format,
          savePath,
          preserveHdr,
          saveFilenameTemplate,
        },
      });
      return capture.cropAndSaveScaledFromBuffer(currentCaptureSession, rect, {
        format, savePath, preserveHdr, saveFilenameTemplate,
      });
    },
  },
  {
    type: 'copy-capture',
    handler: () => async (rect) => {
      logger.info('收到 copy-capture 请求, rect:', rect);
      if (!currentCaptureSession) {
        logger.error('copy-capture 失败: 没有当前的截图会话');
        return null;
      }

      try {
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          logger.error('copy-capture 失败: 无效的选区尺寸', rect);
          return false;
        }

        // 在主进程处理复制逻辑，绕过沙盒限制
        logger.info('开始进行裁剪编码...');
        const pngBuffer = await capture.cropAndGetPngFromBuffer(currentCaptureSession, rect);

        if (pngBuffer && pngBuffer.length > 0) {
          logger.info(`编码成功, Buffer 长度: ${pngBuffer.length}, 开始写入剪贴板`);
          const { clipboard, nativeImage } = await import('electron');
          const image = nativeImage.createFromBuffer(pngBuffer);
          clipboard.writeImage(image);
          logger.info('写入剪贴板完成');
          return true;
        }
        logger.error('copy-capture 失败: 编码返回的 Buffer 为空');
        return false;
      } catch (err) {
        logger.error('copy-capture 发生异常:', err);
        return false;
      }
    },
  },
  {
    type: 'get-default-save-path',
    handler: () => async () => app.getPath('pictures'),
  },
];
