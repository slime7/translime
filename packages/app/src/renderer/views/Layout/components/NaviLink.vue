<template>
  <v-hover v-slot="{ isHovering, props }">
    <router-link
      v-if="to"
      :to="to"
      custom
      v-slot="{ isExactActive }"
    >
      <div
        class="navi-btn text-decoration-none d-block ease-animation"
        v-navi="to"
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
            <div v-else class="text-no-wrap text-truncate" :class="isHovering || isExactActive ? 'white--text' : textColor">
              <slot></slot>
            </div>
          </v-avatar>
        </v-badge>

        <v-tooltip
          v-if="tooltip"
          location="right"
          activator="parent"
        >
          <span>{{ tooltip }}</span>
        </v-tooltip>
      </div>
    </router-link>

    <div
      class="navi-btn text-decoration-none d-block ease-animation"
      v-else-if="open"
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
          <div v-else class="text-no-wrap text-truncate" :class="isHovering ? 'white--text' : textColor">
            <slot></slot>
          </div>
        </v-avatar>
      </v-badge>

      <v-tooltip
        v-if="tooltip"
        location="right"
        activator="parent"
      >
        <span>{{ tooltip }}</span>
      </v-tooltip>
    </div>
  </v-hover>
</template>

<script>
import useGlobalStore from '@/store/globalStore';
import { openPluginWindow } from '@/utils';

export default {
  name: 'NaviLink',

  props: {
    to: [Object, String, null, undefined],
    open: [String, null, undefined],
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

    return {
      openPluginWindow: () => {
        const plugin = store.plugin(props.open);
        openPluginWindow(plugin, store.dark, store.appSetting);
      },
    };
  },
};
</script>

<style lang="scss" scoped>
.transition-radius {
  transition-property: border-radius;
}

.navi-btn {
  cursor: pointer;
}
</style>
