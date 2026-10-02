/**
 * 首屏关键字体等待工具。
 *
 * 主窗口要等 main-renderer-ready 之后才会替换启动动画；若此时图标字体
 * 尚未加载完成，导航与卡片图标会先闪现连字文本。这里显式触发关键字体
 * 的加载并等待完成；加载失败或超时都按就绪处理，避免启动流程被卡住。
 */

/** 关键字体等待的时长上限（毫秒）。字体为本地资源，超时通常意味着加载异常。 */
const CRITICAL_FONT_WAIT_TIMEOUT = 3000;

/** 主窗口首屏依赖的图标字体（CSS font 简写形式）。 */
const CRITICAL_FONT_SPEC = '24px "Material Symbols Outlined"';

let criticalFontsTask = null;

const loadFont = (fontSpec) => {
  try {
    return document.fonts.load(fontSpec);
  } catch (err) {
    return Promise.resolve();
  }
};

const waitForFonts = (timeout) => new Promise((resolve) => {
  if (!document.fonts) {
    resolve();
    return;
  }
  const timeoutId = setTimeout(() => {
    resolve();
  }, timeout);
  Promise.all([loadFont(CRITICAL_FONT_SPEC), document.fonts.ready])
    .catch(() => {})
    .then(() => {
      clearTimeout(timeoutId);
      resolve();
    });
});

/**
 * 等待首屏关键字体就绪；多次调用共享同一次等待。
 *
 * @param {number} [timeout=CRITICAL_FONT_WAIT_TIMEOUT] 最长等待毫秒数。
 * @returns {Promise<void>} 字体就绪或超时后兑现。
 */
const waitForCriticalFonts = (timeout = CRITICAL_FONT_WAIT_TIMEOUT) => {
  if (!criticalFontsTask) {
    criticalFontsTask = waitForFonts(timeout);
  }
  return criticalFontsTask;
};

export default waitForCriticalFonts;
