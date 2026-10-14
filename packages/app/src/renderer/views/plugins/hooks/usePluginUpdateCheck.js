import useGlobalStore from '@/store/globalStore';
import { getPluginDetail, parseSearchResult } from './usePluginCenterSearch';

/**
 * 检查已安装插件的市场版本：把各插件的版本列表合并进 store，
 * 已安装卡片的升级入口与版本信息依赖该数据。
 * 启动拉取与插件中心页内的列表刷新都需要调用，保证升级提示不依赖页面切换。
 */
const checkPluginUpdates = async () => {
  const store = useGlobalStore();
  // 对所有非 dev 插件进行更新检查
  store.plugins.forEach(async (p) => {
    if (p.dev) {
      return;
    }
    try {
      const detail = await getPluginDetail(p.packageName);
      if (detail) {
        const searchItem = parseSearchResult(detail);
        store.updatePlugin(p.packageName, {
          versions: searchItem.versions,
        });
      }
    } catch (err) {
      // 单个检查失败不影响整体
      // eslint-disable-next-line no-console
      console.error(`Check update failed for ${p.packageName}`, err);
    }
  });
};

export default checkPluginUpdates;
