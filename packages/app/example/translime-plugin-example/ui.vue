<template>
  <div class="plugin-main">
    <div class="red">plugin content {{ msg }} {{ input }}</div>

    <div>
      <input v-model="input" />
    </div>

    <pre>{{ setting }}</pre>

    <v-btn color="primary" @click="showVuetify">vuetify component</v-btn>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const { VBtn } = window.vuetify$.components;

const setting = ref({});
const msg = ref('hello');
const showVuetify = () => {
  console.log(window.vuetify$);
};

onMounted(async () => {
  setting.value = await window.ts.getPluginSetting('translime-plugin-example');
});
</script>

<script>
export default {
  name: 'plugin-ui',

  data: () => ({
    input: '',
  }),
};
</script>

<style scoped lang="scss">
.plugin-main {
  .red {
    color: red;
  }
}
</style>
