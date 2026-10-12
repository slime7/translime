/**
 * 直通条目对账计划（纯函数）。
 *
 * 基于远端元数据、本地状态、同步水位与文件清单，判定条目对账动作。
 *
 * @param {object} input
 * @param {object|null} input.remoteMeta 远端元数据（null 表示远端无此条目）
 * @param {boolean} input.localExists 本地存档目录是否存在
 * @param {boolean} input.localChanged 本地自上次同步后是否有变更
 * @param {number|null} input.localNewestMtime 本地最新文件的修改时间戳（毫秒）
 * @param {string|null} [input.watermark] 本机上次同步水位（ISO 时间字符串）
 * @param {boolean} [input.remoteHasData] 远端是否存在数据包 data.zip
 * @returns {{
 *   action: 'sync-upload'|'sync-download'|'noop'|'apply-deletion'|'deletion-conflict'|'content-conflict'|'local-missing',
 * }}
 */
// 远端无数据包时转为上传，以本地内容重建远端
const decideDownloadWinner = ({ remoteHasData }) => (
  remoteHasData ? { action: 'sync-download' } : { action: 'sync-upload' }
);

const planPassthroughEntry = ({
  remoteMeta,
  localExists,
  localChanged,
  localNewestMtime,
  watermark = null,
  remoteHasData = false,
}) => {
  if (remoteMeta?.deleted) {
    if (!localExists) {
      return { action: 'noop' };
    }
    const deletedAtMs = Date.parse(remoteMeta.deletedAt || '');
    if (Number.isNaN(deletedAtMs)
      || (localNewestMtime != null && localNewestMtime > deletedAtMs)) {
      return { action: 'deletion-conflict' };
    }
    return { action: 'apply-deletion' };
  }
  if (!localExists) {
    return { action: 'local-missing' };
  }
  if (!remoteMeta) {
    // 远端无条目时新建上传
    return { action: 'sync-upload' };
  }

  const remoteUpdatedAtMs = Date.parse(remoteMeta.updatedAt || '');
  const watermarkMs = Date.parse(watermark || '');
  const baselineKnown = !Number.isNaN(watermarkMs);
  // 基线未知或远端时间无效时视为有变更
  const remoteChanged = !baselineKnown || Number.isNaN(remoteUpdatedAtMs)
    || remoteUpdatedAtMs > watermarkMs;

  if (!localChanged && !remoteChanged) {
    return { action: 'noop' };
  }
  if (localChanged && !remoteChanged) {
    return { action: 'sync-upload' };
  }
  if (!localChanged && remoteChanged) {
    return decideDownloadWinner({ remoteHasData });
  }
  // 双端均有变更时：有基线转冲突确认，无基线按时间戳比较决定方向
  if (baselineKnown) {
    if (!remoteHasData) {
      return { action: 'sync-upload' };
    }
    return { action: 'content-conflict' };
  }
  const localNewer = localNewestMtime != null
    && !Number.isNaN(remoteUpdatedAtMs)
    && localNewestMtime > remoteUpdatedAtMs;
  if (!localNewer) {
    return decideDownloadWinner({ remoteHasData });
  }
  return { action: 'sync-upload' };
};

export default planPassthroughEntry;
