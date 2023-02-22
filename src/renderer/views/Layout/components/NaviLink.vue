<template>
  <v-hover v-slot="{ isHovering, props }">
    <router-link
      v-if="to"
      :to="to"
      custom
      v-slot="{ isExactActive, href }"
    >
      <a
        class="navi-btn text-decoration-none d-block ease-animation"
        :href="href"
        ref="link"
        v-bind="props"
      >
        <v-badge
          :model-value="isDev"
          content="D"
          location="bottom end"
          color="primary"
        >
          <v-avatar
            class="transition-radius"
            size="56"
            :color="isHovering || isExactActive ? color : 'grey-darken-2'"
            :rounded="isHovering || isExactActive ? 'xl' : 'circle'"
          >
            <v-icon v-if="icon" :color="isHovering || isExactActive ? 'white' : color">{{ icon }}</v-icon>
            <img v-else-if="image" :src="image" alt="" width="56" />
            <div v-else :class="isHovering || isExactActive ? 'white--text' : textColor">
              <slot></slot>
            </div>
          </v-avatar>
        </v-badge>

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
      class="navi-btn text-decoration-none d-block ease-animation"
      v-else
      ref="open"
      v-bind="props"
      @click="openPluginWindow"
    >
      <v-badge
        :model-value="isDev"
        content="D"
        location="bottom end"
        color="primary"
      >
        <v-avatar
          class="transition-radius"
          size="56"
          :color="isHovering ? color : 'grey-darken-2'"
          :rounded="isHovering ? 'xl' : 'circle'"
        >
          <v-icon v-if="icon" :color="isHovering ? 'white' : color">{{ icon }}</v-icon>
          <img v-else-if="image" :src="image" alt="" width="56" />
          <div v-else :class="isHovering ? 'white--text' : textColor">
            <slot></slot>
          </div>
        </v-avatar>
      </v-badge>

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
    isDev: {
      default: false,
      type: Boolean,
    },
  },

  setup(props) {
    const store = useGlobalStore();
    const ipc = useIpc();

    const openPluginWindow = () => {
      const plugin = store.plugin(props.open.id);
      const url = props.open.windowUrl
        ? props.open.windowUrl
        : `plugin-index.html?pluginId=${props.open.id}&dark=${store.dark}`;
      const options = JSON.parse(JSON.stringify(props.open.options));
      delete options.windowUrl;
      if (process.env.NODE_ENV === 'development') {
        console.log('plugin window url: ', url);
        console.log('plugin window options: ', options);
      }
      ipc.send(ipcType.OPEN_NEW_WINDOW, {
        name: `plugin-window-${props.open.id}`,
        options: {
          windowUrl: url,
          appMenu: null,
          frame: false,
          titleBarStyle: 'hidden',
          title: plugin.title,
          ...options,
        },
      });
    };

    return {
      openPluginWindow,
    };
  },
};
</script>

<style lang="scss" scoped>
.transition-radius {
  transition-property: border-radius;
}
</style>
