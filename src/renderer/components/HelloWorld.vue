<template>
  <div>

    <h1>{{ msg }}</h1>

    <p>
      <a
        href="https://vitejs.dev/guide/features.html"
        target="_blank"
      >Vite Documentation</a> |
      <a
        href="https://vuejs.org/v2/guide/"
        target="_blank"
      >Vue 2 Documentation</a>
    </p>

    <v-btn @click="count++" color="primary">
      <v-icon>favorite</v-icon>
      <span>count is: {{ count }}</span>
    </v-btn>

    <v-btn @click="openChildWindow" class="ml-4" color="primary">
      open child window
    </v-btn>

    <v-btn @click="getVersions" class="ml-4" color="primary">
      ipc test
    </v-btn>

    <p>
      Edit
      <code>components/HelloWorld.vue</code> to test hot module replacement.
    </p>
  </div>
</template>

<script>
import { ref, onMounted } from '@vue/composition-api';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';

export default {
  props: {
    msg: String,
  },

  setup() {
    const ipc = useIpc();

    const count = ref(0);

    const openChildWindow = () => {
      ipc.send(ipcType.OPEN_NEW_WINDOW, { name: 'childWinTest' });
    };
    const getVersions = () => {
      ipc.send(ipcType.APP_VERSIONS);
    };
    const onGetVersions = () => {
      ipc.on(ipcType.APP_VERSIONS, (versions) => {
        console.log(versions);
      });
    };

    onMounted(() => {
      onGetVersions();
    });

    return {
      count,
      openChildWindow,
      getVersions,
    };
  },
};
</script>

<style scoped>
a {
  color: #42b983;
}
</style>
