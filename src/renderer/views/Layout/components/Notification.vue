<template>
  <v-navigation-drawer
    v-model="drawerVisible"
    class="notify-drawer"
    absolute
    clipped
    right
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
          border="left"
        >
          <div>{{ alertItem.time | alertTime }}</div>
          <div>{{ alertItem.msg }}</div>
        </v-alert>
      </div>
      <div id="notify-list-bottom"></div>
    </div>
  </v-navigation-drawer>
</template>

<script>
import { myDate } from '@pkg/share/utils';

export default {
  name: 'LayoutNotification',

  data: () => ({
    keepBottom: true,
  }),

  computed: {
    drawerVisible: {
      get() {
        return this.$store.state.alert.drawerVisible;
      },
      set(value) {
        this.$store.commit('alert/setDrawerVisible', value);
      },
    },
    alertList() {
      return this.$store.state.alert.contents;
    },
  },

  methods: {
    scrollToBottom() {
      this.$vuetify.goTo('#notify-list-bottom', {
        container: '.notify-container',
      });
    },
    onAlertContainerScroll(ev) {
      console.log(ev.target.scrollTop, ev.target.clientHeight, ev.target.scrollHeight, ev.target.scrollTop + ev.target.clientHeight >= ev.target.scrollHeight);
      this.keepBottom = ev.target.scrollTop + ev.target.clientHeight >= ev.target.scrollHeight;
    },
  },

  watch: {
    drawerVisible(value) {
      if (value && this.keepBottom) {
        this.scrollToBottom();
      }
    },
  },

  filters: {
    alertTime(time) {
      return myDate(Math.round(time / 1000), {
        format: '-',
        showTime: true,
        showSecond: true,
      });
    },
  },
};
</script>

<style scoped lang="scss">
.notify-container {
  height: 100%;
  overflow-y: auto;
}
</style>
