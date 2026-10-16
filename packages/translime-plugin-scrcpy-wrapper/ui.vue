<template>
  <mat-app-root
    :fill-viewport="false"
    class="h-full overflow-hidden"
  >
    <div class="flex h-full flex-col gap-3 overflow-hidden p-3">
      <!-- 顶部设备栏：左侧单选已保存设备，右侧添加/配对与刷新 -->
      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--mat-sys-color-outline-variant)] pb-2">
        <div class="flex min-w-0 grow items-center gap-2 overflow-x-auto py-0.5">
          <div
            v-if="devices.length === 0"
            class="text-sm text-[var(--mat-sys-color-on-surface-variant)]"
          >
            暂未添加设备，请点击右侧「添加设备」
          </div>
          <mat-btn-group
            v-else
            variant="connected"
            selection="single"
            :selected="serial"
            @select="onSelectDevice($event.nextSelected)"
          >
            <mat-btn
              v-for="device in devices"
              :key="device.serial"
              :value="device.serial"
              :prefix="device.wireless ? 'wifi' : 'smartphone'"
            >
              {{ deviceBtnLabel(device) }}
            </mat-btn>
          </mat-btn-group>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <mat-btn
            icon="add_link"
            label="添加设备"
            variant="text"
            class="shrink-0"
            @click="openPairDialog"
          />
          <mat-btn
            icon="refresh"
            label="刷新"
            variant="text"
            class="shrink-0"
            :loading="loadingDevices"
            @click="loadDevices"
          />
        </div>
      </div>

      <!-- 未选择设备提示 -->
      <div
        v-if="!serial"
        class="flex min-h-0 grow items-center justify-center text-sm text-[var(--mat-sys-color-on-surface-variant)]"
      >
        请在顶部选择设备，或点击右侧「添加设备」
      </div>

      <!-- 已选设备的内容区域 -->
      <template v-else>
        <!-- 快捷操作与设备专属设置行 -->
        <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <mat-btn
              variant="filled"
              :disabled="!isDeviceOnline || launching"
              :loading="launching"
              @click="launch('mirror')"
            >
              <template #prefix>
                cast
              </template>
              镜像整屏
            </mat-btn>
            <mat-btn
              v-if="selectedOfflineWireless"
              icon="link"
              label="连接设备"
              variant="tonal"
              :disabled="connecting"
              :loading="connecting"
              @click="connectSelected"
            />
            <mat-btn
              icon="delete"
              label="移除设备"
              variant="text"
              :disabled="forgetting"
              :loading="forgetting"
              @click="removeSelectedDevice"
            />
          </div>

          <!-- 码率与 FPS 设置 -->
          <div class="flex items-center gap-2">
            <mat-select
              v-model="bitRate"
              class="w-36"
              label="码率"
              :items="bitRateItems"
              @update:model-value="saveConfig"
            />
            <mat-select
              v-model="maxFps"
              class="w-32"
              label="最高帧率"
              :items="fpsItems"
              @update:model-value="saveConfig"
            />
          </div>
        </div>

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

        <div class="min-h-0 grow">
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
          <!-- 虚拟滚动：数百个应用包只渲染可见行 -->
          <mat-scroll-area
            v-else
            class="h-full"
            no-scroll-padding
          >
            <mat-list
              virtual
              interaction="multi-action"
              :items="filteredApps"
              :item-height="56"
              :item-key="(pkg) => pkg"
            >
              <template #default="{ item }">
                <mat-list-item :value="item">
                  {{ item }}
                  <template #trailing>
                    <mat-btn
                      icon="cast"
                      label="镜像"
                      size="small"
                      variant="standard"
                      :disabled="!isDeviceOnline || launching"
                      @click="launch('mirror', item)"
                    />
                    <mat-btn
                      icon="picture_in_picture"
                      label="虚拟屏"
                      size="small"
                      variant="standard"
                      :disabled="!isDeviceOnline || launching"
                      @click="launch('virtual', item)"
                    />
                  </template>
                </mat-list-item>
              </template>
            </mat-list>
          </mat-scroll-area>
        </div>
      </template>
    </div>

    <!-- 添加设备 / 配对弹窗 -->
    <mat-dialog
      v-model="pairOpen"
      title="添加设备"
      :width="460"
      close-on-back
    >
      <div class="flex flex-col gap-3 py-1">
        <!-- 上方：检测到的有线设备 (USB) -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-[var(--mat-sys-color-on-surface)]">
              检测到的有线设备 (USB)
            </span>
            <mat-btn
              icon="refresh"
              size="small"
              variant="text"
              :loading="loadingUsb"
              @click="loadUsbCandidates"
            />
          </div>

          <div
            v-if="usbCandidates.length === 0"
            class="rounded-lg bg-[var(--mat-sys-color-surface-container)] p-3 text-xs text-[var(--mat-sys-color-on-surface-variant)]"
          >
            {{ loadingUsb ? '正在检测 USB 连接设备...' : '未检测到在线的 USB 设备，请确认已开启 USB 调试并信任此电脑' }}
          </div>

          <div
            v-for="usb in usbCandidates"
            :key="usb.serial"
            class="flex items-center justify-between rounded-lg bg-[var(--mat-sys-color-surface-container)] px-3 py-2"
          >
            <div class="flex min-w-0 flex-col">
              <span class="truncate text-sm font-medium">{{ usb.model || 'Android 设备' }}</span>
              <span class="truncate text-xs text-[var(--mat-sys-color-on-surface-variant)]">{{ usb.serial }}</span>
            </div>
            <mat-btn
              v-if="!usb.stored"
              label="添加"
              size="small"
              variant="filled-tonal"
              :loading="addingSerial === usb.serial"
              @click="addUsbDevice(usb)"
            />
            <span
              v-else
              class="px-2 text-xs text-[var(--mat-sys-color-outline)]"
            >
              已添加
            </span>
          </div>
        </div>

        <mat-divider />

        <!-- 下方：无线调试配对 -->
        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold text-[var(--mat-sys-color-on-surface)]">
            无线调试配对
          </span>
          <p class="text-xs text-[var(--mat-sys-color-on-surface-variant)]">
            首次使用：手机进入 无线调试 → 使用配对码配对设备，按配对页显示的 IP:端口 和 6 位配对码填写。
            已配对设备：配对码留空，直接填 IP:端口 连接并保存。
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
const forgetting = ref(false);
const error = ref('');

