/**
 * 窗口缩放事件聚合调度器。
 *
 * 交互缩放期间 resize 事件高频到达，首事件立即进入拖动状态
 * （onBurstStart，用于冻结画面），后续事件不断顺延防抖；
 * 防抖到期或外部强制 settle（WM_EXITSIZEMOVE / resized）时执行
 * onSettle 真正调整画面。settle 在空闲期调用为无操作
 */
export default function createResizeScheduler({
  debounceMs,
  onBurstStart = null,
  onSettle = null,
  scheduleDelay = (callback, ms) => setTimeout(callback, ms),
  cancelDelay = (id) => clearTimeout(id),
}) {
  let timer = null;
  let bursting = false;

  const scheduler = {
    notifyResize() {
      if (!bursting) {
        bursting = true;
        if (onBurstStart) {
          onBurstStart();
        }
      }
      if (timer !== null) {
        cancelDelay(timer);
      }
      timer = scheduleDelay(() => {
        timer = null;
        scheduler.settle();
      }, debounceMs);
    },

    /**
     * 立即结算当前拖动批次；空闲期调用返回 false，不触发 onSettle
     */
    settle() {
      if (timer !== null) {
        cancelDelay(timer);
        timer = null;
      }
      if (!bursting) {
        return false;
      }
      bursting = false;
      if (onSettle) {
        onSettle();
      }
      return true;
    },

    dispose() {
      if (timer !== null) {
        cancelDelay(timer);
        timer = null;
      }
      bursting = false;
    },
  };
  return scheduler;
}
