<template>
  <router-view />
</template>

<script>
import { onMounted } from '@vue/composition-api';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useAlert from '@/hooks/useAlert';
import globalStore from '@/store/globalStore';

export default {
  name: 'App',

  setup() {
    const ipc = useIpc();
    const ipcRaw = useIpc(false);
    const store = globalStore();
    const alert = useAlert();

    const initAppConfig = () => {
      store.initAppConfig();
    };
    const remoteConsoleListener = () => {
      ipc.on('console', ({ type, args }) => {
        // eslint-disable-next-line no-console
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

    // created
    remoteConsoleListener();
    initAppConfig();

    onMounted(() => {
      ipcRaw.send('main-renderer-ready');
      getPlugins();
    });
  },
};
</script>

<style lang="scss">
@import "./assets/fonts/robot/robot.css";
@import "./assets/fonts/noto sans sc/noto_sans_sc.css";
@import "./assets/fonts/source code pro/source_code_pro.css";
@import "./assets/fonts/material icons/material_icons.css";

html {
  overflow-y: auto !important;
}

#app {
  height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  & > .v-dialog__content {
    top: 24px;
  }
}

#app pre {
  font-family: "Source Code Pro", "Noto Sans SC", monospace;
  margin: 0;
  user-select: text;
}

::-webkit-scrollbar {
  width: 16px;
  background-color: #fff;
}

::-webkit-scrollbar-thumb {
  height: 56px;
  border-radius: 8px;
  border: 4px solid transparent;
  background-clip: content-box;
  background-color: #606060;
}

::-webkit-scrollbar-thumb:hover {
  background-color: #606060cc;
}

a {
  -webkit-user-drag: none;
}

.ease-animation {
  transition: all .25s cubic-bezier(.4, 0, .2, 1);
}
</style>
