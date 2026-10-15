import { createRequire } from 'node:module';
import { nativeImage } from 'electron';
import { fitVideoRect } from './window-size';
import createResizeScheduler from './resize-scheduler';

const requireNative = createRequire(import.meta.url);

export const GWL_STYLE = -16;
export const WM_EXITSIZEMOVE = 0x0232;

const GA_ROOT = 2;

// 窗口样式值含第 31 位（WS_POPUP），超出 JS 32 位位运算范围，必须经 BigInt 参与运算
const WS_VISIBLE = 0x10000000n;
const WS_CLIPCHILDREN = 0x02000000n;
const WS_CHILD = 0x40000000n;
const WS_POPUP = 0x80000000n;

// 非客户区样式：SDL 窗口若保留标题栏与可调边框，嵌入后父窗口内会出现
// 第二套标题栏与拖动边缘并挤占画面区，挂载时一律去除
const WS_CAPTION = 0x00c00000n;
const WS_THICKFRAME = 0x00040000n;
const WS_SYSMENU = 0x00080000n;
const WS_MINIMIZEBOX = 0x00020000n;
const WS_MAXIMIZEBOX = 0x00010000n;
const NONCLIENT_STYLES = WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX;

const GW_CHILD = 5;

// hWndInsertAfter 取值：HWND_TOP 抬到同层级最上层，HWND_BOTTOM 压到最底层
const HWND_TOP = 0;
const HWND_BOTTOM = 1;

const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SWP_SHOWWINDOW = 0x0040;
const SWP_HIDEWINDOW = 0x0080;

// PrintWindow 标志：只取客户区（画面区），并强制 DWM 合成内容（SDL 为 GPU 渲染窗口）
const PW_CLIENTONLY = 0x00000001;
const PW_RENDERFULLCONTENT = 0x00000002;

let bindings = null;
let bindingsError = null;

const loadBindings = () => {
  if (bindings) {
    return bindings;
  }
  if (bindingsError) {
    throw bindingsError;
  }
  if (process.platform !== 'win32') {
    bindingsError = new Error('scrcpy 画面挂载仅支持 Windows 平台');
    throw bindingsError;
  }
  try {
    const koffi = requireNative('koffi');
    // koffi 类型注册表在宿主进程内共享，插件热重载会重复执行本模块，
    // 用随机后缀避免 RECT 结构体重名冲突
    const suffix = Math.random().toString(36).slice(2);
    const rectName = `scrcpy_wrapper_rect_${suffix}`;
    const RECT = koffi.struct(rectName, {
      left: 'int32_t',
      top: 'int32_t',
      right: 'int32_t',
      bottom: 'int32_t',
    });
    const bitmapInfoName = `scrcpy_wrapper_bmi_${suffix}`;
    const BITMAPINFOHEADER = koffi.struct(bitmapInfoName, {
      biSize: 'uint32_t',
      biWidth: 'int32_t',
      biHeight: 'int32_t',
      biPlanes: 'uint16_t',
      biBitCount: 'uint16_t',
      biCompression: 'uint32_t',
      biSizeImage: 'uint32_t',
      biXPelsPerMeter: 'int32_t',
      biYPelsPerMeter: 'int32_t',
      biClrUsed: 'uint32_t',
      biClrImportant: 'uint32_t',
    });
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const gdi32 = koffi.load('gdi32.dll');
    bindings = {
      RECT,
      // koffi 2.x 的 struct 类型不能 new，出参结构体经 alloc/decode 读写
      rectPtr: koffi.alloc(RECT, 1),
      decodeRect: (ptr) => koffi.decode(ptr, RECT),
      bitmapInfoSize: koffi.sizeof(BITMAPINFOHEADER),
      FindWindowW: user32.func('intptr_t __stdcall FindWindowW(const str16 lpClassName, const str16 lpWindowName)'),
      GetWindow: user32.func('intptr_t __stdcall GetWindow(intptr_t hWnd, uint32_t nCmd)'),
      SetParent: user32.func('intptr_t __stdcall SetParent(intptr_t hWndChild, intptr_t hWndNewParent)'),
      GetAncestor: user32.func('intptr_t __stdcall GetAncestor(intptr_t hWnd, uint32_t nCmd)'),
      GetWindowLongPtrW: user32.func('uintptr_t __stdcall GetWindowLongPtrW(intptr_t hWnd, int32_t nIndex)'),
      SetWindowLongPtrW: user32.func('uintptr_t __stdcall SetWindowLongPtrW(intptr_t hWnd, int32_t nIndex, uintptr_t dwNewLong)'),
      SetWindowPos: user32.func('int8_t __stdcall SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int32_t X, int32_t Y, int32_t cx, int32_t cy, uint32_t uFlags)'),
      AttachThreadInput: user32.func('int8_t __stdcall AttachThreadInput(uint32_t idAttach, uint32_t idAttachTo, int8_t fAttach)'),
      GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hWnd, uint32_t *lpdwProcessId)'),
      GetClientRect: user32.func(`int8_t __stdcall GetClientRect(intptr_t hWnd, ${rectName} *lpRect)`),
      PrintWindow: user32.func('int8_t __stdcall PrintWindow(intptr_t hWnd, intptr_t hdcBlt, uint32_t nFlags)'),
      GetWindowDC: user32.func('intptr_t __stdcall GetWindowDC(intptr_t hWnd)'),
      ReleaseDC: user32.func('int32_t __stdcall ReleaseDC(intptr_t hWnd, intptr_t hDC)'),
      GetCurrentThreadId: kernel32.func('uint32_t __stdcall GetCurrentThreadId()'),
      CreateCompatibleDC: gdi32.func('intptr_t __stdcall CreateCompatibleDC(intptr_t hdc)'),
      CreateCompatibleBitmap: gdi32.func('intptr_t __stdcall CreateCompatibleBitmap(intptr_t hdc, int32_t nWidth, int32_t nHeight)'),
      SelectObject: gdi32.func('intptr_t __stdcall SelectObject(intptr_t hdc, intptr_t hgdiobj)'),
      GetDIBits: gdi32.func(`int32_t __stdcall GetDIBits(intptr_t hdc, intptr_t hbm, uint32_t start, uint32_t cLines, void *lpvBits, const ${bitmapInfoName} *lpbi, uint32_t usage)`),
      DeleteObject: gdi32.func('int8_t __stdcall DeleteObject(intptr_t hObject)'),
      DeleteDC: gdi32.func('int8_t __stdcall DeleteDC(intptr_t hdc)'),
    };
    return bindings;
  } catch (e) {
    bindingsError = new Error(`加载 koffi win32 绑定失败: ${e.message}`);
    throw bindingsError;
  }
};

