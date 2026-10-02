/**
 * 已登记游戏的云存档配置注册表（存于插件配置 settings.knownGames）：
 * 扫描时把 Steam 游戏的云存档配置（savePaths，来自 remotecache.vdf 的云存档结构）
 * 登记一份；游戏卸载后扫描不到，但凭登记条目仍可列出并管理其存档备份
 * （还原 / 删除 / 同步），已安装游戏的实时扫描配置始终优先。
 */

/**
 * 把扫描结果合并进注册表，返回新注册表（不修改入参）。
 * 自定义游戏（非 Steam appid）不登记——其目录配置本就存放在 customSaveDirs。
 */
export const upsertKnownGames = (knownGames, scannedGames) => ({
  ...knownGames,
  ...Object.fromEntries(scannedGames
    .filter((game) => !game.isCustom)
    .map((game) => [String(game.appid), {
      appid: String(game.appid),
      name: game.name,
      savePaths: game.savePaths,
    }])),
});

/**
 * 列出“幽灵游戏”：已登记、不在本次扫描结果中（已卸载）、且本地仍有备份的条目。
 * saveSources 置空——卸载后不支持新增备份，仅保留还原 / 删除 / 同步管理能力。
 *
 * @param {Object} knownGames 注册表（appid → { appid, name, savePaths }）
 * @param {Array} scannedGames 本次扫描到的游戏
 * @param {(appid: string, backupRoot?: string) => Promise<number>} getBackupCount 本地备份数查询
 * @param {string} backupRoot 备份根目录
 */
export const listGhostGames = async (knownGames, scannedGames, getBackupCount, backupRoot) => {
  const scannedAppIds = new Set(scannedGames.map((game) => String(game.appid)));
  const ghosts = await Promise.all(Object.values(knownGames || {})
    .filter((entry) => entry && !scannedAppIds.has(String(entry.appid)))
    .map(async (entry) => {
      const appid = String(entry.appid);
      const backupCount = await getBackupCount(appid, backupRoot);
      if (!(backupCount > 0)) {
        // 无备份可管理的条目不展示，避免列表被历史条目刷屏
        return null;
      }
      return {
        appid,
        name: entry.name,
        uninstalled: true,
        installDir: null,
        libraryPath: null,
        savePaths: Array.isArray(entry.savePaths) ? entry.savePaths : [],
        saveSources: [],
        backupCount,
      };
    }));
  return ghosts.filter(Boolean);
};
