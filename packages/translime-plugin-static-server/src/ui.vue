<template>
  <v-container fluid class="plugin-main">
    <v-row>
      <v-col
        v-for="server in servers"
        :key="server.port"
        cols="3"
      >
        <v-card
          class="rounded-2xl h-full"
          rounded
        >
          <v-card-text class="flex flex-col">
            <div>{{ server.path }}</div>
            <a href="javascript:;" @click="open(server.port)">:{{ server.port }}</a>
          </v-card-text>

          <v-card-actions>
            <v-spacer />
            <v-btn @click="open(server.port)">
              查看
            </v-btn>
            <v-btn @click="closeServer(server.port)">
              关闭
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col cols="3">
        <v-card link class="server-card" @click="newServer">
          <div class="h-full flex items-center justify-center">
            <v-icon size="64">
              add
            </v-icon>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <template v-if="displayHistoryServers.length">
      <div class="select-none text-lg my-2">
        <span>历史记录</span>
        <v-btn
          class="ml-2"
          small
          outlined
          @click="clearHistory"
        >
          清空
        </v-btn>
      </div>

      <div class="flex flex-wrap gap-2">
        <div
          v-for="server in displayHistoryServers"
          :key="server.path"
          class="shrink-0"
        >
          <v-btn
            class="text-one-line select-none"
            variant="tonal"
            @click="openServerIpc(server.path)"
          >
            {{ server.path }}
            <v-tooltip activator="parent" :text="server.path" location="top" />
          </v-btn>
        </div>
      </div>
    </template>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';

defineOptions({
  name: 'Ui',
});

const {
  VContainer, VRow, VCol, VCard, VCardText, VCardActions, VSpacer, VBtn, VIcon, VTooltip,
} = window.vuetify$.components;
const ipc = window.electron.useIpc();

const servers = ref([]);
const historyServers = ref([]);

/**
 * 排序逻辑：优先按频率降序，频率相同时按最后使用时间降序
 * @param {object} a
 * @param {object} b
 */
const sortComparator = (a, b) => (b.count - a.count) || (b.lastUsed - a.lastUsed);

const displayHistoryServers = computed(() => {
  const list = [...historyServers.value];
  if (list.length <= 8) return list;

  // 获取前8个自然排序的记录
  const top8 = list.slice(0, 8);

  // 找到最近使用的一条记录
  let mostRecent = list[0];
  for (let i = 1; i < list.length; i += 1) {
    if (list[i].lastUsed > mostRecent.lastUsed) {
      mostRecent = list[i];
    }
  }

  // 如果最近使用的记录不在前8中，替换第8条，确保新记录可见
  if (!top8.find((s) => s.path === mostRecent.path)) {
    return [...top8.slice(0, 7), mostRecent];
  }

  return top8;
});

const addHistoryServers = (serverPath) => {
  const now = Date.now();
  const ind = historyServers.value.findIndex((server) => server.path === serverPath);

  if (ind === -1) {
    historyServers.value.push({
      path: serverPath,
      count: 1,
      lastUsed: now,
    });
  } else {
    historyServers.value[ind].count += 1;
    historyServers.value[ind].lastUsed = now;
  }

  // 排序并保留最多16条
  historyServers.value.sort(sortComparator);
  if (historyServers.value.length > 16) {
    historyServers.value.pop();
  }

  localStorage.setItem('translime-plugin-static-server:history', JSON.stringify(historyServers.value));
};

const getHistoryServers = () => {
  try {
    const raw = localStorage.getItem('translime-plugin-static-server:history');
    const history = JSON.parse(raw || '[]');
    // 兼容旧数据，补全 lastUsed
    historyServers.value = history.map((s) => ({
      ...s,
      lastUsed: s.lastUsed || 0,
    })).sort(sortComparator);
  } catch (err) {
    historyServers.value = [];
  }
};

const clearHistory = () => {
  historyServers.value = [];
  localStorage.removeItem('translime-plugin-static-server:history');
};

const openServerIpc = async (serverPath) => {
  const port = await ipc.invoke('new-server@translime-plugin-static-server', serverPath);
  servers.value.push({
    port: +port,
    path: serverPath,
  });
  addHistoryServers(serverPath);
};

const newServer = async () => {
  const result = await window.electron.dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (!result.canceled) {
    await openServerIpc(result.filePaths[0]);
  }
};

const closeServer = async (port) => {
  await ipc.invoke('close-server@translime-plugin-static-server', port);
};

const onServerClose = () => {
  ipc.on('server-closed@translime-plugin-static-server', (data) => {
    servers.value = servers.value.filter((server) => +server.port !== +data.port);
  });
};

const getServers = async () => {
  servers.value = await ipc.invoke('get-server-list@translime-plugin-static-server');
};

const open = (port) => {
  ipc.send('open-link', { url: `http://localhost:${port}` });
};

onMounted(() => {
  getServers();
  onServerClose();
  getHistoryServers();
});
</script>

<style>
/* 引入 Tailwind CSS utilities，放入 tailwind 图层以与主程序统一 */
@layer tailwind {
  @layer theme, utilities;
  @import 'tailwindcss/theme.css' layer(theme);
  @import 'tailwindcss/utilities.css' layer(utilities);
}
</style>

<style scoped>
.server-card {
  height: 100%;
  min-height: 120px;
}

.text-one-line {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.select-none {
  user-select: none;
}
</style>
