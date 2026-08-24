<template>
  <v-hover v-slot="{ isHovering, props }">
    <router-link
      v-if="to"
      :to="to"
      custom
      v-slot="{ isExactActive }"
    >
      <div
        class="navi-btn no-underline block ease-animation"
        v-navi="to"
        v-bind="props"
      >
        <v-badge
          :model-value="isDev"
          content="D"
          location="bottom end"
          color="error"
        >
          <v-avatar
            class="ease-animation"
            :class="[isHovering || isExactActive ? 'rounded-3xl' : 'rounded-full']"
            size="56"
            :color="isHovering || isExactActive ? 'primary-container' : 'secondary-container'"
            rounded
          >
            <v-icon v-if="icon" :color="isHovering || isExactActive ? 'on-primary-container' : 'on-secondary-container'">
              {{ icon }}
            </v-icon>
            <img v-else-if="image" :src="image" alt="" width="56">
            <div v-else class="text-nowrap truncate" :class="isHovering || isExactActive ? 'on-primary-container' : 'on-secondary-container'">
              <slot />
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
      class="navi-btn no-underline block ease-animation"
      v-else-if="open"
      v-bind="props"
      @click="openPluginWindow"
    >
      <v-badge
        :model-value="isDev"
        content="D"
        location="bottom end"
        color="error"
      >
        <v-avatar
          class="ease-animation"
          :class="[isHovering ? 'rounded-3xl' : 'rounded-full']"
          size="56"
          :color="isHovering ? 'primary-container' : 'secondary-container'"
          rounded
        >
          <v-icon v-if="icon" :color="isHovering ? 'on-primary-container' : 'on-secondary-container'">
            {{ icon }}
          </v-icon>
          <img v-else-if="image" :src="image" alt="" width="56">
          <div v-else class="text-nowrap truncate" :class="isHovering ? 'on-primary-container' : 'on-secondary-container'">
            <slot />
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
        openPluginWindow(plugin);
      },
    };
  },
};
</script>

<style scoped>
.navi-btn {
  cursor: pointer;
}
</style>
