<template>
  <mat-app-root
    :fill-viewport="false"
    class="h-full overflow-hidden"
  >
    <!-- 页面只保留列表一个滚动容器，避免双滚动条叠加 -->
    <div class="flex h-full flex-col gap-3 overflow-hidden p-3">
      <!-- 设备行：下拉占满剩余宽度，刷新按钮不压缩 -->
      <div class="flex shrink-0 items-center gap-2">
        <mat-select
          v-model="serial"
          class="min-w-0 grow"
          block
          label="设备"
          placeholder="选择设备"
          :items="deviceItems"
          :disabled="loadingDevices || devices.length === 0"
        />
        <mat-btn
          icon="refresh"
          label="刷新设备"
          variant="text"
          class="shrink-0"
          :loading="loadingDevices"
          @click="loadDevices"
        />
      </div>

      <mat-btn
        variant="filled"
        class="shrink-0 self-start"
        :disabled="!serial || launching"
        :loading="launching"
        @click="launch('mirror')"
      >
        <template #prefix>
          cast
        </template>
        镜像整屏
      </mat-btn>

      <div
        v-if="error"
        role="alert"
        class="shrink-0 rounded-lg bg-[var(--mat-sys-color-error-container)] px-3 py-2 text-sm break-all text-[var(--mat-sys-color-on-error-container)]"
      >
        {{ error }}
      </div>

      <mat-search
        v-model="keyword"
        class="shrink-0"
        label="过滤应用包名"
        placeholder="过滤应用包名"
      />

      <div class="min-h-0 grow overflow-y-auto">
        <div
          v-if="loadingApps"
          class="flex h-full items-center justify-center"
        >
          <mat-progress
            indeterminate
            class="w-48"
            aria-label="加载应用列表"
          />
        </div>
        <div
          v-else-if="apps.length === 0"
          class="flex h-full items-center justify-center text-sm text-[var(--mat-sys-color-on-surface-variant)]"
        >
          {{ serial ? '未获取到应用列表' : '请先连接设备' }}
        </div>
        <div
          v-else-if="filteredApps.length === 0"
          class="flex h-full items-center justify-center text-sm text-[var(--mat-sys-color-on-surface-variant)]"
        >
          无匹配应用
        </div>
        <mat-list
          v-else
          interaction="multi-action"
        >
          <mat-list-item
            v-for="pkg in filteredApps"
            :key="pkg"
            :value="pkg"
          >
            {{ pkg }}
            <template #trailing>
              <mat-btn
                icon="cast"
                label="镜像"
                size="small"
                variant="standard"
                :disabled="launching"
                @click="launch('mirror', pkg)"
              />
              <mat-btn
                icon="picture_in_picture"
                label="虚拟屏"
                size="small"
                variant="standard"
                :disabled="launching"
                @click="launch('virtual', pkg)"
              />
            </template>
          </mat-list-item>
        </mat-list>
      </div>
    </div>
  </mat-app-root>
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

const deviceItems = computed(() => devices.value.map((device) => ({
  title: device.model ? `${device.model} (${device.serial})` : device.serial,
  value: device.serial,
})));

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

<!-- 不引入 Preflight：插件样式经宿主 @scope 隔离注入，重置层会破坏 mde 组件基础样式 -->
<style>
@layer tailwind {
  @layer theme, utilities;
  @import 'tailwindcss/theme.css' layer(theme);
  @import 'tailwindcss/utilities.css' layer(utilities);
}
</style>