export const hwndFromWindow = (win) => {
  const buf = win.getNativeWindowHandle();
  if (buf.length >= 8) {
    return Number(buf.readBigUInt64LE(0));
  }
  return buf.readUInt32LE(0);
};

export const findWindowByTitle = (title) => {
  const b = loadBindings();
  const hwnd = b.FindWindowW(null, title);
  return hwnd > 0 ? hwnd : 0;
};

/**
 * 同步子窗口到客户区，物理像素坐标。
 *
 * 画面区为客户区扣除顶部自绘标题栏与底部控制条；aspect（设备分辨率）存在时
 * 等比缩放并居中，四周留黑边；缺省时铺满画面区。frameChanged 仅挂载后样式
 * 变更时需要，持续同步阶段不发送以免逐帧重算非客户区。
 *
 * 每次默认以 HWND_TOP 落位：父窗口缩放时 Chromium 会把网页输入
 * 子窗口（Chrome_RenderWidgetHostHWND）重新置顶，若不抬回 SDL，
 * 物理点击会被它截走（该窗口不参与绘制，画面可见但点击失效）。
 * keepBelow 供冻结覆盖层显示期间使用：改为压到网页之下以免盖住覆盖层，
 * 抬回由撤下覆盖层的一方负责
 */
export const syncChildRect = (wrapperWin, sdlHwnd, options = {}) => {
  const b = loadBindings();
  const {
    barPhysicalHeight = 0,
    topBarPhysicalHeight = 0,
    show = true,
    frameChanged = false,
    aspect = null,
    keepBelow = false,
  } = options;
  const parentHwnd = hwndFromWindow(wrapperWin);
  if (!b.GetClientRect(parentHwnd, b.rectPtr)) {
    return;
  }
  const rect = b.decodeRect(b.rectPtr);
  const clientW = rect.right - rect.left;
  const clientH = rect.bottom - rect.top;
  const barH = Math.max(0, Math.round(barPhysicalHeight));
  const topH = Math.max(0, Math.round(topBarPhysicalHeight));
  const video = fitVideoRect({
    areaWidth: clientW,
    areaHeight: clientH - barH - topH,
    aspect,
  });
  const flags = SWP_NOACTIVATE
    | (frameChanged ? SWP_FRAMECHANGED : 0)
    | (show ? SWP_SHOWWINDOW : 0);
  b.SetWindowPos(sdlHwnd, keepBelow ? HWND_BOTTOM : HWND_TOP, video.x, video.y + topH, video.width, video.height, flags);
};

