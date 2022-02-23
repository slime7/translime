<template>
  <v-navigation-drawer
    v-model="drawerVisible"
    class="notify-drawer"
    absolute
    clipped
    right
    width="560"
  >
    <div class="pa-4" v-if="!alertList.length">
      <div class="d-flex justify-center">无新通知</div>
    </div>
    <div class="notify-container pa-4 d-flex flex-column-reverse" v-else>
      <v-alert
        v-for="alertItem in alertList"
        :key="alertItem.uuid"
        :type="alertItem.type"
        border="left"
      >
        {{ alertItem.msg }}
      </v-alert>
    </div>
    <div id="notify-list-bottom"></div>
  </v-navigation-drawer>
</template>

<script>
export default {
  name: 'LayoutNotification',

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
};
</script>

<style scoped lang="scss">
.notify-container {
  height: 100%;
  overflow-y: auto;
}
</style>
