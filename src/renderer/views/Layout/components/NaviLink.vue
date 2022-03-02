<template>
  <v-hover v-slot="{ hover }">
    <router-link
      v-if="to"
      :to="to"
      custom
      v-slot="{ isExactActive, href }"
    >
      <a class="text-decoration-none d-block ease-animation" :href="href" ref="link">
        <v-avatar
          class="ease-animation"
          size="56"
          :color="hover || isExactActive ? color : 'grey darken-2'"
          :rounded="hover || isExactActive ? 'xl' : 'circle'"
        >
          <v-icon v-if="icon" :color="hover || isExactActive ? 'white' : color">{{ icon }}</v-icon>
          <img v-else-if="image" :src="image" alt="" />
          <div v-else :class="hover || isExactActive ? 'white--text' : textColor">
            <slot></slot>
          </div>
        </v-avatar>

        <v-tooltip
          v-if="tooltip"
          right
          :activator="$refs.link"
        >
          <span>{{ tooltip }}</span>
        </v-tooltip>
      </a>
    </router-link>

    <a
      class="text-decoration-none d-block ease-animation"
      v-else
      ref="open"
      @click="openPluginWindow"
    >
      <v-avatar
        class="ease-animation"
        size="56"
        :color="hover ? color : 'grey darken-2'"
        :rounded="hover ? 'xl' : 'circle'"
      >
        <v-icon v-if="icon" :color="hover ? 'white' : color">{{ icon }}</v-icon>
        <img v-else-if="image" :src="image" alt="" />
        <div v-else :class="hover ? 'white--text' : textColor">
          <slot></slot>
        </div>
      </v-avatar>

      <v-tooltip
        v-if="tooltip"
        right
        :activator="$refs.open"
      >
        <span>{{ tooltip }}</span>
      </v-tooltip>
    </a>
  </v-hover>
</template>

<script>
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';

export default {
  name: 'NaviLink',

  props: {
    to: [Object, String, null, undefined],
    open: [Object, null, undefined],
    color: {
      default: 'primary',
      type: String,
    },
    textColor: {
      default: 'primary--text',
      type: String,
    },
    icon: {
      default: false,
      type: [Boolean, String, null],
    },
    image: {
      default: false,
      type: [Boolean, String, null],
    },
    tooltip: {
      default: '',
      type: String,
    },
  },

  setup(props) {
    const store = useGlobalStore();
    const ipc = useIpc();

    const openPluginWindow = () => {
      const plugin = store.plugin(props.open.id);
      ipc.send(ipcType.OPEN_NEW_WINDOW, {
        name: `plugin-window-${props.open.id}`,
        options: {
          // windowUrl: `file://${this.open.windowUrl}`,
          windowUrl: `plugin-index.html?pluginId=${props.open.id}`,
          appMenu: null,
          frame: false,
          titleBarStyle: 'hidden',
          title: plugin.title,
        },
      });
    };

    return {
      openPluginWindow,
    };
  },
};
</script>
