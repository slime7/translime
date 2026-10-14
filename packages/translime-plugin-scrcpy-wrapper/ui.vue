<template>
  <div class="plugin-main">
    <div class="toolbar">
      <select
        v-model="serial"
        class="device-select"
        :disabled="loadingDevices || devices.length === 0"
        aria-label="选择设备"
      >
        <option v-for="device in devices" :key="device.serial" :value="device.serial">
          {{ device.model ? `${device.model} (${device.serial})` : device.serial }}
        </option>
      </select>
      <mat-btn
        icon="refresh"
        label="刷新设备"
        :disabled="loadingDevices"
        @click="loadDevices"
      />
      <mat-btn
        icon="smartphone"
        label="镜像整屏"
        :disabled="!serial || launching"
        @click="launch('mirror')"
      />
    </div>

    <div v-if="error" class="error" role="alert">{{ error }}</div>

    <div class="filter-row">
      <input
        v-model="keyword"
        class="filter-input"
        type="text"
        placeholder="过滤应用包名"
        aria-label="过滤应用包名"
      >
    </div>

    <div v-if="loadingApps" class="hint">加载应用列表…</div>
    <div v-else-if="apps.length === 0" class="hint">{{ serial ? '未获取到应用列表' : '请先连接设备' }}</div>
    <ul v-else class="app-list">
      <li v-for="pkg in filteredApps" :key="pkg" class="app-item">
        <span class="pkg">{{ pkg }}</span>
        <span class="actions">
          <mat-btn
            icon="screen_mirror"
            label="镜像"
            :disabled="launching"
            @click="launch('mirror', pkg)"
          />
          <mat-btn
            icon="monitor"
            label="虚拟屏"
            :disabled="launching"
            @click="launch('virtual', pkg)"
          />
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useIpc } from 'translime-sdk';

defineOptions({
  name: 'ScrcpyWrapperUi',
});

const id = 'translime-plugin-scrcpy-wrapper';
const ipc = useIpc(id);

const devices = ref([]);
const serial = ref('');
const apps = ref([]);
const keyword = ref('');
const loadingDevices = ref(false);
const loadingApps = ref(false);
const launching = ref(false);
const error = ref('');

const filteredApps = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) {
    return apps.value;
  }
  return apps.value.filter((pkg) => pkg.toLowerCase().includes(kw));
});

const loadDevices = async () => {
  loadingDevices.value = true;
  error.value = '';
  try {
    const result = await ipc.invoke('list-devices');
    if (!result?.success) {
      throw new Error(result?.message || '获取设备列表失败');
    }
    devices.value = result.devices;
    serial.value = devices.value.length > 0 ? devices.value[0].serial : '';
  } catch (e) {
    devices.value = [];
    serial.value = '';
    apps.value = [];
    error.value = e.message;
  } finally {
    loadingDevices.value = false;
  }
};

const loadApps = async () => {
  if (!serial.value) {
    apps.value = [];
    return;
  }
  loadingApps.value = true;
  error.value = '';
  try {
    const result = await ipc.invoke('list-apps', serial.value);
    if (!result?.success) {
      throw new Error(result?.message || '获取应用列表失败');
    }
    apps.value = result.packages;
  } catch (e) {
    apps.value = [];
    error.value = e.message;
  } finally {
    loadingApps.value = false;
  }
};

const launch = async (mode, pkg = null) => {
  if (!serial.value || launching.value) {
    return;
  }
  launching.value = true;
  error.value = '';
  try {
    const result = await ipc.invoke('launch', { mode, serial: serial.value, pkg });
    if (!result?.success) {
      throw new Error(result?.message || '启动失败');
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    launching.value = false;
  }
};

watch(serial, () => {
  keyword.value = '';
  loadApps();
});

onMounted(loadDevices);
</script>

<style scoped>
.plugin-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
}

.toolbar {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
}

.device-select {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 8px;
  background: transparent;
  color: inherit;
}

.error {
  flex: none;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(179, 38, 30, 0.15);
  color: #f2b8b5;
  font-size: 13px;
  word-break: break-all;
}

.filter-row {
  display: flex;
  flex: none;
}

.filter-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 8px;
  background: transparent;
  color: inherit;
}

.hint {
  flex: none;
  padding: 24px 0;
  color: rgba(128, 128, 128, 1);
  text-align: center;
  font-size: 13px;
}

.app-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.app-item {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 8px;
}

.app-item:hover {
  background: rgba(128, 128, 128, 0.12);
}

.pkg {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  display: flex;
  flex: none;
  gap: 4px;
}
</style>