// 设备专属配置
const bitRate = ref('16M');
const maxFps = ref(60);

const bitRateItems = [
  { title: '8 Mbps', value: '8M' },
  { title: '16 Mbps (推荐)', value: '16M' },
  { title: '24 Mbps', value: '24M' },
  { title: '32 Mbps (极高)', value: '32M' },
];

const fpsItems = [
  { title: '30 fps', value: 30 },
  { title: '60 fps (推荐)', value: 60 },
  { title: '90 fps', value: 90 },
  { title: '120 fps', value: 120 },
  { title: '不限制', value: 0 },
];

// 添加/配对弹窗状态
const pairOpen = ref(false);
const loadingUsb = ref(false);
const usbCandidates = ref([]);
const addingSerial = ref('');
const pairing = ref(false);
const pairError = ref('');
const createCodeForm = () => ({ address: '', pairingCode: '' });
const codeForm = ref(createCodeForm());

const currentDevice = computed(() => devices.value.find((d) => d.serial === serial.value) || null);

const isDeviceOnline = computed(() => {
  if (!currentDevice.value) {
    return false;
  }
  return currentDevice.value.connected !== false && currentDevice.value.state !== 'offline';
});

const selectedOfflineWireless = computed(() => Boolean(
  currentDevice.value?.wireless && !currentDevice.value?.connected,
));

const deviceBtnLabel = (device) => {
  const name = device.model || device.serial;
  if (!device.connected || device.state === 'offline') {
    return `${name} · 离线`;
  }
  return name;
};

