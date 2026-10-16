/**
 * 控制栏显隐状态机
 *
 * @param {object} options
 * @param {number} [options.hideDelayMs=2000] - 隐藏延迟毫秒数。
 * @param {function(boolean): void} options.onChange - 显隐变化回调。
 * @returns {{ show: function(object=): void, hide: function(): void, dispose: function(): void }}
 */
export const createChromeVisibility = ({ hideDelayMs = 2000, onChange }) => {
  let revealed = true;
  let hideTimer = null;
  let showTimer = null;

  const cancelPendingHide = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const cancelPendingShow = () => {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
  };

  return {
    show({ delayMs = 0 } = {}) {
      cancelPendingHide();
      if (revealed) {
        cancelPendingShow();
        return;
      }
      if (delayMs <= 0) {
        cancelPendingShow();
        revealed = true;
        onChange(true);
        return;
      }
      if (!showTimer) {
        showTimer = setTimeout(() => {
          showTimer = null;
          revealed = true;
          onChange(true);
        }, delayMs);
      }
    },
    hide() {
      cancelPendingShow();
      if (!revealed || hideTimer) {
        return;
      }
      hideTimer = setTimeout(() => {
        hideTimer = null;
        revealed = false;
        onChange(false);
      }, hideDelayMs);
    },
    dispose() {
      cancelPendingHide();
      cancelPendingShow();
      revealed = true;
    },
  };
};

export default createChromeVisibility;
