<template>
  <v-app>
    <v-system-bar class="system-bar p-0" v-if="!appSetting.useNativeTitleBar && !isEmbedded">
      <div class="px-4">
        {{ plugin ? `${plugin.title} - translime` : 'translime' }}
      </div>

      <v-spacer />

      <window-controls
        :is-maximize="isMaximize"
        :win="`plugin-window-${packageName}`"
        @window-maximize="getIsMaximize"
        @window-unmaximize="getIsMaximize"
      />
    </v-system-bar>

    <v-main class="h-screen">
      <div class="flex flex-col h-full" id="app-main-container">
        <div class="scroll-content flex-auto">
          <router-view v-slot="{ Component, route }">
            <v-fade-transition
              mode="out-in"
              @after-enter="onEnter"
              @before-leave="onLeave"
            >
              <component :is="Component" :key="route.path" />
            </v-fade-transition>
          </router-view>
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<script>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue';
import { useRoute } from 'vue-router';
import * as components from 'vuetify/components';
import * as labsComponents from 'vuetify/labs/components';
import * as directives from 'vuetify/directives';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import WindowControls from '@/components/WindowControls.vue';
import { useIpc } from '@/hooks/electron';
import globalStore from '@/store/globalStore';

if (!window.vuetify$) {
  window.vuetify$ = {
    components: {
      ...components,
      ...labsComponents,
    },
    directives,
  };
}

export default {
  name: 'LayoutPluginWindow',

  components: {
    WindowControls,
  },

  setup() {
    const route = useRoute();
    const ipc = useIpc();
    const store = globalStore();

    const packageName = computed(() => route.params.packageName);
    const plugin = computed(() => store.plugin(packageName.value));
    const isMaximize = ref(false);
    const appSetting = computed(() => store.appSetting);
    const isEmbedded = computed(() => route.query.embedded === 'true');

    const onMaximizeStatusChange = () => {
      ipc.on(`set-maximize-status:plugin-window-${packageName.value}`, (maximize) => {
        isMaximize.value = maximize;
      });
    };

    const getIsMaximize = async () => {
      isMaximize.value = await ipc.invoke(ipcType.APP_IS_MAXIMIZE, `plugin-window-${packageName.value}`);
    };

    watch(() => appSetting.value.useNativeTitleBar, (useNative) => {
      if (useNative) {
        document.body.className = '';
      } else {
        document.body.className = 'custom-title-bar';
      }
    }, { immediate: true });

    const onEnter = () => {
      nextTick(() => {
        store.pageTransitionActive = false;
      });
    };
    const onLeave = () => {
      store.pageTransitionActive = true;
    };

    onMounted(() => {
      onMaximizeStatusChange();
      getIsMaximize();
      store.pageTransitionActive = false;
    });

    onUnmounted(() => {
      ipc.detach(`set-maximize-status:plugin-window-${packageName.value}`);
      store.pageTransitionActive = false;
    });

    return {
      packageName,
      plugin,
      isMaximize,
      getIsMaximize,
      appSetting,
      onEnter,
      onLeave,
      isEmbedded,
    };
  },
};
</script>

<style scoped lang="scss">
.system-bar {
  -webkit-app-region: drag;
  z-index: 300;
}

#app-main-container > .scroll-content {
  min-height: 0;
  overflow-y: auto;

  &::-webkit-scrollbar {
    background-color: transparent;
  }
}
</style>
