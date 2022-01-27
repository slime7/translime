<template>
  <v-navigation-drawer
    app
    permanent
    width="72px"
  >
    <div class="navi-panel pa-2">
      <navi-link
        :to="{ name: 'Home' }"
        icon="home"
      ></navi-link>

      <navi-link
        :to="{ name: 'Plugins' }"
      >
        插件
      </navi-link>

      <navi-link
        :to="{ name: 'About' }"
      >
        关于
      </navi-link>
    </div>
  </v-navigation-drawer>
</template>

<script>
import NaviLink from '@/views/Layout/components/NaviLink.vue';

export default {
  name: 'Navigation',

  components: {
    NaviLink,
  },
};
</script>

<style scoped lang="scss">
.navi-panel > * + * {
  margin-top: 8px;
}
</style>
