<template>
  <div class="plugin-main">
    <div class="red">
      plugin content {{ msg }} {{ input }}
    </div>

    <div>
      <input v-model="input">
    </div>

    <pre>{{ setting }}</pre>

    <v-btn color="primary" @click="showVuetify">
      vuetify component
    </v-btn>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import {
  getPluginSetting,
  useVuetifyComponents,
  useVuetifyDirectives,
} from 'translime-sdk';

defineOptions({
  name: 'UiExample',
});

const setting = ref({});
const input = ref('');
const msg = ref('hello');
const showVuetify = () => {
  console.log(useVuetifyComponents(), useVuetifyDirectives());
};

onMounted(async () => {
  setting.value = await getPluginSetting('translime-plugin-example');
});
</script>

<style scoped lang="scss">
.plugin-main {
  .red {
    color: red;
  }
}
</style>
