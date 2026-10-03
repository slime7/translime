/**
 * 自定义存档目录移除后的可选清理：该目录对应的自定义游戏（按名称哈希）在
 * 备份区的全部本地备份与远端备份逐份处理。
 *
 * - 远端删除复用备份区的墓碑机制：原 info.json 在本地删除前读取，
 *   其他端对账时自动跟随删除，不再回补或重新上传；
 * - 全程 best-effort：单份失败记录告警并继续处理剩余份数。
 *
 * @param {object} options
 * @param {string} options.gameId 自定义游戏 ID（hashGameKey(gameName)）
 * @param {boolean} options.deleteBackups 是否删除本地备份
 * @param {boolean} options.deleteRemote 是否删除远端备份（写墓碑）
 * @param {(gameId: string) => Promise<Array<{id: string, path: string}>>} options.listBackups
 * @param {(backup: {path: string}) => Promise<object>} options.readBackupInfo
 * @param {(backup: {path: string}) => Promise<{success: boolean, message?: string}>} options.deleteLocalBackup
 * @param {({gameId: string, dir: string, info: object|null}) => Promise<void>} options.deleteRemoteBackup
 * @returns {Promise<{removedBackups: number, remoteDeleted: boolean, warnings: string[]}>}
 */
const cleanupCustomDirBackups = async ({
  gameId,
  deleteBackups,
  deleteRemote,
  listBackups,
  readBackupInfo,
  deleteLocalBackup,
  deleteRemoteBackup,
}) => {
  if (!deleteBackups && !deleteRemote) {
    return { removedBackups: 0, remoteDeleted: false, warnings: [] };
  }

  const backups = await listBackups(gameId);
  let removedBackups = 0;
  let remoteDeleted = false;
  const warnings = [];

  const processOne = (backup) => async () => {
    // 远端墓碑需保留原备份信息：本地删除前读取
    let info = null;
    if (deleteRemote) {
      try {
        info = await readBackupInfo(backup);
      } catch {
        info = null;
      }
    }

    if (deleteBackups) {
      const result = await deleteLocalBackup(backup);
      if (!result.success) {
        warnings.push(`本地备份删除失败（${backup.id}）：${result.message || '未知错误'}`);
        return;
      }
      removedBackups += 1;
    }

    if (deleteRemote) {
      try {
        await deleteRemoteBackup({ gameId, dir: backup.id, info });
        remoteDeleted = true;
      } catch (e) {
        warnings.push(`远程删除失败（${backup.id}）：${e.message}`);
      }
    }
  };

  // 逐份串行：本地删除与远端墓碑有先后语义（info 先读、本地先删），不并行
  await backups.map(processOne).reduce(
    (chain, next) => chain.then(next),
    Promise.resolve(),
  );

  return { removedBackups, remoteDeleted, warnings };
};

export default cleanupCustomDirBackups;
