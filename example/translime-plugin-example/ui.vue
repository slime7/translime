<template>
  <div>
    <div class="plugin-main">plugin content {{ msg }}</div>

    <div>
      <input v-model="input" />
    </div>

    <pre>{{ setting }}</pre>

    <v-btn>vuetify component</v-btn>
  </div>
</template>

<script>
export default {
  name: 'ui',

  data: () => ({
    msg: 'hello',
    input: '',
    setting: null,
  }),

  methods: {
    async readSetting() {
      this.setting = await window.getPluginSetting('translime-plugin-example');
    },
  },

  mounted() {
    this.readSetting();
  },
};
</script>

<style scoped>
.plugin-main {
  color: red;
}
</style>
