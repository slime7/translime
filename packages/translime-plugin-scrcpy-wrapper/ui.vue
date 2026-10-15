<template>
  <mat-app-root
    :fill-viewport="false"
    class="h-full overflow-hidden"
  >
    <!-- 页面只保留列表一个滚动容器，避免双滚动条叠加 -->
    <div class="flex h-full flex-col gap-3 overflow-hidden p-3">
      <!-- 设备行：下拉占满剩余宽度，操作按钮不压缩 -->
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
        <mat-btn
          icon="wifi_tethering"
          label="无线配对"
          variant="text"
          class="shrink-0"
          @click="openPairDialog"
        />
        <mat-btn
          v-if="selectedOfflineWireless"
          icon="link"
          label="连接"
          variant="text"
          class="shrink-0"
          :disabled="connecting"
          :loading="connecting"
          @click="connectSelected"
        />
        <mat-btn
          v-if="selectedStoredWireless"
          icon="link_off"
          label="移除设备"
          variant="text"
          class="shrink-0"
          :disabled="forgetting"
          :loading="forgetting"
          @click="forgetWireless"
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
          {{ appEmptyText }}
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

    <mat-dialog
      v-model="pairOpen"
      title="无线调试配对"
      :width="420"
      close-on-back
    >
      <div class="flex flex-col gap-3 py-1">
        <p class="text-sm text-[var(--mat-sys-color-on-surface-variant)]">
          首次使用：手机进入 无线调试 → 使用配对码配对设备，按配对页显示的 IP:端口 和 6 位配对码填写。
          已配对过的设备：配对码留空，直接填无线调试主页显示的 IP:端口 即可连接。
          连接成功后会自动保存设备，可能需要数十秒。
        </p>
        <mat-text-field
          v-model="codeForm.address"
          block
          label="IP:端口"
          placeholder="192.168.1.5:37849"
          :disabled="pairing"
        />
        <mat-text-field
          v-model="codeForm.pairingCode"
          block
          label="配对码（已配对设备可留空）"
          placeholder="留空则跳过配对直接连接"
          :disabled="pairing"
          :max-length="6"
        />
        <div
          v-if="pairError"
          role="alert"
          class="rounded-lg bg-[var(--mat-sys-color-error-container)] px-3 py-2 text-sm break-all text-[var(--mat-sys-color-on-error-container)]"
        >
          {{ pairError }}
        </div>
      </div>
      <template #actions>
        <mat-spacer />
        <mat-btn
          variant="text"
          :disabled="pairing"
          @click="pairOpen = false"
        >
          取消
        </mat-btn>
        <mat-btn
          variant="filled"
          :loading="pairing"
          @click="pairByCode"
        >
          {{ codeForm.pairingCode.trim() ? '配对并连接' : '直接连接' }}
        </mat-btn>
      </template>
    </mat-dialog>
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
const connecting = ref(false);
const error = ref('');

const createCodeForm = () => ({ address: '', pairingCode: '' });

const pairOpen = ref(false);
const pairing = ref(false);
const pairError = ref('');
const codeForm = ref(createCodeForm());
const forgetting = ref(false);

const deviceItems = computed(() => devices.value.map((device) => {
  const base = device.model ? `${device.model} (${device.serial})` : device.serial;
  return {
    title: device.wireless && !device.connected ? `${base} · 未连接` : base,
    value: device.serial,
  };
}));

const selectedStoredWireless = computed(() => devices.value.some(
  (device) => device.serial === serial.value && device.stored && device.wireless,
));

const selectedOfflineWireless = computed(() => devices.value.some(
  (device) => device.serial === serial.value && device.wireless && !device.connected,
));

const appEmptyText = computed(() => {
  if (!serial.value) {
    return '请先连接设备';
  }
  if (selectedOfflineWireless.value) {
    return '设备未连接，请点击上方「连接」';
  }
  return '未获取到应用列表';
});

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
    // 刷新保留当前选择（含已保存但离线的无线设备），仅在无效时回落到首台设备
    const stillAvailable = result.devices.some((device) => device.serial === serial.value);
    serial.value = stillAvailable && serial.value
      ? serial.value
      : (result.devices[0]?.serial ?? '');
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
  // 已保存但离线的无线设备先等用户手动连接，直接拉列表只会报 device not found
  if (!serial.value || selectedOfflineWireless.value) {
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
  const currentDevice = devices.value.find((d) => d.serial === serial.value);
  const rawResolution = currentDevice?.resolution
    ? {
      width: Number(currentDevice.resolution.width),
      height: Number(currentDevice.resolution.height),
    }
    : null;
  launching.value = true;
  error.value = '';
  try {
    const result = await ipc.invoke('launch', {
      mode,
      serial: serial.value,
      pkg,
      resolution: rawResolution,
    });
    if (!result?.success) {
      throw new Error(result?.message || '启动失败');
    }
    // 已保存的无线设备端口变化时主进程会重连并回报实际 serial
    if (result.serial && result.serial !== serial.value) {
      serial.value = result.serial;
      await loadDevices();
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    launching.value = false;
  }
};

// 手动重连选中的已存无线设备（端口变化时主进程回报实际 serial 并更新保存记录）
const connectSelected = async () => {
  if (!serial.value || connecting.value) {
    return;
  }
  const targetSerial = serial.value;
  connecting.value = true;
  error.value = '';
  try {
    const result = await ipc.invoke('connect-wireless', { serial: targetSerial });
    if (!result?.success) {
      throw new Error(result?.message || '连接失败');
    }
    if (serial.value !== targetSerial) {
      return;
    }
    if (result.devices) {
      devices.value = result.devices;
    }
    if (result.serial && result.serial !== targetSerial) {
      // 端口已变化：切换到实际 serial，watch 会自动加载应用列表
      serial.value = result.serial;
      return;
    }
    await loadApps();
  } catch (e) {
    error.value = e.message;
  } finally {
    connecting.value = false;
  }
};

const openPairDialog = () => {
  codeForm.value = createCodeForm();
  pairError.value = '';
  pairOpen.value = true;
};

const applyPairSuccess = async (result) => {
  pairOpen.value = false;
  await loadDevices();
  if (result.serial) {
    serial.value = result.serial;
  }
};

const pairByCode = async () => {
  if (pairing.value) {
    return;
  }
  pairing.value = true;
  pairError.value = '';
  try {
    const result = await ipc.invoke('pair-wireless', {
      address: codeForm.value.address.trim(),
      pairingCode: codeForm.value.pairingCode.trim(),
    });
    if (!result?.success) {
      throw new Error(result?.message || '配对失败');
    }
    await applyPairSuccess(result);
  } catch (e) {
    pairError.value = e.message;
  } finally {
    pairing.value = false;
  }
};

const forgetWireless = async () => {
  if (!serial.value || forgetting.value) {
    return;
  }
  forgetting.value = true;
  error.value = '';
  try {
    const result = await ipc.invoke('remove-wireless', { serial: serial.value });
    if (!result?.success) {
      throw new Error(result?.message || '移除失败');
    }
    await loadDevices();
  } catch (e) {
    error.value = e.message;
  } finally {
    forgetting.value = false;
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
