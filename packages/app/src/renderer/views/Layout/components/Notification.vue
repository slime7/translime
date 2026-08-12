<template>
  <v-navigation-drawer
    v-model="drawerVisible"
    class="notify-drawer"
    temporary
    location="right"
    width="560"
  >
    <div
      ref="containerRef"
      class="notify-container p-4 h-full flex flex-col"
      v-scroll.self="onAlertContainerScroll"
    >
      <v-spacer />

      <div v-if="!alertList.length">
        <div class="flex justify-center">
          无新通知
        </div>
      </div>

      <div class="flex flex-col">
        <v-alert
          v-for="alertItem in alertList"
          :key="alertItem.uuid"
          :type="alertItem.type"
          border="start"
          class="my-2"
        >
          <div>{{ parseAlertTime(alertItem.time) }}</div>
          <div>{{ alertItem.msg }}</div>
        </v-alert>
      </div>
      <div id="notify-list-bottom" />
    </div>
  </v-navigation-drawer>
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
.notify-container {
  height: 100%;
  overflow-y: auto;
}
</style>
