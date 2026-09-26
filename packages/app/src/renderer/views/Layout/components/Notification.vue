<template>
  <transition name="notify-slide">
    <div
      v-if="drawerVisible"
      class="notify-drawer absolute inset-0 z-40"
      role="dialog"
      aria-label="通知栏"
    >
      <div class="notify-scrim absolute inset-0 bg-scrim/40" @click="drawerVisible = false" />

      <div
        ref="containerRef"
        class="notify-container absolute inset-y-0 right-0 w-[560px] max-w-full p-4 flex flex-col overflow-y-auto bg-surface-container-lowest text-on-surface"
        @scroll="onAlertContainerScroll"
      >
        <div class="grow" />

        <div v-if="!alertList.length">
          <div class="flex justify-center">
            无新通知
          </div>
        </div>

        <div class="flex flex-col">
          <div
            v-for="alertItem in alertList"
            :key="alertItem.uuid"
            class="my-2 px-4 py-3 rounded-lg border-l-4"
            :class="alertItem.type === 'error'
              ? 'bg-error-container text-on-error-container border-error'
              : 'bg-secondary-container text-on-secondary-container border-secondary'"
          >
            <div>{{ parseAlertTime(alertItem.time) }}</div>
            <div>{{ alertItem.msg }}</div>
          </div>
        </div>
        <div id="notify-list-bottom" />
      </div>
    </div>
  </transition>
</template>

<script>
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue';
import dayjs from 'dayjs';
import useAlert from '@/hooks/useAlert';

export default {
  name: 'LayoutNotification',

  filters: {
    alertTime(time) {
      return dayjs(time).format('YYYY-MM-DD HH:mm:ss');
    },
  },

  setup() {
    const alert = useAlert();

    const containerRef = ref(null);
    const keepBottom = ref(true);
    const scrollToBottom = () => {
      const container = containerRef.value;
      if (!container) {
        return;
      }
      container.scrollTop = container.scrollHeight;
      keepBottom.value = true;
    };
    const onAlertContainerScroll = (ev) => {
      keepBottom.value = ev.target.scrollTop + ev.target.clientHeight >= ev.target.scrollHeight - 8;
    };
    const alertList = alert.list;
    const onDrawerVisibleChange = (value) => {
      if (value) {
        alert.showDrawer();
      } else {
        alert.hideDrawer();
      }
    };
    const drawerVisible = computed({
      get() {
        return alert.drawerVisible.value;
      },
      set(value) {
        onDrawerVisibleChange(value);
      },
    });
    watch(
      () => alert.drawerVisible.value,
      (value) => {
        if (value && keepBottom.value) {
          nextTick(scrollToBottom);
        }
      },
    );
    watch(
      () => alertList.length,
      () => {
        if (alert.drawerVisible.value && keepBottom.value) {
          nextTick(scrollToBottom);
        }
      },
    );

    const parseAlertTime = (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss');

    return {
      containerRef,
      keepBottom,
      alertList,
      drawerVisible,
      onAlertContainerScroll,
      parseAlertTime,
    };
  },
};
</script>

<style scoped>
.notify-scrim {
  backdrop-filter: blur(2px);
}

.notify-container {
  box-shadow: var(--mat-sys-elevation-level3);
}

.notify-slide-enter-active,
.notify-slide-leave-active {
  transition: opacity .2s cubic-bezier(.4, 0, .2, 1);
}

.notify-slide-enter-active .notify-container,
.notify-slide-leave-active .notify-container {
  transition: transform .25s cubic-bezier(0, 0, 0, 1);
}

.notify-slide-enter-from,
.notify-slide-leave-to {
  opacity: 0;
}

.notify-slide-enter-from .notify-container,
.notify-slide-leave-to .notify-container {
  transform: translateX(100%);
}
</style>
