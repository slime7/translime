<template>
  <v-container fluid class="plugin-main">
    <v-row>
      <v-col
        v-for="server in servers"
        :key="server.port"
        cols="3"
      >
        <v-card class="fill-height d-flex flex-column">
          <v-card-text>
            <div>{{ server.path }}</div>
            <div>:{{ server.port }}</div>
          </v-card-text>

          <v-spacer />

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
        <v-card link class="server-card d-flex align-center justify-center" @click="newServer">
          <v-icon>add</v-icon>
        </v-card>
      </v-col>
    </v-row>

    <template v-if="historyServers.length">
      <div class="select-none text-subtitle-1 my-2">
        <span>历史记录</span>
        <v-btn
          class="ml-2"
          x-small
          outlined
          @click="clearHistory"
        >
          清空
        </v-btn>
      </div>

      <v-row>
        <v-col
          v-for="server in historyServers"
          :key="server.path"
          cols="3"
        >
          <v-btn
            class="text-one-line select-none"
            variant="tonal"
            block
            @click="openServerIpc(server.path)"
          >
            {{ server.path }}
            <v-tooltip activator="parent" :text="server.path" location="top" />
          </v-btn>
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

<script>
const vuetify = window.vuetify$.components;
const ipc = window.electron.useIpc();

export default {
  name: 'Ui',

  components: {
    ...vuetify,
  },

  data: () => ({
    servers: [],
    historyServers: [],
  }),

  methods: {
    async newServer() {
      const result = await window.electron.dialog.showOpenDialog({
        properties: ['openDirectory'],
      });
      if (!result.data.canceled) {
        await this.openServerIpc(result.data.filePaths[0]);
      }
    },
    async openServerIpc(serverPath) {
      const port = await ipc.invoke('new-server@translime-plugin-static-server', serverPath);
      this.servers.push({
        port: +port,
        path: serverPath,
      });
      this.addHistoryServers(serverPath);
    },
    async closeServer(port) {
      await ipc.invoke('close-server@translime-plugin-static-server', port);
    },
    onServerClose() {
      ipc.on('server-closed@translime-plugin-static-server', (data) => {
        this.servers = this.servers.filter((server) => +server.port !== +data.port);
      });
    },
    open(port) {
      ipc.send('open-link', { url: `http://localhost:${port}` });
    },
    async getServers() {
      this.servers = await ipc.invoke('get-server-list@translime-plugin-static-server');
    },
    addHistoryServers(serverPath) {
      const ind = this.historyServers.findIndex((server) => server.path === serverPath);
      if (ind === -1) {
        this.historyServers.push({
          path: serverPath,
          count: 1,
        });
      } else {
        this.historyServers[ind].count += 1;
      }
      this.historyServers = this.historyServers.sort((a, b) => b.count - a.count);
      if (this.historyServers.length > 8) {
        this.historyServers.pop();
      }
      localStorage.setItem('translime-plugin-static-server:history', JSON.stringify(this.historyServers));
    },
    getHistoryServers() {
      try {
        const historyServers = JSON.parse(localStorage.getItem('translime-plugin-static-server:history') || '[]');
        this.historyServers = historyServers.sort((a, b) => b.count - a.count);
      } catch (err) {
        this.historyServers = [];
      }
    },
    clearHistory() {
      this.historyServers = [];
      localStorage.removeItem('translime-plugin-static-server:history');
    },
  },

  mounted() {
    this.getServers();
    this.onServerClose();
    this.getHistoryServers();
  },
};
</script>

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
