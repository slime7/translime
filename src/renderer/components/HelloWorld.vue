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

    <v-btn @click="countIncrease" color="primary">
      <v-icon>favorite</v-icon>
      <span>count is: {{ count }}</span>
    </v-btn>

    <v-btn @click="resetCount" class="ml-4" color="primary">
      <span>reset count</span>
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
import { onMounted } from 'vue';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import { useState } from '@/utils';

export default {
  props: {
    msg: String,
  },

  setup() {
    const ipc = useIpc();

    // react 风格的 state
    const [count, setCount] = useState(0);
    const countIncrease = () => setCount((c) => c + 1);
    const resetCount = () => setCount(0);
    // 测试数组
    const [arr, setArr] = useState([]);
    console.log('arr', JSON.stringify(arr));
    setArr((a) => a.push(1));
    console.log('arr', JSON.stringify(arr));
    // 测试 object
    const [obj, setObj] = useState({ foo: 'bar' });
    console.log('obj', JSON.stringify(obj));
    setObj({ a: 'xxx' });
    console.log('obj', JSON.stringify(obj));

    const openChildWindow = () => {
      ipc.send(ipcType.OPEN_NEW_WINDOW, {
        name: 'childWinTest',
        options: { frame: true },
      });
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
      countIncrease,
      resetCount,
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
