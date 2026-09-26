<template>
  <router-link
    v-if="to"
    :to="to"
    custom
    v-slot="{ isExactActive }"
  >
    <mat-tooltip
      v-if="tooltip"
      :content="tooltip"
      location="right"
    >
      <template #activator>
        <div
          class="navi-btn no-underline block ease-animation"
          :data-test="dataTest"
          v-navi="to"
        >
          <mat-badge
            v-if="isDev"
            content="D"
            location="bottom-end"
            :offset="{ inline: 12, block: -2 }"
            color="error"
          >
            <div
              class="navi-avatar flex items-center justify-center size-14 overflow-hidden"
              :class="isExactActive ? 'navi-avatar--active' : 'navi-avatar--round'"
            >
              <mat-icon
                v-if="icon"
                class="text-2xl"
              >
                {{ icon }}
              </mat-icon>
              <img v-else-if="image" :src="image" alt="" width="56">
              <div
                v-else
                class="text-nowrap truncate"
              >
                <slot />
              </div>
            </div>
          </mat-badge>
          <div
            v-else
            class="navi-avatar flex items-center justify-center size-14 overflow-hidden"
            :class="isExactActive ? 'navi-avatar--active' : 'navi-avatar--round'"
          >
            <mat-icon
              v-if="icon"
              class="text-2xl"
            >
              {{ icon }}
            </mat-icon>
            <img v-else-if="image" :src="image" alt="" width="56">
            <div
              v-else
              class="text-nowrap truncate"
            >
              <slot />
            </div>
          </div>
        </div>
      </template>
    </mat-tooltip>

    <div
      v-else
      class="navi-btn no-underline block ease-animation"
      :data-test="dataTest"
      v-navi="to"
    >
      <mat-badge
        v-if="isDev"
        content="D"
        location="bottom-end"
        :offset="{ inline: 12, block: -2 }"
        color="error"
      >
        <div
          class="navi-avatar flex items-center justify-center size-14 overflow-hidden"
          :class="isExactActive ? 'navi-avatar--active' : 'navi-avatar--round'"
        >
          <mat-icon
            v-if="icon"
            class="text-2xl"
          >
            {{ icon }}
          </mat-icon>
          <img v-else-if="image" :src="image" alt="" width="56">
          <div
            v-else
            class="text-nowrap truncate"
          >
            <slot />
          </div>
        </div>
      </mat-badge>
      <div
        v-else
        class="navi-avatar flex items-center justify-center size-14 overflow-hidden"
        :class="isExactActive ? 'navi-avatar--active' : 'navi-avatar--round'"
      >
        <mat-icon
          v-if="icon"
          class="text-2xl"
        >
          {{ icon }}
        </mat-icon>
        <img v-else-if="image" :src="image" alt="" width="56">
        <div
          v-else
          class="text-nowrap truncate"
        >
          <slot />
        </div>
      </div>
    </div>
  </router-link>

  <mat-tooltip
    v-else-if="open && tooltip"
    :content="tooltip"
    location="right"
  >
    <template #activator>
      <div
        class="navi-btn no-underline block ease-animation"
        :data-test="dataTest"
        @click="openPluginWindow"
      >
        <mat-badge
          v-if="isDev"
          content="D"
          location="bottom-end"
          :offset="{ inline: 12, block: -2 }"
          color="error"
        >
          <div class="navi-avatar flex items-center justify-center size-14 overflow-hidden navi-avatar--round">
            <mat-icon
              v-if="icon"
              class="text-2xl"
            >
              {{ icon }}
            </mat-icon>
            <img v-else-if="image" :src="image" alt="" width="56">
            <div
              v-else
              class="text-nowrap truncate"
            >
              <slot />
            </div>
          </div>
        </mat-badge>
        <div
          v-else
          class="navi-avatar flex items-center justify-center size-14 overflow-hidden navi-avatar--round"
        >
          <mat-icon
            v-if="icon"
            class="text-2xl"
          >
            {{ icon }}
          </mat-icon>
          <img v-else-if="image" :src="image" alt="" width="56">
          <div
            v-else
            class="text-nowrap truncate"
          >
            <slot />
          </div>
        </div>
      </div>
    </template>
  </mat-tooltip>

  <div
    v-else-if="open"
    class="navi-btn no-underline block ease-animation"
    :data-test="dataTest"
    @click="openPluginWindow"
  >
    <mat-badge
      v-if="isDev"
      content="D"
      location="bottom-end"
      :offset="{ inline: 12, block: -2 }"
      color="error"
    >
      <div class="navi-avatar flex items-center justify-center size-14 overflow-hidden navi-avatar--round">
        <mat-icon
          v-if="icon"
          class="text-2xl"
        >
          {{ icon }}
        </mat-icon>
        <img v-else-if="image" :src="image" alt="" width="56">
        <div
          v-else
          class="text-nowrap truncate"
        >
          <slot />
        </div>
      </div>
    </mat-badge>
    <div
      v-else
      class="navi-avatar flex items-center justify-center size-14 overflow-hidden navi-avatar--round"
    >
      <mat-icon
        v-if="icon"
        class="text-2xl"
      >
        {{ icon }}
      </mat-icon>
      <img v-else-if="image" :src="image" alt="" width="56">
      <div
        v-else
        class="text-nowrap truncate"
      >
        <slot />
      </div>
    </div>
  </div>
</template>

<script>
import useGlobalStore from '@/store/globalStore';
import { openPluginWindow } from '@/utils';

export default {
  name: 'NaviLink',

  props: {
    to: {
      type: [Object, String, null],
      default: null,
    },
    open: {
      type: [String, null],
      default: null,
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
    dataTest: {
      default: '',
      type: String,
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
  cursor: default;
}

/*
 * hover 形变走纯 CSS（.navi-btn:hover），不经过 Vue 响应式；
 * mat-icon 与文字经 currentColor 跟随容器色，无需 JS 切换类
 */
.navi-avatar {
  cursor: inherit;
  color: var(--mat-sys-color-on-secondary-container);
  background-color: var(--mat-sys-color-secondary-container);
  transition:
    border-radius .25s cubic-bezier(.4, 0, .2, 1),
    background-color .25s cubic-bezier(.4, 0, .2, 1),
    color .25s cubic-bezier(.4, 0, .2, 1);
}

.navi-avatar--round {
  border-radius: var(--mat-sys-shape-corner-full);
}

.navi-avatar--active,
.navi-btn:hover .navi-avatar--round {
  /* 24px：28px（extra-large）在 56px 图标上恰为正圆会失去形变，24 是可见形变的上限 */
  border-radius: 24px;
  background-color: var(--mat-sys-color-primary-container);
  color: var(--mat-sys-color-on-primary-container);
}
</style>
