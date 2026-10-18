<template>
  <mat-container class="plugin-main">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <mat-card
        v-for="server in servers"
        :key="server.port"
        class="rounded-2xl h-full"
      >
        <mat-card-content class="flex flex-col">
          <div>{{ server.path }}</div>
          <a href="javascript:;" @click="open(server.port)">:{{ server.port }}</a>
        </mat-card-content>

        <mat-card-actions>
          <mat-btn variant="text" @click="open(server.port)">
            查看
          </mat-btn>
          <mat-btn variant="text" @click="closeServer(server.port)">
            关闭
          </mat-btn>
        </mat-card-actions>
      </mat-card>

      <mat-card class="server-card rounded-2xl">
        <mat-card-action-area
          class="w-full h-full flex items-center justify-center"
          aria-label="新建服务器"
          @click="newServer"
        >
          <mat-icon icon="add" size="64px" />
        </mat-card-action-area>
      </mat-card>
    </div>

    <template v-if="displayHistoryServers.length">
      <div class="select-none text-lg my-2 flex items-center gap-2">
        <span>历史记录</span>
        <mat-btn
          size="extra-small"
          variant="outlined"
          @click="clearHistory"
        >
          清空
        </mat-btn>
      </div>

      <div class="flex flex-wrap gap-2">
        <mat-tooltip
          v-for="server in displayHistoryServers"
          :key="server.path"
          :content="server.path"
          location="top"
        >
          <template #activator>
            <mat-btn
              class="text-one-line max-w-64"
              variant="filled-tonal"
              @click="openServerIpc(server.path)"
            >
              {{ server.path }}
            </mat-btn>
          </template>
        </mat-tooltip>
      </div>
    </template>
  </mat-container>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';

defineOptions({
  name: 'Ui',
});

const {
  MatContainer, MatCard, MatCardContent, MatCardActions, MatCardActionArea,
  MatBtn, MatIcon, MatTooltip,
} = window.mde$.components;
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
