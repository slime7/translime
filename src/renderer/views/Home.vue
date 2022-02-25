<template>
  <v-container class="home">
    <div class="d-flex flex-column justify-center">
      <h1>translime</h1>

      <HelloWorld v-if="isDev" msg="Hello Vue 2 + Vite" />
    </div>
  </v-container>
</template>

<script>
import mixins from '@/mixins';
import HelloWorld from '../components/HelloWorld.vue';

export default {
  name: 'Home',

  components: {
    HelloWorld,
  },

  mixins: [mixins],
};
</script>
