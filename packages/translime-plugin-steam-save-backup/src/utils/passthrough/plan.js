/**
 * 直通条目对账计划（纯函数）。
 *
 * @param {object} input
 * @param {object|null} input.remoteMeta 远端 meta（null 表示远端尚无此条目）
 * @param {boolean} input.localExists 本地存档目录是否存在
 * @param {number|null} input.localNewestMtime 本地最新文件的 mtime（毫秒；目录为空时为 null）
 * @returns {{
 *   action: 'sync'|'apply-deletion'|'deletion-conflict'|'local-missing'|'noop',
 * }}
 * - sync：两端都在 → 双向增量（较新者胜）
 * - apply-deletion：远端已删除且本地在删除时间点后无更新 → 自动删除本地
 * - deletion-conflict：远端已删除但本地在删除后仍有更新 → 转冲突待用户确认
 * - local-missing：本地目录缺失 → 不自动回补（避免与用户删除动作对抗），由用户选择
 * - noop：远端已删除且本地也没有 → 只保留远端墓碑，防止其他端复活
 */
const planPassthroughEntry = ({ remoteMeta, localExists, localNewestMtime }) => {
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
  return { action: 'sync' };
};

export default planPassthroughEntry;
