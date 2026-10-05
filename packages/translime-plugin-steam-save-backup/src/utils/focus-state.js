/**
 * 焦点状态防抖确认（纯逻辑，定时器可注入）：
 * 输入与当前状态不同时进入候选，状态持续稳定 settleMs 后才切换并回调；
 * 期间回到原状态则取消候选，避免瞬时焦点抖动（alt-tab 掠过）触发暂停/恢复。
 *
 * @param {{initialState?: boolean, settleMs?: number, onChange?: Function,
 *   setTimer?: Function, clearTimer?: Function}} options
 * @returns {{apply: (focused: boolean) => boolean, cancel: () => void}}
 */
export const createFocusStateResolver = ({
  initialState = false,
  settleMs = 2000,
  onChange = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) => {
  let current = initialState;
  let timer = null;

  const cancel = () => {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
  };

  const apply = (focused) => {
    if (focused === current) {
      cancel();
      return current;
    }
    cancel();
    timer = setTimer(() => {
      timer = null;
      current = focused;
      onChange(current);
    }, settleMs);
    return current;
  };

  return { apply, cancel };
};

export default createFocusStateResolver;
