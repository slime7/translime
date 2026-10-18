<template>
  <router-view />
  <!-- 全局宿主菜单：插件上下文菜单与文本编辑菜单统一由主进程描述驱动 -->
  <host-menu />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import useTheme from '@/hooks/useTheme';
import { useIpc } from '@/hooks/electron';
import useAlert from '@/hooks/useAlert';
import useToast from '@/hooks/useToast';
import globalStore from '@/store/globalStore';
import useUpdateStore from '@/store/updateStore';
import HostMenu from '@/components/HostMenu.vue';
import checkPluginUpdates from '@/views/plugins/hooks/usePluginUpdateCheck';
import { appConfigStore } from '@/utils';
import waitForCriticalFonts from '@/utils/fonts';
import {
  getDefaultThemeColor,
  normalizeThemeColor,
} from '@/utils/themeColorConfig';

const ipc = useIpc();
const ipcRaw = useIpc(false);
const store = globalStore();
const updateStore = useUpdateStore();
const theme = useTheme();
const alert = useAlert();
const toast = useToast();
const router = useRouter();
const route = useRoute();

const initAppConfig = () => {
  store.initAppConfig();
};
const remoteConsoleListener = () => {
  ipc.on('console', ({ type, args }) => {

    console[type](...args);
  });
};
const getPlugins = async () => {
  try {
    const plugins = await ipc.invoke(ipcType.GET_PLUGINS);
    store.setPlugins(plugins);
  } catch (err) {
    alert.show(err.message, 'error');
  }
};
// 启动列表就绪后检查已安装插件的市场版本，升级提示不依赖进入插件中心的第二次拉取
const initialLoad = async () => {
  await getPlugins();
  checkPluginUpdates();
};
const syncOverlayColor = () => {
  const win = route.name === 'PluginWindow' ? `plugin-window-${route.params.packageName}` : 'app';
  theme.syncOverlayColor(win);
};
const getTheme = async () => {
  theme.setTheme(await appConfigStore.get('setting.theme', 'system'));
  const { shouldUseDarkColors: dark } = await theme.getNativeTheme();
  theme.setDark(dark);
  syncOverlayColor();
};
/**
 * 读取设置中的主题配色并应用
 * 如果配色名是 'system'，则先用系统取色替换源色再交给 mde-vue 主题控制器生成令牌
 */
const getThemeColors = async () => {
  const storedThemeColor = await appConfigStore.get('setting.themeColor', getDefaultThemeColor());
  const themeColor = normalizeThemeColor(storedThemeColor);
  let appliedThemeColor = themeColor;
  if (themeColor.name === 'system') {
    const systemColor = await ipc.invoke(ipcType.GET_SYSTEM_COLOR);
    if (systemColor) {
      appliedThemeColor = { ...themeColor, source: systemColor };
    }
  }
  theme.syncMatTheme(appliedThemeColor);
  syncOverlayColor();
};
const themeUpdated = () => {
  ipc.on(ipcType.THEME_UPDATED, ({ dark }) => {
    theme.setDark(dark);
    getThemeColors();
  });
  ipc.on(ipcType.THEME_COLOR_UPDATED, () => {
    getThemeColors();
  });
};
const handleKeyEvent = () => {
  window.addEventListener('keyup', (ev) => {
    if (ev.key === 'F12' || (ev.key === 'I' && !ev.altKey && ev.ctrlKey && ev.shiftKey)) {
      ipc.send(ipcType.DEVTOOLS);
    }
  });
};
const handleAppArgv = async () => {
  const argv = await ipc.invoke(ipcType.GET_LAUNCH_ARGV);
  store.setAppArgv(argv);
};
const onShowSettingPanel = () => {
  ipc.on(ipcType.OPEN_PLUGIN_SETTING_PANEL, ({ packageName }) => {
    router.replace({
      name: 'PluginCenter',
      query: { setting: packageName, t: +(new Date()) },
    });
  });
};
const offShowSettingPanel = () => {
  ipc.detach(ipcType.OPEN_PLUGIN_SETTING_PANEL);
};
const onUpdatePlugins = () => {
  ipc.on(ipcType.PLUGINS_CHANGED, () => {
    getPlugins();
  });
};
const offUpdatePlugins = () => {
  ipc.detach(ipcType.PLUGINS_CHANGED);
};
const onTitleBarActionsChanged = () => {
  // 插件动态声明的顶栏按钮变化：全量映射按插件合并进插件列表，按钮区组件即时反映
  ipc.on(ipcType.TITLE_BAR_ACTIONS_CHANGED, (itemsByPlugin) => {
    Object.entries(itemsByPlugin || {}).forEach(([packageName, items]) => {
      store.updatePlugin(packageName, { titleBarItems: items || [] });
    });
  });
};
const offTitleBarActionsChanged = () => {
  ipc.detach(ipcType.TITLE_BAR_ACTIONS_CHANGED);
};
const onDeepLink = () => {
  ipc.on(ipcType.DEEP_LINK_OPEN, (params) => {
    if (params.install?.startsWith('translime-plugin-')) {
      // 安装插件
      router.replace({
        name: 'PluginCenter',
        query: { install: params.install, t: +(new Date()) },
      });
    }
  });
};
const offDeepLink = () => {
  ipc.detach(ipcType.DEEP_LINK_OPEN);
};
const onIpcToast = () => {
  ipc.on(ipcType.IPC_TOAST, (args) => {
    toast.show(...args);
  });
};
const offIpcToast = () => {
  ipc.detach(ipcType.IPC_TOAST);
};

// created
remoteConsoleListener();
initAppConfig();
themeUpdated();
getTheme();
handleKeyEvent();
handleAppArgv();

onMounted(async () => {
  await router.isReady();
  const isMainWindowRoute = route.name !== 'PluginWindow' && route.name !== 'PluginRender';
  if (isMainWindowRoute) {
    // 首屏图标字体就绪后通知主进程展示主窗口
    await waitForCriticalFonts();
    ipcRaw.send('main-renderer-ready');
    // 升级提示依赖市场版本数据，主窗口启动拉取后立即检查，不等页面二次进入
    initialLoad();
    // 更新事件只投递主窗口：全局注册后关于页角标不依赖关于页是否打开过
    updateStore.initListeners();
  } else {
    getPlugins();
  }
  onUpdatePlugins();
  onTitleBarActionsChanged();
  onShowSettingPanel();
  onDeepLink();
  onIpcToast();
  getThemeColors();
});

onUnmounted(() => {
  offUpdatePlugins();
  offTitleBarActionsChanged();
  offShowSettingPanel();
  offDeepLink();
  offIpcToast();
  ipc.detach(ipcType.THEME_COLOR_UPDATED);
});
</script>