/**
 * 校验 SDL 子窗口是否仍是父窗口最上层子窗口，不是则抬回。
 * 最大化/还原等窗口排布路径 Chromium 会重新置顶网页输入子窗口
 * 且不一定伴随可监听的 resize 事件，作为 z 序的独立兜底
 */
export const ensureChildOnTop = (wrapperWin, sdlHwnd) => {
  const b = loadBindings();
  const parentHwnd = hwndFromWindow(wrapperWin);
  if (b.GetWindow(parentHwnd, GW_CHILD) === sdlHwnd) {
    return;
  }
  b.SetWindowPos(sdlHwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
};

const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

/**
 * 跨进程 SetParent：带 WS_CHILD 样式对仍在初始化的 SDL 窗口调用会静默
 * 失败（返回 0 且窗口保持顶层），必须保持 WS_POPUP 先挂父并校验结果，
 * 一次未生效时等待 SDL 初始化完成再重试，超过次数仍失败视为挂载失败
 */
const setParentVerified = async (b, sdlHwnd, parentHwnd, attempt = 1) => {
  b.SetParent(sdlHwnd, parentHwnd);
  if (b.GetAncestor(sdlHwnd, GA_ROOT) === parentHwnd) {
    return;
  }
  if (attempt >= 10) {
    throw new Error('scrcpy 画面窗口挂载失败：SetParent 未生效');
  }
  await delay(100);
  await setParentVerified(b, sdlHwnd, parentHwnd, attempt + 1);
};

/**
 * 把 scrcpy 的 SDL 窗口以无边框形式嵌入 Electron wrapper 窗口。
 *
 * 顺序不能颠倒：必须先挂父再改样式——SDL 初始化期间对带 WS_CHILD 样式的
 * 窗口跨进程 SetParent 会静默失败；先挂父时窗口仍为 WS_POPUP 顶层窗口，
 * 总能成功。挂父前先隐藏窗口，挂父后转 WS_CHILD 并去除 WS_POPUP 与
 * 标题栏/可调边框等非客户区样式，避免父窗口内出现第二套标题栏、拖动边缘
 * 与画面黑边；隐藏到重显的完整周期也让任务栏按子窗口身份移除 scrcpy
 * 原有的任务栏项；跨进程挂接输入线程完成后立即解绑
 */
export const mountSdlToElectron = async (wrapperWin, sdlHwnd, options = {}) => {
  const b = loadBindings();
  const parentHwnd = hwndFromWindow(wrapperWin);
  const currentThread = b.GetCurrentThreadId();
  const sdlThread = b.GetWindowThreadProcessId(sdlHwnd, null);
  const attached = b.AttachThreadInput(currentThread, sdlThread, 1);
  try {
    b.SetWindowPos(sdlHwnd, 0, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_HIDEWINDOW);

    await setParentVerified(b, sdlHwnd, parentHwnd);

    const parentStyle = b.GetWindowLongPtrW(parentHwnd, GWL_STYLE);
    b.SetWindowLongPtrW(parentHwnd, GWL_STYLE, Number(BigInt(parentStyle) | WS_CLIPCHILDREN));

    const childStyle = b.GetWindowLongPtrW(sdlHwnd, GWL_STYLE);
    const childNext = Number((BigInt(childStyle) | WS_CHILD | WS_VISIBLE) & ~WS_POPUP & ~NONCLIENT_STYLES);
    b.SetWindowLongPtrW(sdlHwnd, GWL_STYLE, childNext);

    syncChildRect(wrapperWin, sdlHwnd, { ...options, frameChanged: true });
  } finally {
    if (attached) {
      b.AttachThreadInput(currentThread, sdlThread, 0);
    }
  }
};

/**
 * 把 SDL 子窗口压到同层兄弟窗口的最底部（保持可见）。
 * 冻结帧覆盖层是网页内容，层级在原生子窗口之下：压低而不是隐藏，
 * scrcpy 才能继续保持渲染与推流，覆盖期间 pixels 比对才有新内容可读；
 * 抬回由撤下覆盖层时的 ensureChildOnTop 负责
 */
export const lowerWindowBelowSiblings = (sdlHwnd) => {
  const b = loadBindings();
  b.SetWindowPos(sdlHwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
};

/**
 * 抓取 SDL 画面窗口当前帧的原始 BGRA 像素与尺寸，供冻结覆盖层图片与
 * settle 后的「画面是否跟上」比对使用；返回 null 表示窗口无效或抓帧失败
 */
export const captureWindowPixels = (sdlHwnd) => {
  const b = loadBindings();
  if (!b.GetClientRect(sdlHwnd, b.rectPtr)) {
    return null;
  }
  const rect = b.decodeRect(b.rectPtr);
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  if (width <= 0 || height <= 0) {
    return null;
  }
  const screenDc = b.GetWindowDC(0);
  const memDc = screenDc ? b.CreateCompatibleDC(screenDc) : 0;
  const bitmap = memDc ? b.CreateCompatibleBitmap(screenDc, width, height) : 0;
  try {
    if (!bitmap) {
      return null;
    }
    const previous = b.SelectObject(memDc, bitmap);
    const printed = b.PrintWindow(sdlHwnd, memDc, PW_CLIENTONLY | PW_RENDERFULLCONTENT);
    b.SelectObject(memDc, previous);
    if (!printed) {
      return null;
    }
    // 负高度自顶向下读取 BGRA 像素，与 nativeImage.createFromBitmap 的布局一致；
    // 32bpp BI_RGB 无调色板，仅传头部即可
    const buffer = Buffer.allocUnsafe(width * height * 4);
    const lines = b.GetDIBits(memDc, bitmap, 0, height, buffer, {
      biSize: b.bitmapInfoSize,
      biWidth: width,
      biHeight: -height,
      biPlanes: 1,
      biBitCount: 32,
      biCompression: 0,
      biSizeImage: 0,
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0,
    }, 0);
    if (lines !== height) {
      return null;
    }
    return { buffer, width, height };
  } finally {
    if (bitmap) {
      b.DeleteObject(bitmap);
    }
    if (memDc) {
      b.DeleteDC(memDc);
    }
    if (screenDc) {
      b.ReleaseDC(0, screenDc);
    }
  }
};

/** 把 captureWindowPixels 的结果编码为可直接用于 <img> 的 dataURL */
export const windowPixelsToDataUrl = ({ buffer, width, height }) => nativeImage
  .createFromBitmap(buffer, { width, height })
  .toDataURL({ format: 'jpeg', quality: 80 });

/**
 * 缩放实时同步：交互缩放期间 resize 事件经调度器聚合成一次滞后同步，
 * 拖动期间画面区由调用方冻结并显示模糊层；防抖到期（或 WM_EXITSIZEMOVE、
 * resized 事件）时真正调整 SDL 尺寸并回调 onResizeSettled，模糊层何时撤下
 * 由调用方决定；低频 z 序巡检兜底最大化/还原等未触发监听的置顶路径，
 * isFrozen 为真期间跳过巡检且落位压底，避免盖住覆盖层
 */
export const setupResizeSync = (wrapperWin, sdlHwnd, options = {}) => {
  const {
    getBarPhysicalHeight = () => 0,
    getTopBarPhysicalHeight = () => 0,
    getAspect = () => null,
    isFrozen = () => false,
    debounceMs = 120,
    onResizeBurstStart = null,
    onResizeSettled = null,
  } = options;

  const sync = () => {
    syncChildRect(wrapperWin, sdlHwnd, {
      barPhysicalHeight: getBarPhysicalHeight(),
      topBarPhysicalHeight: getTopBarPhysicalHeight(),
      aspect: getAspect(),
      show: true,
      keepBelow: isFrozen(),
    });
  };

  const scheduler = createResizeScheduler({
    debounceMs,
    onBurstStart: () => onResizeBurstStart?.(),
    onSettle: () => {
      sync();
      onResizeSettled?.();
    },
  });

  const schedule = () => scheduler.notifyResize();
  const settleNow = () => scheduler.settle();
  wrapperWin.on('resize', schedule);
  wrapperWin.on('will-resize', schedule);
  wrapperWin.on('resized', settleNow);
  wrapperWin.hookWindowMessage(WM_EXITSIZEMOVE, settleNow);
  const zOrderTimer = setInterval(() => {
    if (isFrozen()) {
      return;
    }
    try {
      ensureChildOnTop(wrapperWin, sdlHwnd);
    } catch {
      // 窗口可能已销毁，destroy 时统一清理定时器
    }
  }, 500);

  return {
    destroy() {
      scheduler.dispose();
      clearInterval(zOrderTimer);
      try {
        wrapperWin.unhookWindowMessage(WM_EXITSIZEMOVE);
      } catch {
        // 窗口可能已销毁
      }
      wrapperWin.removeListener('resize', schedule);
      wrapperWin.removeListener('will-resize', schedule);
      wrapperWin.removeListener('resized', settleNow);
    },
  };
};