const appEmptyText = computed(() => {
  if (!serial.value) {
    return '请在顶部选择设备';
  }
  if (!isDeviceOnline.value) {
    return selectedOfflineWireless.value ? '设备未连接，请点击上方「连接设备」' : '设备已离线';
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

const loadDeviceConfig = async (targetSerial) => {
  if (!targetSerial) {
    return;
  }
  try {
    const res = await ipc.invoke('get-device-config', targetSerial);
    if (res?.success && res.config) {
      bitRate.value = res.config.bitRate || '16M';
      maxFps.value = res.config.maxFps ?? 60;
    }
  } catch {
    // 忽略加载配置错误，使用默认值
  }
};

const saveConfig = async () => {
  if (!serial.value) {
    return;
  }
  try {
    await ipc.invoke('set-device-config', {
      serial: serial.value,
      config: {
        bitRate: bitRate.value,
        maxFps: maxFps.value,
      },
    });
  } catch {
    // 忽略保存配置异常
  }
};

const onSelectDevice = (nextSelected) => {
  if (nextSelected && nextSelected !== serial.value) {
    serial.value = nextSelected;
  }
};

const loadDevices = async () => {
  loadingDevices.value = true;
  error.value = '';
  try {
    const result = await ipc.invoke('list-devices');
    if (!result?.success) {
      throw new Error(result?.message || '获取设备列表失败');
    }
    devices.value = result.devices;
    const stillAvailable = result.devices.some((device) => device.serial === serial.value);
    if (!stillAvailable) {
      // 优先选择第一个在线设备，否则选第一个保存的设备
      const firstOnline = result.devices.find((d) => d.connected !== false && d.state !== 'offline');
      serial.value = firstOnline?.serial || (result.devices[0]?.serial ?? '');
    }
    if (serial.value) {
      await loadDeviceConfig(serial.value);
    }
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
  if (!serial.value || !isDeviceOnline.value) {
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
  if (!serial.value || launching.value || !isDeviceOnline.value) {
    return;
  }
  const rawResolution = currentDevice.value?.resolution
    ? {
      width: Number(currentDevice.value.resolution.width),
      height: Number(currentDevice.value.resolution.height),
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
    if (result.devices) {
      devices.value = result.devices;
    }
    if (result.serial && result.serial !== targetSerial) {
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

const removeSelectedDevice = async () => {
  if (!serial.value || forgetting.value) {
    return;
  }
  forgetting.value = true;
  error.value = '';
  try {
    const result = await ipc.invoke('remove-stored-device', { serial: serial.value });
    if (!result?.success) {
      throw new Error(result?.message || '移除失败');
    }
    serial.value = '';
    await loadDevices();
  } catch (e) {
    error.value = e.message;
  } finally {
    forgetting.value = false;
  }
};

const loadUsbCandidates = async () => {
  loadingUsb.value = true;
  try {
    const res = await ipc.invoke('list-usb-candidates');
    if (res?.success) {
      usbCandidates.value = res.devices || [];
    }
  } catch {
    usbCandidates.value = [];
  } finally {
    loadingUsb.value = false;
  }
};

const addUsbDevice = async (usb) => {
  addingSerial.value = usb.serial;
  try {
    const res = await ipc.invoke('add-stored-device', {
      serial: usb.serial,
      model: usb.model,
      type: 'usb',
    });
    if (res?.success) {
      pairOpen.value = false;
      await loadDevices();
      serial.value = usb.serial;
    }
  } catch {
    // 忽略错误
  } finally {
    addingSerial.value = '';
  }
};

const openPairDialog = () => {
  codeForm.value = createCodeForm();
  pairError.value = '';
  pairOpen.value = true;
  loadUsbCandidates();
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
    pairOpen.value = false;
    await loadDevices();
    if (result.serial) {
      serial.value = result.serial;
    }
  } catch (e) {
    pairError.value = e.message;
  } finally {
    pairing.value = false;
  }
};

watch(serial, (newVal) => {
  keyword.value = '';
  if (newVal) {
    loadDeviceConfig(newVal);
    loadApps();
  } else {
    apps.value = [];
  }
});

onMounted(loadDevices);
</script>

<style>
@layer tailwind {
  @layer theme, utilities;
  @import 'tailwindcss/theme.css' layer(theme);
  @import 'tailwindcss/utilities.css' layer(utilities);
}
</style>
