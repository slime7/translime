<template>
  <v-container fluid>
    <pre>{{ plugin.main }}</pre>

    <v-btn @click="parsePluginMain(plugin.main)">compile</v-btn>
  </v-container>
</template>

<script>
import Vue from 'vue';
import { parse } from '@vue/compiler-sfc';

export default {
  name: 'PluginPage',

  computed: {
    plugin() {
      return this.$store.state.plugins[this.$store.state.plugins.findIndex((p) => p.packageName === this.$route.params.packageName)];
    },
  },

  methods: {
    parsePluginMain() {
      const sfc = parse(this.plugin.main, {
        filename: `${this.plugin.packageName}.main.vue`,
      });
      console.log(sfc);
      const component = new Vue({
        render: (h) => h(sfc.descriptor),
      });
      console.log(component);
    },
  },
};
</script>
