<template>
  <div class="plugin-main">
    <div class="red">
      plugin content {{ msg }} {{ input }}
    </div>

    <div>
      <input v-model="input">
    </div>

    <pre>{{ setting }}</pre>

    <mat-btn variant="filled" color="primary" @click="callTestIpc">
      call test-ipc
    </mat-btn>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import {
  getPluginSetting,
  useIpc,
} from 'translime-sdk';

defineOptions({
  name: 'UiExample',
});

const id = 'translime-plugin-example';
// useIpc 传入插件 ID 后，事件名自动补全 `@插件ID` 后缀，
// 无需再手拼 'test-ipc@translime-plugin-example' 字符串
const ipc = useIpc(id);

const setting = ref({});
const input = ref('');
const msg = ref('hello');

const callTestIpc = async () => {
  // 对应主进程 ipcHandlers 中的 'test-ipc'
  const result = await ipc.invoke('test-ipc', 'hello from ui', 123);
  // eslint-disable-next-line no-console
  console.log('test-ipc result:', result);

  // 接收主进程 sendToClient('test-ipc-reply@插件ID') 的主动推送
  ipc.on('test-ipc-reply', (data) => {
    // eslint-disable-next-line no-console
    console.log('test-ipc-reply:', data);
  });
};

onMounted(async () => {
  setting.value = await getPluginSetting(id);
});
</script>

<style scoped>
.plugin-main .red {
  color: red;
}
</style>
