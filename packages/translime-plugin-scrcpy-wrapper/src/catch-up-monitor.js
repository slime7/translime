/**
 * 缩放收尾监视器：settle 调整 SDL 尺寸后，等设备端画面真正跟上再撤下冻结覆盖层。
 *
 * 虚拟屏模式调整窗口后，设备端要重建编码器、按新分辨率推流，SDL 内容要过
 * 一段时间才更新；diff 模式轮询抓取 SDL 像素，内容相对基线发生变化即认为
 * 新画面已到达并撤下覆盖层，内容迟迟不变则按时限兜底撤下。timed 模式不做
 * 比对（覆盖下抓帧不可靠时，或收尾退化为按时限撤下的场景），到时限直接撤下
 */
export default function createCatchUpMonitor({
  mode,
  capture = null,
  reveal,
  baselineDelayMs = 120,
  pollIntervalMs = 90,
  capMs = 1000,
  timedRevealMs = 400,
  now = () => Date.now(),
  scheduleDelay = (callback, ms) => setTimeout(callback, ms),
  cancelDelay = (id) => clearTimeout(id),
}) {
  let timer = null;
  let startedAt = 0;
  let baseline = null;
  let finished = false;

  const finish = () => {
    if (timer !== null) {
      cancelDelay(timer);
      timer = null;
    }
    if (finished) {
      return;
    }
    finished = true;
    baseline = null;
    reveal();
  };

  const safeCapture = () => {
    try {
      return capture?.() ?? null;
    } catch {
      // 抓帧异常等同失败，交给各自的兜底路径
      return null;
    }
  };

  const tick = () => {
    timer = null;
    if (finished) {
      return;
    }
    if (baseline === null) {
      baseline = safeCapture();
      if (!baseline) {
        // 覆盖下读不到 SDL 内容，比对不可信，立即撤下
        finish();
        return;
      }
    } else {
      const current = safeCapture();
      if (current && !current.buffer.equals(baseline.buffer)) {
        // 内容相对基线已更新：设备端新画面到达
        finish();
        return;
      }
      if (now() - startedAt >= capMs) {
        finish();
        return;
      }
    }
    timer = scheduleDelay(tick, pollIntervalMs);
  };

  return {
    start() {
      startedAt = now();
      timer = mode === 'diff'
        ? scheduleDelay(tick, baselineDelayMs)
        : scheduleDelay(finish, timedRevealMs);
    },

    cancel() {
      if (timer !== null) {
        cancelDelay(timer);
        timer = null;
      }
      finished = true;
      baseline = null;
    },
  };
}
