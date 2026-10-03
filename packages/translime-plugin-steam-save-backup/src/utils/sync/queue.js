/**
 * 串行同步队列：同步仅在用户手动触发时执行；
 * - 同一时刻只执行一次同步，运行期间的再次触发排队，结束后补跑
 * - 手动触发的失败不自动重试，由 run 落入持久状态（lastError）交给 UI 展示
 */

const createSyncQueue = ({
  run,
  canRun = () => true,
} = {}) => {
  let running = false;
  let pending = false;

  const getState = () => ({
    running,
    pending,
  });

  const execute = async () => {
    running = true;
    try {
      await run();
    } catch {
      // 失败信息由 run 写入持久状态，这里不再安排自动重试
    }
    running = false;

    if (pending) {
      pending = false;
      await execute();
    }
  };

  const trigger = () => {
    if (!canRun()) {
      return 'ignored';
    }
    if (running) {
      pending = true;
      return 'queued';
    }
    execute();
    return 'started';
  };

  return {
    trigger,
    getState,
  };
};

export default createSyncQueue;
