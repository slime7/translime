<template>
  <div>
    <div class="plugin-main">plugin content {{ msg }}</div>

    <div>
      <input v-model="input" />
    </div>

    <pre>{{ setting }}</pre>

    <div>
      <button @click="showThis">this</button>
    </div>

    <v-btn color="primary">vuetify component</v-btn>
  </div>
</template>

<script>
const { VBtn } = window.vuetify$.components;

export default {
  name: 'ui',

  components: {
    VBtn,
  },

  data: () => ({
    msg: 'hello',
    input: '',
    setting: null,
  }),

  methods: {
    async readSetting() {
      this.setting = await window.getPluginSetting('translime-plugin-example');
    },
    showThis() {
      console.log(this);
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
