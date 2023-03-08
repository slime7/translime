<template>
  <v-navigation-drawer
    v-model="drawerVisible"
    class="notify-drawer"
    absolute
    clipped
    location="right"
    width="560"
  >
    <div class="notify-container pa-4 fill-height d-flex flex-column" v-scroll.self="onAlertContainerScroll">
      <v-spacer />

      <div v-if="!alertList.length">
        <div class="d-flex justify-center">无新通知</div>
      </div>

      <div class="d-flex flex-column">
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
      <div id="notify-list-bottom"></div>
    </div>
  </v-navigation-drawer>
</template>

<script>
import {
  ref,
  watch,
  computed,
} from 'vue';
import { myDate } from '@pkg/share/utils';
import useAlert from '@/hooks/useAlert';

export default {
  name: 'LayoutNotification',

  filters: {
    alertTime(time) {
      return myDate(Math.round(time / 1000), {
        format: '-',
        showTime: true,
        showSecond: true,
      });
    },
  },

  setup() {
    const alert = useAlert();

    const keepBottom = ref(true);
    const scrollToBottom = () => {
      /*
       * go to fun
      root.$vuetify.goTo('#notify-list-bottom', {
        container: '.notify-container',
      });
      */
    };
    const onAlertContainerScroll = (ev) => {
      keepBottom.value = ev.target.scrollTop + ev.target.clientHeight >= ev.target.scrollHeight;
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
          scrollToBottom();
        }
      },
    );

    const parseAlertTime = (time) => myDate(Math.round(time / 1000), {
      format: '-',
      showTime: true,
      showSecond: true,
    });

    return {
      keepBottom,
      alertList,
      drawerVisible,
      onAlertContainerScroll,
      parseAlertTime,
    };
  },
};
</script>

<style scoped lang="scss">
.notify-container {
  height: 100%;
  overflow-y: auto;
}
</style>
